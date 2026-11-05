import assert from "node:assert/strict";
import { test } from "node:test";

import type { Node } from "../src/usage/vendor/tree-sitter/tree-sitter.js";
import type { SymbolUsageMatcher } from "../src/domain.js";
import { required } from "../src/required.js";
import { analyzeJavaScriptFile } from "../src/usage/javascript.js";
import { symbolUsages, type SymbolBinding, type SymbolOccurrence } from "../src/usage/symbols.js";
import { lineLocator, parseSource } from "../src/usage/tree-sitter.js";

const source = `new Thing();
Thing();
fs.rmdir("d", { recursive: true });
fs.rmdir("d", cb);
`;

test("symbolUsages reports an occurrence only when its role matches the matcher's shape", async () => {
  const tree = required(await parseSource("javascript", source), "parsed source");
  const locate = lineLocator(source);
  const nodes = (type: string, text: string): Node[] =>
    tree.rootNode.descendantsOfType(type).filter((node): node is Node => node?.text === text);
  const [construct, call] = nodes("identifier", "Thing");
  const [fsCall, fsCallWithoutOptions] = nodes("identifier", "fs");
  const [recursive] = nodes("property_identifier", "recursive");
  const occurrences: SymbolOccurrence[] = [
    {
      head: required(construct, "construct head"),
      path: ["Thing"],
      role: "construct",
    },
    { head: required(call, "call head"), path: ["Thing"], role: "call" },
    {
      head: required(fsCall, "fs head"),
      path: ["fs", "rmdir"],
      role: "call",
      options: [new Map(), new Map([["recursive", required(recursive, "recursive key")]])],
    },
    {
      head: required(fsCallWithoutOptions, "fs head"),
      path: ["fs", "rmdir"],
      role: "call",
      options: [new Map(), new Map()],
    },
  ];
  const bindings: SymbolBinding[] = [{ module: "fs", local: "fs", imported: "*" }];
  const describe = (node: Node) => ({
    location: { path: "x.js", ...locate(node.startIndex) },
    excerpt: "",
  });
  const run = (matcher: SymbolUsageMatcher) =>
    symbolUsages([matcher], occurrences, bindings, describe, {
      language: "javascript",
    }).map((usage) => `${usage.location.line}:${usage.location.column} ${usage.symbol}`);

  assert.deepEqual(
    run({
      kind: "symbol",
      language: "javascript",
      symbol: "Thing",
      shape: "construct",
    }),
    ["1:5 Thing"],
  );
  assert.deepEqual(
    run({
      kind: "symbol",
      language: "javascript",
      symbol: "Thing",
      shape: "call",
    }),
    ["2:1 Thing"],
  );
  assert.deepEqual(
    run({
      kind: "symbol",
      language: "javascript",
      symbol: "Thing",
      shape: "reference",
    }),
    [],
  );
  assert.deepEqual(
    run({
      kind: "symbol",
      language: "javascript",
      module: "fs",
      symbol: "rmdir",
      shape: "option",
      option: "recursive",
      argument: 1,
    }),
    ["3:17 fs.rmdir(recursive)"],
  );
  assert.deepEqual(
    run({
      kind: "symbol",
      language: "javascript",
      module: "fs",
      symbol: "rmdir",
      shape: "method",
    }),
    [],
  );
});

test("a reference is reported once, at the head of a member read that is not called", async () => {
  const result = await analyzeJavaScriptFile(
    {
      path: "x.js",
      language: "javascript",
      source: `import * as fs from "fs";\nconst f = fs.exists;\nfs.exists("a");\n`,
    },
    [
      {
        id: "r",
        matchers: [
          {
            kind: "symbol",
            language: "javascript",
            module: "fs",
            symbol: "exists",
            shape: "reference",
          },
        ],
      },
    ],
  );
  assert.deepEqual(
    (result?.get("r") ?? []).map((usage) => `${usage.location.line}:${usage.location.column} ${usage.symbol}`),
    ["2:11 fs.exists"],
  );
});

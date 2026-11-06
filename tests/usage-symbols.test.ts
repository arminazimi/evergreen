import assert from "node:assert/strict";
import { test } from "node:test";

import type { SourceUsage, SymbolUsageMatcher } from "../src/domain.js";
import { analyzeJavaScriptFile, javaScriptOccurrences } from "../src/usage/javascript.js";
import { analyzePythonFile } from "../src/usage/python.js";
import { symbolUsages, type SymbolBinding } from "../src/usage/symbols.js";
import { UsageList } from "../src/usage/usage-results.js";
import { lineLocator, maximumParseBytes, parseSource } from "../src/usage/tree-sitter.js";
import type { Node } from "../src/usage/vendor/tree-sitter/tree-sitter.js";

async function jsLines(
  source: string,
  matchers: Omit<SymbolUsageMatcher, "kind" | "language">[],
  language: "javascript" | "typescript" = "javascript",
): Promise<string[]> {
  const result = await analyzeJavaScriptFile(
    { path: `x.${language === "typescript" ? "ts" : "js"}`, language, source },
    [
      {
        id: "r",
        matchers: matchers.map((matcher) => ({
          ...matcher,
          kind: "symbol" as const,
          language,
        })),
      },
    ],
  );
  return describe(result?.get("r"));
}

async function pyLines(source: string, matchers: Omit<SymbolUsageMatcher, "kind" | "language">[]): Promise<string[]> {
  const result = await analyzePythonFile({ path: "x.py", language: "python", source }, [
    {
      id: "r",
      matchers: matchers.map((matcher) => ({
        ...matcher,
        kind: "symbol" as const,
        language: "python" as const,
      })),
    },
  ]);
  return describe(result?.get("r"));
}

const describe = (usages: SourceUsage[] | undefined): string[] =>
  (usages ?? []).map((usage) => `${usage.kind} ${usage.location.line}:${usage.location.column} ${usage.symbol}`);

test("a call is found through imports, aliases, destructuring, and the node: prefix", async () => {
  const source = `import fs from "node:fs";
const { exists } = require("fs");
const check = fs.exists;
fs.exists("a", cb);
exists("b", cb);
check("c", cb);
fs.existsSync("d");
`;
  assert.deepEqual(await jsLines(source, [{ module: "fs", symbol: "exists", shape: "call" }]), [
    "symbol 4:1 fs.exists",
    "symbol 5:1 fs.exists",
    "symbol 6:1 fs.exists",
  ]);
});

test("a global is reported unless the file binds the name itself", async () => {
  const matchers = [
    { symbol: "Buffer", shape: "construct" as const },
    { symbol: "process.binding", shape: "call" as const },
  ];
  assert.deepEqual(await jsLines(`new Buffer(1);\nBuffer(2);\nprocess.binding("fs");\n`, matchers), [
    "symbol 1:5 Buffer",
    "symbol 3:1 process.binding",
  ]);
  assert.deepEqual(await jsLines(`import { Buffer } from "buffer";\nnew Buffer(1);\n`, matchers), []);
});

test("construct, call, and reference are different shapes", async () => {
  const source = `new Thing();\nThing();\nconst x = Thing;\nuse(Thing);\nclass Thing {}\nfunction f(Thing) {}\n`;
  assert.deepEqual(await jsLines(source, [{ symbol: "Thing", shape: "construct" }]), ["symbol 1:5 Thing"]);
  assert.deepEqual(await jsLines(source, [{ symbol: "Thing", shape: "call" }]), ["symbol 2:1 Thing"]);
  assert.deepEqual(await jsLines(source, [{ symbol: "Thing", shape: "reference" }]), [
    "symbol 3:11 Thing",
    "symbol 4:5 Thing",
  ]);
});

test("an option is read from the object at the declared argument, and defaults to the last", async () => {
  const source = `const fs = require("fs");
fs.rmdir("d", { recursive: true }, cb);
fs.rmdir("d", cb);
fs.rmdirSync("d", { recursive: true });
fs.rmdir("d", { force: true }, cb);
`;
  const at1 = {
    module: "fs",
    symbol: "rmdir",
    shape: "option" as const,
    option: "recursive",
    argument: 1,
  };
  assert.deepEqual(await jsLines(source, [at1]), ["symbol 2:17 fs.rmdir(recursive)"]);
  assert.deepEqual(await jsLines(source, [{ ...at1, symbol: "rmdirSync", argument: undefined as never }]), [
    "symbol 4:21 fs.rmdirSync(recursive)",
  ]);
});

test("TypeScript wrappers do not hide a call", async () => {
  assert.deepEqual(
    await jsLines(
      `import * as url from "url";\n(url as any).parse(x);\nurl!.parse(y);\n`,
      [{ module: "url", symbol: "parse", shape: "call" }],
      "typescript",
    ),
    ["symbol 2:2 url.parse", "symbol 3:1 url.parse"],
  );
});

test("Python: calls through imports and aliases, references, and options by keyword or position", async () => {
  const source = `import datetime
from datetime import datetime as dt
import shutil
import ast
datetime.datetime.utcnow()
dt.utcnow()
now = dt.utcnow
shutil.rmtree("d", onerror=h)
shutil.rmtree("d", False, h)
shutil.rmtree("d", onexc=h)
isinstance(n, ast.Num)
`;
  assert.deepEqual(await pyLines(source, [{ module: "datetime", symbol: "datetime.utcnow", shape: "call" }]), [
    "symbol 5:1 datetime.datetime.utcnow",
    "symbol 6:1 datetime.datetime.utcnow",
  ]);
  assert.deepEqual(
    await pyLines(source, [
      {
        module: "shutil",
        symbol: "rmtree",
        shape: "option",
        option: "onerror",
        argument: 2,
      },
    ]),
    ["symbol 8:20 shutil.rmtree(onerror)", "symbol 9:27 shutil.rmtree(onerror)"],
  );
  assert.deepEqual(await pyLines(source, [{ module: "ast", symbol: "Num", shape: "reference" }]), [
    "symbol 11:15 ast.Num",
  ]);
});

test("Python: a dotted module is reached by import a.b, import a.b as c, and from a import b", async () => {
  const matchers = [{ module: "urllib.request", symbol: "urlopen", shape: "call" as const }];
  assert.deepEqual(
    await pyLines(`import urllib.request\nurllib.request.urlopen(u)\nurllib.parse.urlparse(u)\n`, matchers),
    ["symbol 2:1 urllib.request.urlopen"],
  );
  assert.deepEqual(await pyLines(`import urllib.request as r\nr.urlopen(u)\n`, matchers), [
    "symbol 2:1 urllib.request.urlopen",
  ]);
  assert.deepEqual(await pyLines(`from urllib import request\nrequest.urlopen(u)\n`, matchers), [
    "symbol 2:1 urllib.request.urlopen",
  ]);
  assert.deepEqual(await pyLines(`from urllib.request import urlopen as go\ngo(u)\n`, matchers), [
    "symbol 2:1 urllib.request.urlopen",
  ]);
});

test("symbolUsages reports call, reference, and option occurrences against the bindings it is given", async () => {
  const source = `exists("a", { flag: true });\nconst e = exists;\n`;
  const tree = await parseSource("javascript", source);
  assert.ok(tree);
  try {
    const locate = lineLocator(source);
    const named = (text: string): Node[] =>
      tree.rootNode.descendantsOfType("identifier").filter((node): node is Node => node?.text === text);
    const nth = (text: string, index: number): Node => {
      const node = named(text)[index];
      assert.ok(node, `${text} #${index}`);
      return node;
    };
    const flag = tree.rootNode.descendantsOfType("property_identifier").find((node) => node?.text === "flag");
    assert.ok(flag);
    const occurrences = [
      {
        head: nth("exists", 0),
        path: ["exists"],
        role: "call" as const,
        options: [new Map(), new Map([["flag", flag]])],
      },
      { head: nth("exists", 1), path: ["exists"], role: "reference" as const },
    ];
    const bindings: SymbolBinding[] = [{ module: "fs", local: "exists", imported: "exists" }];
    const describe = (node: Node) => {
      const { line, column } = locate(node.startIndex);
      return { location: { path: "x.js", line, column }, excerpt: "" };
    };
    const shaped = (
      shape: SymbolUsageMatcher["shape"],
      extra: Partial<SymbolUsageMatcher> = {},
    ): SymbolUsageMatcher => ({
      kind: "symbol",
      language: "javascript",
      module: "fs",
      symbol: "exists",
      shape,
      ...extra,
    });
    const lines = (matchers: SymbolUsageMatcher[]): string[] =>
      symbolUsages(matchers, occurrences, bindings, describe, {
        language: "javascript",
      }).map((usage) => `${usage.kind} ${usage.location.line}:${usage.location.column} ${usage.symbol}`);

    assert.deepEqual(lines([shaped("call")]), ["symbol 1:1 fs.exists"]);
    assert.deepEqual(lines([shaped("reference")]), ["symbol 2:11 fs.exists"]);
    assert.deepEqual(lines([shaped("option", { option: "flag" })]), ["symbol 1:15 fs.exists(flag)"]);
    assert.deepEqual(lines([shaped("construct")]), []);
    const bare = [{ head: nth("exists", 0), path: ["exists"], role: "call" as const }];
    assert.deepEqual(
      symbolUsages([shaped("option", { option: "flag" })], bare, bindings, describe, { language: "javascript" }),
      [],
    );
  } finally {
    tree.delete();
  }
});

test("javaScriptOccurrences lists each callee as a call and, when wanted, each unused name as a reference", async () => {
  const source = `exists("a");\nconst e = exists;\n`;
  const tree = await parseSource("javascript", source);
  assert.ok(tree);
  try {
    const locate = lineLocator(source);
    const named = (text: string): Node[] =>
      tree.rootNode.descendantsOfType("identifier").filter((node): node is Node => node?.text === text);
    const nth = (text: string, index: number): Node => {
      const node = named(text)[index];
      assert.ok(node, `${text} #${index}`);
      return node;
    };
    const callee = nth("exists", 0);
    const describeOccurrences = (wantsReferences: boolean): string[] =>
      javaScriptOccurrences(tree.rootNode, [callee], wantsReferences).map(
        (occurrence) => `${occurrence.role} ${occurrence.path.join(".")} ${locate(occurrence.head.startIndex).line}`,
      );

    assert.deepEqual(describeOccurrences(false), ["call exists 1"]);
    assert.deepEqual(describeOccurrences(true), ["call exists 1", "reference exists 2"]);
  } finally {
    tree.delete();
  }
});

test("Python: a method matcher without a module reports calls only inside unittest.TestCase subclasses", async () => {
  const source = `import unittest
from typing import Generic
class A(Generic[T]):
    def t(self):
        self.assertEquals(1, 1)
class B(unittest.TestCase):
    def t(self):
        self.assertEquals(1, 1)
class C(unittest.Foo):
    def t(self):
        self.assertEquals(1, 1)
class D(make().TestCase):
    def t(self):
        self.assertEquals(1, 1)
`;
  assert.deepEqual(await pyLines(source, [{ symbol: "assertEquals", shape: "method" }]), ["symbol 8:14 assertEquals"]);
});

test("UsageList keeps one usage per kind, position, and symbol, and sorts by position", () => {
  const list = new UsageList();
  const at = (symbol: string, line?: number, column?: number): SourceUsage => ({
    kind: "call",
    language: "javascript",
    symbol,
    location: {
      path: "x.js",
      ...(line === undefined ? {} : { line }),
      ...(column === undefined ? {} : { column }),
    },
    excerpt: "",
  });
  list.add(at("b", 2, 1));
  list.add(at("a", 1, 5));
  list.add(at("b", 2, 1));
  list.add(at("d", 1));
  list.add(at("c"));
  list.add(at("f", 3));
  list.add(at("e", 3));
  assert.deepEqual(
    list.sorted().map((usage) => `${usage.location.line ?? "-"}:${usage.symbol}`),
    ["-:c", "1:d", "1:a", "2:b", "3:f", "3:e"],
  );
});

test("JavaScript: rest, computed, and default destructuring, bare constructions, and string option keys are read", async () => {
  const source = `import { get, post, ...others } from "request";
const { [key]: dynamic, b = 1, ...rest } = require("request");
const { c: { d } } = require("request");
function f(a = 1, ...more) {}
const t = new Thing;
get(url, { "timeout": 1, ...opts, retries: 2 });
make().get(url);
get(url, { verbose });
`;
  assert.deepEqual(await jsLines(source, [{ module: "request", symbol: "get", shape: "call" }]), [
    "symbol 6:1 request.get",
    "symbol 8:1 request.get",
  ]);
  assert.deepEqual(await jsLines(source, [{ module: "request", symbol: "get", shape: "option", option: "timeout" }]), [
    "symbol 6:12 request.get(timeout)",
  ]);
  const twice = { module: "request", symbol: "get", shape: "call" as const };
  assert.deepEqual(await jsLines(source, [twice, twice]), ["symbol 6:1 request.get", "symbol 8:1 request.get"]);
});

test("Python: star imports, submodule imports, and classes without bases are read", async () => {
  const source = `from os import *
from . import sibling
import os.path as osp
class Plain:
    pass
def f(a, *args, **kwargs):
    global counter
    x: int = 1
make().get(url)
self.assertEquals(1, 1)
`;
  const result = await analyzePythonFile({ path: "x.py", language: "python", source }, [
    { id: "r", matchers: [{ kind: "import", language: "python", module: "os" }] },
  ]);
  assert.deepEqual(
    (result?.get("r") ?? []).map((usage) => `${usage.kind} ${usage.location.line}`),
    ["import 1", "import 3"],
  );
});

test("Python: an analysis that binds more names than the ceiling says so", async () => {
  const source = Array.from({ length: 1100 }, (_, index) => `from pkg${index} import name${index}`).join("\n");
  const result = await analyzePythonFile({ path: "x.py", language: "python", source }, [
    { id: "r", matchers: [{ kind: "call", language: "python", module: "pkg0", targets: ["name0"] }] },
  ]);
  assert.equal(result?.analysisCapped, true);
});

test("a binding from another module that shares a local name does not match, and a file over the parse ceiling is not parsed", async () => {
  assert.deepEqual(
    await jsLines(`import { exists } from "other";\nexists("x");\n`, [
      { module: "fs", symbol: "exists", shape: "call" },
    ]),
    [],
  );
  assert.equal(
    await analyzeJavaScriptFile(
      { path: "big.js", language: "javascript", source: "x".repeat(maximumParseBytes + 1) },
      [],
    ),
    undefined,
  );
});

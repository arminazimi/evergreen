import assert from "node:assert/strict";
import { test } from "node:test";

import { grammarFor, maximumParseBytes, parseSource } from "../src/usage/tree-sitter.js";

test("parses JavaScript, TypeScript, TSX, and Python samples", async () => {
  const samples = [
    ["javascript", "import fs from 'node:fs';\nfs.exists(path, cb);\n", "import_statement"],
    ["typescript", "const x: number = require('request');\n", "lexical_declaration"],
    ["tsx", "const view = <div>{value as string}</div>;\n", "jsx_element"],
    ["python", "import os\nos.getcwdu()\n", "import_statement"],
  ] as const;
  for (const [grammar, source, expected] of samples) {
    const tree = await parseSource(grammar, source);
    assert.ok(tree, grammar);
    try {
      assert.equal(tree.rootNode.hasError, false, grammar);
      assert.ok(tree.rootNode.toString().includes(expected), `${grammar}: ${tree.rootNode.toString()}`);
    } finally {
      tree.delete();
    }
  }
});

test("reports syntax errors instead of throwing", async () => {
  const tree = await parseSource("python", "def (:\n");
  assert.ok(tree);
  assert.equal(tree.rootNode.hasError, true);
  tree.delete();
});

test("skips files above the size bound", async () => {
  assert.equal(await parseSource("javascript", "a".repeat(maximumParseBytes + 1)), undefined);
});

test("gives up when the parse budget is exhausted", async () => {
  const source = "x = [" + "1, ".repeat(200_000) + "]\n";
  assert.equal(await parseSource("python", source, -1), undefined);
  const tree = await parseSource("python", "x = 1\n");
  assert.ok(tree, "parser recovers after a cancelled parse");
  tree.delete();
});

test("loads grammars concurrently and reuses them", async () => {
  const trees = await Promise.all([1, 2, 3].map((n) => parseSource("python", `x = ${n}\n`)));
  assert.ok(trees.every((tree) => tree !== undefined));
  for (const tree of trees) tree?.delete();
});

test("maps source languages to grammars", () => {
  assert.equal(grammarFor("python", "a.py"), "python");
  assert.equal(grammarFor("javascript", "a.jsx"), "javascript");
  assert.equal(grammarFor("typescript", "a.ts"), "typescript");
  assert.equal(grammarFor("typescript", "A.TSX"), "tsx");
  assert.equal(grammarFor("go", "a.go"), undefined);
});

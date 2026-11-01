import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import { builtInDetectors as detectors } from "../src/detectors/index.js";
import type { ScanResult } from "../src/domain.js";
import { scanRepository } from "../src/engine.js";
import { nodeUtilIsFixer, planFixReport } from "../src/fix/index.js";
import type { FilePatch, FixRefusal } from "../src/fix/index.js";
import { grammarFor, parseSource } from "../src/usage/tree-sitter.js";

const execute = promisify(execFile);
const fixtures = resolve("tests/fixtures/fix/node-util-is");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

interface Plan {
  root: string;
  patches: FilePatch[];
  refusals: FixRefusal[];
}

async function plan(files: Record<string, string>): Promise<Plan> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-node-util-is-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) await writeFile(join(root, path), contents);
  const result = await scanRepository(root, detectors, { noCache: true });
  return { root, ...(await planFixReport(result)) };
}

function normalized(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/** One row of the replacement table: the deprecated call and the expression that replaces it. */
const rows = [
  ["util.isArray(value)", "Array.isArray(value)"],
  ["util.isBoolean(value)", 'typeof value === "boolean"'],
  ["util.isBuffer(value)", "Buffer.isBuffer(value)"],
  ["util.isDate(value)", "util.types.isDate(value)"],
  ["util.isRegExp(value)", "util.types.isRegExp(value)"],
  ["util.isFunction(value)", 'typeof value === "function"'],
  ["util.isNull(value)", "value === null"],
  ["util.isUndefined(value)", "value === undefined"],
  ["util.isNullOrUndefined(value)", "value == null"],
  ["util.isNumber(value)", 'typeof value === "number"'],
  ["util.isString(value)", 'typeof value === "string"'],
  ["util.isSymbol(value)", 'typeof value === "symbol"'],
  ["util.isObject(nested.value)", 'nested.value !== null && typeof nested.value === "object"'],
  ["util.isPrimitive(nested.value)", 'nested.value === null || (typeof nested.value !== "object" && typeof nested.value !== "function")'],
] as const;

for (const [extension, language] of [["js", "javascript"], ["ts", "typescript"]] as const) {
  test(`rewrites every replacement row in ${extension} and the patch applies cleanly`, async () => {
    const before = await readFile(join(fixtures, `before.${extension}`), "utf8");
    const expected = await readFile(join(fixtures, `after.${extension}`), "utf8");
    for (const [call, replacement] of rows) {
      assert.ok(before.includes(call), `the before fixture must use ${call}`);
      assert.ok(expected.includes(replacement), `the after fixture must use ${replacement}`);
    }

    const { root, patches, refusals } = await plan({ [`index.${extension}`]: before });
    assert.deepEqual(refusals, []);
    assert.equal(patches.length, 1);
    assert.equal(patches[0]!.path, `index.${extension}`);
    const patch = join(root, "fix.patch");
    await writeFile(patch, `${patches[0]!.diff}\n`);
    await execute("git", ["apply", "--check", patch], { cwd: root });
    await execute("git", ["apply", patch], { cwd: root });
    assert.equal(normalized(await readFile(join(root, `index.${extension}`), "utf8")), normalized(expected));

    const tree = await parseSource(grammarFor(language, `index.${extension}`)!, expected);
    assert.ok(tree);
    assert.equal(tree.rootNode.hasError, false);
    tree.delete();
  });

  test(`plans nothing for already-rewritten ${extension}`, async () => {
    const expected = await readFile(join(fixtures, `after.${extension}`), "utf8");
    assert.deepEqual((await plan({ [`index.${extension}`]: expected })).patches, []);
  });
}

test("parenthesizes a binary replacement except in a condition, argument, return value, or initializer", async () => {
  const source = [
    'const util = require("util");',
    "const value = globalThis;",
    "const negated = !util.isNull(value);",
    "const asserted = util.isNull(value) as boolean;",
    "const arrow = () => util.isNull(value);",
    "if (util.isNull(value)) {",
    "  console.log(util.isNumber(value));",
    "}",
    "function check(candidate) {",
    "  return util.isString(candidate);",
    "}",
    "",
  ].join("\n");
  const { patches } = await plan({ "index.ts": source });
  const lines = patches[0]!.diff.split("\n").filter((line) => line.startsWith("+")).map((line) => line.slice(1));
  assert.deepEqual(lines.slice(1), [
    "const negated = !(value === null);",    "const asserted = (value === null) as boolean;",
    "const arrow = () => (value === null);",
    "if (value === null) {",
    "  console.log(typeof value === \"number\");",
    "}",
    "function check(candidate) {",
    "  return typeof candidate === \"string\";",
  ]);
});

test("parenthesizes an argument that binds looser than the replacement", async () => {
  const { patches } = await plan({
    "index.js": 'const util = require("util");\nconst a = 1;\nconst b = 2;\nconst sum = util.isNull(a + b);\nconst assigned = util.isString(a = b);\n',
  });
  const added = patches[0]!.diff.split("\n").filter((line) => line.startsWith("+")).map((line) => line.slice(1));
  assert.ok(added.includes("const sum = (a + b) === null;"));
  assert.ok(added.includes('const assigned = typeof (a = b) === "string";'));
});

test("rewrites every import shape and keeps a destructured binding in place", async () => {
  const cases = [
    ['const util = require("node:util");\nconst ok = util.isArray(value);\n', "Array.isArray(value)", true],
    ['import util from "util";\nconst ok = util.isNumber(value);\n', 'typeof value === "number"', true],
    ['import * as util from "node:util";\nconst ok = util.isNull(value);\n', "value === null", true],
    ['const { isArray } = require("util");\nconst ok = isArray(value);\n', "Array.isArray(value)", true],
    ['import { isString } from "util";\nconst ok = isString(value);\n', 'typeof value === "string"', true],
    ['const { isArray: check } = require("util");\nconst ok = check(value);\n', "Array.isArray(value)", true],
  ] as const;
  for (const [source, replacement, keepsImport] of cases) {
    const { root, patches, refusals } = await plan({ "index.js": source });
    assert.deepEqual(refusals, [], source);
    assert.equal(patches.length, 1, source);
    const patch = join(root, "fix.patch");
    await writeFile(patch, `${patches[0]!.diff}\n`);
    await execute("git", ["apply", patch], { cwd: root });
    const text = await readFile(join(root, "index.js"), "utf8");
    assert.ok(text.includes(replacement), `${source} should become ${replacement}`);
    if (keepsImport) assert.equal(text.split("\n")[0], source.split("\n")[0], "the import line is not rewritten");
  }
});

test("reads util.types through a namespace binding when the call is destructured", async () => {
  const source = 'const util = require("util");\nconst { isDate } = require("util");\nconst ok = isDate(value);\n';
  const { root, patches, refusals } = await plan({ "index.js": source });
  assert.deepEqual(refusals, []);
  const patch = join(root, "fix.patch");
  await writeFile(patch, `${patches[0]!.diff}\n`);
  await execute("git", ["apply", patch], { cwd: root });
  assert.ok((await readFile(join(root, "index.js"), "utf8")).includes("const ok = util.types.isDate(value);"));
});

test("rewrites the usages a scan finding carries", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-node-util-is-finding-"));
  temporaryRoots.push(root);
  const source = 'const util = require("util");\nconst ok = util.isArray(value);\n';
  await writeFile(join(root, "index.js"), source);
  const result: ScanResult = {
    schemaVersion: "evergreen.scan.v1",
    root,
    scannedAt: "2026-10-31T00:00:00.000Z",
    findings: [{
      id: "nodejs.symbol.util.isarray:index.js:2",
      ruleId: "nodejs.symbol.util.isarray",
      detector: "npm",
      title: "util.isArray is deprecated",
      summary: "",
      severity: "low",
      confidence: "exact",
      location: { path: "index.js", line: 2, column: 12 },
      sources: [],
      usages: [{
        kind: "symbol",
        language: "javascript",
        symbol: "util.isArray",
        location: { path: "index.js", line: 2, column: 12 },
        excerpt: "const ok = util.isArray(value);",
      }],
    }],
    diagnostics: [],
  };

  const patches = await nodeUtilIsFixer.plan(result);
  assert.equal(patches.length, 1);
  assert.ok(patches[0]!.diff.includes("+const ok = Array.isArray(value);"));
});

test("refuses every call it cannot rewrite exactly, with a reason", async () => {
  const { patches, refusals } = await plan({
    "index.js": await readFile(join(fixtures, "refusals.js"), "utf8"),
    "index.ts": await readFile(join(fixtures, "refusals.ts"), "utf8"),
    "destructured.js": await readFile(join(fixtures, "destructured.js"), "utf8"),
  });

  assert.ok(refusals.every((refusal) => refusal.fixer === "node-util-is"));
  assert.ok(refusals.every((refusal) => refusal.reason.length > 0));
  const reasons = refusals.map((refusal) => refusal.reason);
  assert.equal(reasons.filter((reason) => reason.includes("no exact native equivalent of `util.isError`")).length, 2);
  assert.equal(reasons.filter((reason) => reason.includes("member chain without calls")).length, 3);
  assert.equal(reasons.filter((reason) => reason.includes("spreads its argument")).length, 2);
  assert.equal(reasons.filter((reason) => reason.includes("optional (`?.`)")).length, 2);
  assert.equal(reasons.filter((reason) => reason.includes("passes no argument")).length, 2);
  assert.equal(reasons.filter((reason) => reason.includes("passes 2 arguments")).length, 2);
  assert.equal(reasons.filter((reason) => reason.includes("is reassigned in this file")).length, 2);
  assert.equal(reasons.filter((reason) => reason.includes("`util.types` is not reachable")).length, 1);

  assert.equal(patches.length, 1);
  assert.equal(patches[0]!.path, "destructured.js");
  assert.ok(patches[0]!.diff.includes('+const object = value !== null && typeof value === "object";'));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import type { ScanResult } from "../src/domain.js";
import { nodeUtilIsFixer } from "../src/fix/index.js";
import { apply, assertParses, cleanup, normalized, plan, repository } from "./codemod-helpers.js";

const fixtures = resolve("tests/fixtures/fix/node-util-is");

after(cleanup);

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
  [
    "util.isPrimitive(nested.value)",
    'nested.value === null || (typeof nested.value !== "object" && typeof nested.value !== "function")',
  ],
] as const;

for (const [extension, language] of [
  ["js", "javascript"],
  ["ts", "typescript"],
] as const) {
  test(`rewrites every replacement row in ${extension} and the patch applies cleanly`, async () => {
    const before = await readFile(join(fixtures, `before.${extension}`), "utf8");
    const expected = await readFile(join(fixtures, `after.${extension}`), "utf8");
    for (const [call, replacement] of rows) {
      assert.ok(before.includes(call), `the before fixture must use ${call}`);
      assert.ok(expected.includes(replacement), `the after fixture must use ${replacement}`);
    }

    const { root, patches, refusals } = await plan({ [`index.${extension}`]: before }, "node-util-is");
    assert.deepEqual(refusals, []);
    assert.equal(patches.length, 1);
    assert.equal(patches[0]!.path, `index.${extension}`);
    const fixed = await apply(root, patches[0]!.diff, `index.${extension}`);
    assert.equal(fixed, normalized(expected));
    await assertParses(fixed, language);
  });

  test(`plans nothing for already-rewritten ${extension}`, async () => {
    const expected = await readFile(join(fixtures, `after.${extension}`), "utf8");
    assert.deepEqual((await plan({ [`index.${extension}`]: expected }, "node-util-is")).patches, []);
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
  const { patches } = await plan({ "index.ts": source }, "node-util-is");
  const lines = patches[0]!.diff
    .split("\n")
    .filter((line) => line.startsWith("+"))
    .map((line) => line.slice(1));
  assert.deepEqual(lines.slice(1), [
    "const negated = !(value === null);",
    "const asserted = (value === null) as boolean;",
    "const arrow = () => (value === null);",
    "if (value === null) {",
    '  console.log(typeof value === "number");',
    "}",
    "function check(candidate) {",
    '  return typeof candidate === "string";',
  ]);
});

test("parenthesizes an argument that binds looser than the replacement", async () => {
  const { patches } = await plan(
    {
      "index.js":
        'const util = require("util");\nconst a = 1;\nconst b = 2;\nconst sum = util.isNull(a + b);\nconst assigned = util.isString(a = b);\n',
    },
    "node-util-is",
  );
  const added = patches[0]!.diff
    .split("\n")
    .filter((line) => line.startsWith("+"))
    .map((line) => line.slice(1));
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
    const { root, patches, refusals } = await plan({ "index.js": source }, "node-util-is");
    assert.deepEqual(refusals, [], source);
    assert.equal(patches.length, 1, source);
    const text = await apply(root, patches[0]!.diff, "index.js");
    assert.ok(text.includes(replacement), `${source} should become ${replacement}`);
    if (keepsImport) assert.equal(text.split("\n")[0], source.split("\n")[0], "the import line is not rewritten");
  }
});

test("reads util.types through a namespace binding when the call is destructured", async () => {
  const source = 'const util = require("util");\nconst { isDate } = require("util");\nconst ok = isDate(value);\n';
  const { root, patches, refusals } = await plan({ "index.js": source }, "node-util-is");
  assert.deepEqual(refusals, []);
  assert.ok((await apply(root, patches[0]!.diff, "index.js")).includes("const ok = util.types.isDate(value);"));
});

test("rewrites the usages a scan finding carries", async () => {
  const source = 'const util = require("util");\nconst ok = util.isArray(value);\n';
  const root = await repository({ "index.js": source });
  const result: ScanResult = {
    schemaVersion: "evergreen.scan.v1",
    root,
    scannedAt: "2026-10-31T00:00:00.000Z",
    findings: [
      {
        id: "nodejs.symbol.util.isarray:index.js:2",
        ruleId: "nodejs.symbol.util.isarray",
        detector: "npm",
        title: "util.isArray is deprecated",
        summary: "",
        severity: "low",
        confidence: "exact",
        location: { path: "index.js", line: 2, column: 12 },
        sources: [],
        usages: [
          {
            kind: "symbol",
            language: "javascript",
            symbol: "util.isArray",
            location: { path: "index.js", line: 2, column: 12 },
            excerpt: "const ok = util.isArray(value);",
          },
        ],
      },
    ],
    diagnostics: [],
  };

  const patches = await nodeUtilIsFixer.plan(result);
  assert.equal(patches.length, 1);
  assert.ok(patches[0]!.diff.includes("+const ok = Array.isArray(value);"));
});

test("refuses every call it cannot rewrite exactly, with a reason", async () => {
  const { patches, refusals } = await plan(
    {
      "index.js": await readFile(join(fixtures, "refusals.js"), "utf8"),
      "index.ts": await readFile(join(fixtures, "refusals.ts"), "utf8"),
      "destructured.js": await readFile(join(fixtures, "destructured.js"), "utf8"),
    },
    "node-util-is",
  );

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

test("utilBindings follows aliases of the module, of a function, and destructuring defaults", async () => {
  const source = [
    'const util = require("node:util");',
    "const u = util;",
    "const check = u.isArray;",
    'const { isString: isText, isNumber = fallback } = require("util");',
    "const a = check(value);",
    "const b = isText(value);",
    "const c = isNumber(value);",
    "",
  ].join("\n");
  const { patches, refusals } = await plan({ "index.js": source }, "node-util-is");

  assert.deepEqual(refusals, []);
  assert.equal(patches.length, 1);
  const added = patches[0]!.diff
    .split("\n")
    .filter((line) => line.startsWith("+"))
    .map((line) => line.slice(1));
  assert.ok(added.includes("const a = Array.isArray(value);"));
  assert.ok(added.includes('const b = typeof value === "string";'));
  assert.ok(added.includes('const c = typeof value === "number";'));
});

test("durableReference accepts identifiers, this, member chains, subscripts, and wrappers", async () => {
  const source = [
    'const util = require("util");',
    "const holder = { inner: {} };",
    "const list = [];",
    "const value = {};",
    "const direct = util.isObject(value);",
    "const member = util.isObject(holder.inner);",
    "const subscript = util.isObject(list[0]);",
    "const parenthesized = util.isObject((value));",
    "const that = util.isObject(this);",
    "",
  ].join("\n");
  const { patches, refusals } = await plan({ "index.js": source }, "node-util-is");

  assert.deepEqual(refusals, []);
  assert.equal(patches.length, 1);
  for (const line of [
    'const direct = value !== null && typeof value === "object";',
    'const member = holder.inner !== null && typeof holder.inner === "object";',
    'const subscript = list[0] !== null && typeof list[0] === "object";',
    'const parenthesized = (value) !== null && typeof (value) === "object";',
    'const that = this !== null && typeof this === "object";',
  ]) {
    assert.ok(patches[0]!.diff.includes(`+${line}`), line);
  }
});

test("rewriteFor reports a usage whose location names no direct util.isArray call", async () => {
  const files: Record<string, string> = {
    "call.js": 'const util = require("util");\nconst ok = util.isNull(value);\n',
    "noncall.js": "const value = 1;\n",
    "beyond.js": "const value = 1;\n",
  };
  const root = await repository(files);
  const finding = (
    path: string,
    ruleId: string,
    line: number,
    column: number,
    index: number,
  ): ScanResult["findings"][number] => {
    const location = { path, line, column };
    return {
      id: `${ruleId}:${path}:${index}`,
      ruleId,
      detector: "npm",
      title: "util.is* has been deprecated",
      summary: "",
      severity: "low",
      confidence: "exact",
      location,
      sources: [],
      usages: [{ kind: "symbol", language: "javascript", symbol: ruleId, location, excerpt: "" }],
    };
  };
  const result: ScanResult = {
    schemaVersion: "evergreen.scan.v1",
    root,
    scannedAt: "2026-10-31T00:00:00.000Z",
    findings: [
      finding("call.js", "nodejs.symbol.util.isarray", 2, 12, 0),
      finding("call.js", "nodejs.symbol.util.isnull", 2, 12, 1),
      finding("noncall.js", "nodejs.symbol.util.isarray", 1, 1, 2),
      finding("beyond.js", "nodejs.symbol.util.isarray", 9, 1, 3),
    ],
    diagnostics: [],
  };

  const reasons: string[] = [];
  await nodeUtilIsFixer.plan(result, (_finding, reason) => reasons.push(reason));
  assert.ok(reasons.some((reason) => reason.includes("is not a direct `util.isArray` call")));
  assert.ok(reasons.some((reason) => reason.includes("No `util.isArray` call is at the reported location")));
  assert.ok(reasons.some((reason) => reason.includes("not in the source file")));
});

test("plan refuses a file without a final newline, a missing file, and a path outside the root", async () => {
  const root = await repository({
    "no-newline.js": 'const util = require("util");\nconst ok = util.isArray(value);',
  });
  const paths = ["no-newline.js", "missing.js", "../outside.js"];
  const result: ScanResult = {
    schemaVersion: "evergreen.scan.v1",
    root,
    scannedAt: "2026-10-31T00:00:00.000Z",
    findings: paths.map((path, index) => ({
      id: `nodejs.symbol.util.isarray:${path}:${index}`,
      ruleId: "nodejs.symbol.util.isarray",
      detector: "npm",
      title: "util.isArray is deprecated",
      summary: "",
      severity: "low",
      confidence: "exact",
      location: { path, line: 2, column: 1 },
      sources: [],
      usages: [
        {
          kind: "symbol",
          language: "javascript",
          symbol: "util.isArray",
          location: { path, line: 2, column: 1 },
          excerpt: "",
        },
      ],
    })),
    diagnostics: [],
  };

  const reasons: string[] = [];
  const patches = await nodeUtilIsFixer.plan(result, (_finding, reason) => reasons.push(reason));
  assert.deepEqual(patches, []);
  assert.ok(reasons.some((reason) => reason.includes("does not end with a newline")));
  assert.ok(reasons.some((reason) => reason.includes("could not be read")));
  assert.ok(reasons.some((reason) => reason.includes("resolves outside the repository")));
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { selectAffectedTests } from "../tools/check-fast.js";

const ALL = ["tests/engine.test.ts", "tests/engine-sorting.test.ts", "tests/npm.test.ts", "tests/other.test.ts"];

test("a changed test file runs itself", () => {
  assert.deepEqual(selectAffectedTests(["tests/npm.test.ts"], ALL), { tests: ["tests/npm.test.ts"], unmapped: [] });
});

test("a changed source file runs the tests named after it", () => {
  assert.deepEqual(selectAffectedTests(["src/engine.ts"], ALL), {
    tests: ["tests/engine-sorting.test.ts", "tests/engine.test.ts"],
    unmapped: [],
  });
  assert.deepEqual(selectAffectedTests(["src/detectors/npm.ts"], ALL).tests, ["tests/npm.test.ts"]);
  assert.deepEqual(selectAffectedTests(["src/engine/detect.ts"], ALL).tests, [
    "tests/engine-sorting.test.ts",
    "tests/engine.test.ts",
  ]);
});

test("files without a matching test are reported, and documentation is ignored", () => {
  assert.deepEqual(selectAffectedTests(["src/unknown.ts", "package.json", "docs/a.md", "README.md"], ALL), {
    tests: [],
    unmapped: ["package.json", "src/unknown.ts"],
  });
});

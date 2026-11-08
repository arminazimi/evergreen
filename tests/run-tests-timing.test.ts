import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import {
  TEST_TIME_BUDGET_SCHEMA_VERSION,
  TEST_TIMING_MARKER,
  evaluateTestTimeBudget,
  fileDurationsFromJunit,
  formatTestDuration,
  formatTestTimeBudgetViolation,
  normalizeTestFilePath,
  parseTestTimeBudget,
  renderTestTimeBudgetFailure,
  renderTestTimingSummary,
  testTimeBudgetAnnotation,
} from "../tools/run-tests-timing.js";
import type { TestTimeBudget } from "../tools/run-tests-timing.js";

const ROOT = resolve(import.meta.dirname, "..");

test("normalizeTestFilePath prefers source paths over dist", () => {
  assert.equal(normalizeTestFilePath("dist/tests/foo.test.js", ROOT), "tests/foo.test.ts");
  assert.equal(normalizeTestFilePath(resolve(ROOT, "dist/tests/nested/bar.test.js"), ROOT), "tests/nested/bar.test.ts");
  assert.equal(normalizeTestFilePath("tests/foo.test.ts", ROOT), "tests/foo.test.ts");
  assert.equal(normalizeTestFilePath("tests\\foo.test.ts", ROOT), "tests/foo.test.ts");
});

test("fileDurationsFromJunit sums testcase times per file", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
	<testcase name="a" time="0.05" file="${resolve(ROOT, "dist/tests/slow.test.js")}"/>
	<testcase file="${resolve(ROOT, "dist/tests/fast.test.js")}" time="0.01" name="b"/>
	<testcase name="c" time="0.02" file="${resolve(ROOT, "dist/tests/slow.test.js")}"/>
	<testcase name="missing-file" time="1.0"/>
</testsuites>
`;
  assert.deepEqual(fileDurationsFromJunit(xml, ROOT), [
    { file: "tests/slow.test.ts", durationMs: 70 },
    { file: "tests/fast.test.ts", durationMs: 10 },
  ]);
});

test("renderTestTimingSummary lists the top files with a stable marker", () => {
  const entries = [
    { file: "tests/slow.test.ts", durationMs: 12_500 },
    { file: "tests/mid.test.ts", durationMs: 2_000 },
    { file: "tests/fast.test.ts", durationMs: 40 },
  ];
  const summary = renderTestTimingSummary(entries, {
    limit: 2,
    platform: "darwin",
    nodeVersion: "v22.0.0",
    totalMs: 14_540,
  });
  assert.match(summary, new RegExp(TEST_TIMING_MARKER));
  assert.match(summary, /platform: `darwin` · node: `v22\.0\.0`/);
  assert.match(summary, /Top 2 of 3 files/);
  assert.match(summary, /\| `tests\/slow\.test\.ts` \| 12\.5s \|/);
  assert.match(summary, /\| `tests\/mid\.test\.ts` \| 2\.00s \|/);
  assert.doesNotMatch(summary, /fast\.test\.ts/);
  assert.match(summary, /Suite total \(sum of file times\): \*\*14\.5s\*\*/);
  assert.equal(formatTestDuration(40), "40ms");
  assert.equal(formatTestDuration(12_500), "12.5s");
});

test("renderTestTimingSummary handles an empty run", () => {
  const summary = renderTestTimingSummary([], { platform: "linux", nodeVersion: "v24.1.0" });
  assert.match(summary, new RegExp(TEST_TIMING_MARKER));
  assert.match(summary, /_No testcase timings recorded\._/);
});

test("the committed test time budget is valid and leaves room between the two limits", async () => {
  // Tests run from the repo root: the compiled copy lives under dist/tests/.
  const text = await readFile(resolve("benchmarks/test-time-budget.json"), "utf8");
  const budget = parseTestTimeBudget(text);
  assert.equal(budget.schemaVersion, TEST_TIME_BUDGET_SCHEMA_VERSION);
  assert.ok(budget.totalMs > budget.perFileMs, "the suite budget must exceed the per-file budget");
  assert.ok(budget.perFileMs > 0);
});

test("parseTestTimeBudget rejects malformed budgets instead of disabling the gate", () => {
  assert.throws(() => parseTestTimeBudget("not json"), /not valid JSON/);
  assert.throws(() => parseTestTimeBudget("[]"), /JSON object/);
  assert.throws(() => parseTestTimeBudget("{}"), /schemaVersion/);
  assert.throws(
    () =>
      parseTestTimeBudget(
        JSON.stringify({ schemaVersion: TEST_TIME_BUDGET_SCHEMA_VERSION, totalMs: 0, perFileMs: 1_000 }),
      ),
    /totalMs must be a positive number/,
  );
  assert.throws(
    () =>
      parseTestTimeBudget(
        JSON.stringify({ schemaVersion: TEST_TIME_BUDGET_SCHEMA_VERSION, totalMs: 10_000, perFileMs: -1 }),
      ),
    /perFileMs must be a positive number/,
  );
});

test("evaluateTestTimeBudget passes at or under both budgets", () => {
  const budget: TestTimeBudget = {
    schemaVersion: TEST_TIME_BUDGET_SCHEMA_VERSION,
    totalMs: 10_000,
    perFileMs: 1_000,
  };
  const entries = [
    { file: "tests/slow.test.ts", durationMs: 1_000 },
    { file: "tests/fast.test.ts", durationMs: 40 },
  ];
  assert.deepEqual(evaluateTestTimeBudget(entries, budget), []);
});

test("a deliberately slow file produces a clear message naming the file and both milliseconds", () => {
  const budget: TestTimeBudget = {
    schemaVersion: TEST_TIME_BUDGET_SCHEMA_VERSION,
    totalMs: 10_000,
    perFileMs: 1_000,
  };
  const entries = [
    { file: "tests/fast.test.ts", durationMs: 40 },
    { file: normalizeTestFilePath("C:\\repo\\dist\\tests\\slow.test.js", "C:\\repo"), durationMs: 12_500 },
  ];
  const violations = evaluateTestTimeBudget(entries, budget);
  assert.deepEqual(violations, [
    { scope: "file", file: "tests/slow.test.ts", actualMs: 12_500, budgetMs: 1_000 },
    { scope: "suite", actualMs: 12_540, budgetMs: 10_000 },
  ]);
  assert.equal(
    formatTestTimeBudgetViolation(violations[0]!),
    "tests/slow.test.ts took 12.5s (12500 ms), over the 1000 ms per-file test time budget",
  );
  assert.equal(
    formatTestTimeBudgetViolation(violations[1]!),
    "test suite total took 12.5s (12540 ms), over the 10000 ms suite test time budget",
  );
  assert.equal(
    testTimeBudgetAnnotation(violations[0]!),
    "::error file=tests/slow.test.ts,title=Test time budget exceeded::tests/slow.test.ts took 12.5s (12500 ms), over the 1000 ms per-file test time budget",
  );
  assert.equal(
    testTimeBudgetAnnotation(violations[1]!),
    "::error title=Test time budget exceeded::test suite total took 12.5s (12540 ms), over the 10000 ms suite test time budget",
  );
  const summary = renderTestTimeBudgetFailure(violations, { budgetPath: "benchmarks/test-time-budget.json" });
  assert.match(summary, /### Test time budget exceeded/);
  assert.match(summary, /- tests\/slow\.test\.ts took 12\.5s \(12500 ms\)/);
  assert.match(summary, /benchmarks\/test-time-budget\.json/);
});

test("testTimeBudgetAnnotation escapes characters that break workflow commands", () => {
  const annotation = testTimeBudgetAnnotation({
    scope: "file",
    file: "tests/odd,name:100%.test.ts",
    actualMs: 2_000,
    budgetMs: 1_000,
  });
  assert.ok(annotation.startsWith("::error file=tests/odd%2Cname%3A100%25.test.ts,title="), annotation);
});

test("run-tests.mjs re-exports the timing helpers", async () => {
  // Resolve from the repo root: compiled tests live under dist/tests/.
  const exported = await import(pathToFileURL(resolve("tools/run-tests.mjs")).href);
  assert.equal(exported.TEST_TIMING_MARKER, TEST_TIMING_MARKER);
  assert.equal(typeof exported.fileDurationsFromJunit, "function");
  assert.equal(typeof exported.renderTestTimingSummary, "function");
  assert.equal(typeof exported.normalizeTestFilePath, "function");
  assert.equal(typeof exported.evaluateTestTimeBudget, "function");
  assert.equal(typeof exported.parseTestTimeBudget, "function");
  assert.equal(typeof exported.testTimeBudgetAnnotation, "function");
});

test("insertReportersBeforeFiles keeps reporter flags ahead of test paths", async () => {
  const { insertReportersBeforeFiles } = await import(pathToFileURL(resolve("tools/run-tests.mjs")).href);
  assert.deepEqual(
    insertReportersBeforeFiles(
      ["--test", "--test-concurrency=4", "dist/tests/a.test.js", "dist/tests/b.test.js"],
      ["--test-reporter=junit", "--test-reporter-destination=/tmp/out.xml"],
    ),
    [
      "--test",
      "--test-concurrency=4",
      "--test-reporter=junit",
      "--test-reporter-destination=/tmp/out.xml",
      "dist/tests/a.test.js",
      "dist/tests/b.test.js",
    ],
  );
});

test("shortenFilePaths makes test files relative to the working directory so the suite fits a Windows command line", async () => {
  const { shortenFilePaths } = await import(pathToFileURL(resolve("tools/run-tests.mjs")).href);
  const cwd = resolve("some-root");
  assert.deepEqual(
    shortenFilePaths(
      ["--test", "--test-concurrency=4", resolve(cwd, "dist", "tests", "a.test.js"), resolve("elsewhere", "b.test.js")],
      cwd,
    ),
    ["--test", "--test-concurrency=4", join("dist", "tests", "a.test.js"), resolve("elsewhere", "b.test.js")],
  );
});

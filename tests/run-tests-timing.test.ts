import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import {
  TEST_TIMING_MARKER,
  fileDurationsFromJunit,
  formatTestDuration,
  normalizeTestFilePath,
  renderTestTimingSummary,
} from "../tools/run-tests-timing.js";

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

test("run-tests.mjs re-exports the timing helpers", async () => {
  // Resolve from the repo root: compiled tests live under dist/tests/.
  const exported = await import(pathToFileURL(resolve("tools/run-tests.mjs")).href);
  assert.equal(exported.TEST_TIMING_MARKER, TEST_TIMING_MARKER);
  assert.equal(typeof exported.fileDurationsFromJunit, "function");
  assert.equal(typeof exported.renderTestTimingSummary, "function");
  assert.equal(typeof exported.normalizeTestFilePath, "function");
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

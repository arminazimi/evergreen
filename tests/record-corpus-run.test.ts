import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { assertRecordable, buildFullRunRecord, findFilterFlag, withLastFullRun } from "../benchmarks/record-run.js";
import type { RecordableReport } from "../benchmarks/record-run.js";
import type { Thresholds } from "../benchmarks/thresholds.js";

const execute = promisify(execFile);

const report = (overrides: Partial<RecordableReport> = {}): RecordableReport => ({
  schemaVersion: "evergreen.public-validation-result.v1",
  mode: "verify",
  fullRun: true,
  thresholdViolations: [],
  detectors: { npm: { truePositives: 5, falsePositives: 0, falseNegatives: 0 } },
  summary: { repositoryCount: 3, findingCount: 5, truePositives: 5, falsePositives: 0, falseNegatives: 0, precision: 1, recall: 1 },
  ...overrides,
});

test("a complete, clean, verify-mode run is recordable", () => {
  assert.doesNotThrow(() => assertRecordable(report(), 3));
});

test("filtered, partial, observe-mode, and failing runs are refused", () => {
  assert.throws(() => assertRecordable(report({ fullRun: false, filter: "FILTERED RUN (ecosystem php)" }), 3), /filtered/);
  assert.throws(() => assertRecordable(report({ fullRun: undefined as never }), 3), /filtered/);
  assert.throws(() => assertRecordable(report(), 4), /3 repositories but the corpus has 4/);
  assert.throws(() => assertRecordable(report({ mode: "observe" }), 3), /"observe" mode/);
  assert.throws(() => assertRecordable(report({ summary: { ...report().summary!, falsePositives: 2 } }), 3), /2 false positives and 0 false negatives/);
  assert.throws(() => assertRecordable(report({ summary: { ...report().summary!, falseNegatives: 1 } }), 3), /1 false negatives/);
  assert.throws(() => assertRecordable(report({ thresholdViolations: [{}] }), 3), /precision floor/);
  assert.throws(() => assertRecordable({ schemaVersion: "other" }, 3), /not a corpus report/);
});

test("narrowing flags are found, including the = spelling", () => {
  assert.equal(findFilterFlag(["--concurrency", "4"]), undefined);
  assert.equal(findFilterFlag(["--ecosystem", "php"]), "--ecosystem");
  assert.equal(findFilterFlag(["--repo=a/b"]), "--repo=a/b");
  assert.equal(findFilterFlag(["--changed"]), "--changed");
  assert.equal(findFilterFlag(["--failed-from", "r.json"]), "--failed-from");
});

test("the record covers every detector, with zeros for one that reported nothing", async () => {
  const thresholds = JSON.parse(await readFile(resolve("benchmarks/thresholds.json"), "utf8")) as Thresholds;
  assertRecordable(report(), 3);
  const record = buildFullRunRecord(report() as never, thresholds, { date: "2026-12-01", commit: "abc1234" });
  assert.deepEqual(Object.keys(record.perDetector), Object.keys(thresholds.detectors).sort());
  assert.deepEqual(record.perDetector.npm, { truePositives: 5, falsePositives: 0, falseNegatives: 0 });
  assert.deepEqual(record.perDetector.swift, { truePositives: 0, falsePositives: 0, falseNegatives: 0 });
  assert.equal(record.date, "2026-12-01");
  assert.equal(record.commit, "abc1234");
  assert.equal(record.repositories, 3);
  assert.equal(record.findings, 5);
});

test("writing a record changes only lastFullRun and keeps the file's formatting", async () => {
  const text = await readFile(resolve("benchmarks/thresholds.json"), "utf8");
  assert.equal(withLastFullRun(text, (JSON.parse(text) as Thresholds).lastFullRun!), text, "an unchanged record round-trips byte for byte");
  const thresholds = JSON.parse(text) as Thresholds;
  const record = buildFullRunRecord(report() as never, thresholds, { date: "2026-12-01", commit: "abc1234" });
  const updated = JSON.parse(withLastFullRun(text, record)) as Thresholds;
  assert.deepEqual(updated.lastFullRun, record);
  assert.deepEqual(updated.detectors, thresholds.detectors);
  assert.deepEqual(updated.budget, thresholds.budget);
});

test("the command refuses a narrowed run before it fetches anything", async () => {
  await execute(process.execPath, ["--version"]);
  await assert.rejects(
    execute(process.execPath, [resolve("dist/benchmarks/record-corpus-run.js"), "--ecosystem", "php"]),
    (error: { code: number; stderr: string }) => error.code === 2 && /--ecosystem narrows the run/.test(error.stderr),
  );
  await assert.rejects(
    execute(process.execPath, [resolve("dist/benchmarks/record-corpus-run.js"), "--observe"]),
    (error: { code: number; stderr: string }) => error.code === 2 && /--observe is not allowed/.test(error.stderr),
  );
});

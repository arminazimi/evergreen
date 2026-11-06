import assert from "node:assert/strict";
import { test } from "node:test";

import { buildReport, reportFailed } from "../benchmarks/corpus-result.js";
import type { CorpusRepositoryResult } from "../benchmarks/corpus-harness.js";
import type { Thresholds } from "../benchmarks/thresholds.js";

const thresholds: Thresholds = {
  schemaVersion: "evergreen.corpus-thresholds.v1",
  budget: { maxWallSeconds: 100, maxFetchedBytes: 100_000_000 },
  detectors: {
    npm: { level: "stable", stable: true, minPrecision: 0.95 },
    python: { level: "beta", stable: true, minPrecision: 0.95 },
  },
};

function result(overrides: Partial<CorpusRepositoryResult> = {}): CorpusRepositoryResult {
  return {
    repository: "owner/repo",
    commit: "a".repeat(40),
    ecosystem: "node",
    checkoutMs: 2,
    durationMs: 10,
    findings: [{ ruleId: "npm.package.request.deprecated", path: "package.json", line: 1 }],
    truePositives: 1,
    falsePositives: 0,
    falseNegatives: 0,
    unexpected: [],
    missing: [],
    ...overrides,
  };
}

const cost = { wallMs: 5000, fetchMs: 1000, cacheHits: 1, cacheMisses: 0, bytesFetched: 0 };

test("a full report scores detectors and enforces the floors", () => {
  const report = buildReport({
    results: [
      result({
        truePositives: 1,
        falseNegatives: 4,
        missing: [
          "npm.package.request.deprecated:package.json:2",
          "npm.package.request.deprecated:package.json:3",
          "npm.package.request.deprecated:package.json:4",
          "npm.package.request.deprecated:package.json:5",
        ],
      }),
    ],
    full: true,
    observeOnly: false,
    thresholds,
    cost,
  });
  assert.equal(report.fullRun, true);
  assert.equal(report.schemaVersion, "evergreen.public-validation-result.v1");
  assert.equal(report.summary.falseNegatives, 4);
  // npm is stable (recall floor 0.90) and this run found 1 of 5 expected findings.
  assert.deepEqual(report.recallViolations, [{ detector: "npm", recall: 0.2, minRecall: 0.9 }]);
  assert.equal(reportFailed(report), true);
});

test("a filtered or sharded report reports mismatches but does not enforce a floor", () => {
  const shard = buildReport({
    results: [
      result({
        truePositives: 1,
        falseNegatives: 4,
        missing: [
          "npm.package.request.deprecated:package.json:2",
          "npm.package.request.deprecated:package.json:3",
          "npm.package.request.deprecated:package.json:4",
          "npm.package.request.deprecated:package.json:5",
        ],
      }),
    ],
    full: false,
    observeOnly: false,
    shard: { index: 1, count: 4 },
    thresholds,
    cost,
  });
  assert.equal(shard.fullRun, false);
  assert.deepEqual(shard.shard, { index: 1, count: 4 });
  assert.deepEqual(shard.recallViolations, []);
  assert.deepEqual(shard.thresholdViolations, []);
  assert.equal(reportFailed(shard), true, "the missing findings still fail the run");
});

test("a failed scan is counted and named, and fails the run", () => {
  const report = buildReport({
    results: [
      result({
        findings: [],
        truePositives: 0,
        falseNegatives: 1,
        missing: ["npm.package.request.deprecated:package.json:1"],
        error: "scan exceeded the 1024 MB per-repository memory limit",
      }),
    ],
    full: false,
    observeOnly: false,
    thresholds,
    cost,
  });
  assert.equal(report.summary.scanErrors, 1);
  assert.equal(report.repositories[0]?.error, "scan exceeded the 1024 MB per-repository memory limit");
  assert.equal(reportFailed(report), true);
});

test("a merged report compares total fetched bytes to the per-shard limit times the shard count", () => {
  const bytes = { ...cost, bytesFetched: 150_000_000 };
  const merged = buildReport({
    results: [result()],
    full: true,
    observeOnly: false,
    thresholds,
    cost: bytes,
    fetchedMultiplier: 2,
  });
  assert.deepEqual(merged.budgetWarnings, []);
  const single = buildReport({ results: [result()], full: true, observeOnly: false, thresholds, cost: bytes });
  assert.match(single.budgetWarnings?.[0] ?? "", /fetched 150\.0 MB exceeds the budget of 100\.0 MB/);
});

test("a clean run has no warnings and does not fail", () => {
  const report = buildReport({ results: [result()], full: true, observeOnly: false, thresholds, cost });
  assert.deepEqual(report.thresholdViolations, []);
  assert.deepEqual(report.recallViolations, []);
  assert.deepEqual(report.budgetWarnings, []);
  assert.equal(reportFailed(report), false);
});

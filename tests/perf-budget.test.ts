import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import {
  PERF_BUDGET,
  createCleanFixtureProject,
  evaluatePerfBudget,
  formatPerfBudgetSummary,
  runPerfBenchmark,
  type PerfBudgetMeasurements,
} from "../benchmarks/perf-budget.js";

const FITTING_MEASUREMENTS: PerfBudgetMeasurements = {
  wallMsPerRun: [100, 110, 120],
  meanWallMs: 110,
  peakRssBytes: 256 * 1024 * 1024,
  findingsCount: 4,
};

test("the evaluator passes measurements that fit the documented budget", () => {
  assert.deepEqual(evaluatePerfBudget(FITTING_MEASUREMENTS, PERF_BUDGET), []);
});

test("the evaluator passes at the exact budget boundary", () => {
  const atTheBoundary = {
    ...FITTING_MEASUREMENTS,
    meanWallMs: PERF_BUDGET.maxMeanWallMs,
    peakRssBytes: PERF_BUDGET.maxPeakRssBytes,
  };
  assert.deepEqual(evaluatePerfBudget(atTheBoundary, PERF_BUDGET), []);
});

test("the evaluator fails a wall-time regression and names both numbers", () => {
  const violations = evaluatePerfBudget({ ...FITTING_MEASUREMENTS, meanWallMs: PERF_BUDGET.maxMeanWallMs + 1 }, PERF_BUDGET);
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /wall time .* exceeded the 2000 ms budget/);
});

test("the evaluator fails a memory regression and names both numbers", () => {
  const violations = evaluatePerfBudget(
    { ...FITTING_MEASUREMENTS, peakRssBytes: PERF_BUDGET.maxPeakRssBytes + 1024 },
    PERF_BUDGET,
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /peak memory .* exceeded the 768 MB budget/);
});

test("the evaluator fails a scan that finds nothing", () => {
  const violations = evaluatePerfBudget({ ...FITTING_MEASUREMENTS, findingsCount: 0 }, PERF_BUDGET);
  assert.match(violations[0]!, /no findings/);
});

test("a deliberate slowdown trips the check", async () => {
  const slowedDown = await runPerfBenchmark({
    budget: { maxMeanWallMs: 1, maxPeakRssBytes: Number.MAX_SAFE_INTEGER },
    warmupRuns: 0,
    measuredRuns: 1,
    simulatedSlowdownMs: 25,
  });
  assert.equal(slowedDown.withinBudget, false);
  assert.match(slowedDown.violations[0]!, /wall time/);
  assert.ok(slowedDown.meanWallMs >= 25, "the simulated slowdown is part of the measured wall time");
});

test("the unmodified fixed-fixture scan sits within the budget and finds the deprecated package", async () => {
  const result = await runPerfBenchmark({ warmupRuns: 1, measuredRuns: 2 });
  assert.equal(result.withinBudget, true, result.violations.join("; "));
  assert.ok(result.findingsCount > 0);
  assert.equal(result.wallMsPerRun.length, 2);
});

test("the summary names the fixture, the measurements, the budget, and the outcome", async () => {
  const result = await runPerfBenchmark({ warmupRuns: 0, measuredRuns: 1 });
  const summary = formatPerfBudgetSummary(result);
  assert.match(summary, /tests\/fixtures\/smoke/);
  assert.match(summary, /mean \d+ ms over 1 run/);
  assert.match(summary, /peak memory \d+ MB/);
  assert.match(summary, /- PASSED/);
});

test("createCleanFixtureProject copies the fixture into a clean directory and cleans up", async () => {
  const clean = await createCleanFixtureProject();
  try {
    assert.ok(existsSync(join(clean.directory, "package.json")));
    const fixture = JSON.parse(await readFile(join(clean.directory, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    assert.ok(fixture.dependencies?.request);
  } finally {
    await clean.cleanup();
  }
  assert.equal(existsSync(clean.directory), false);
});

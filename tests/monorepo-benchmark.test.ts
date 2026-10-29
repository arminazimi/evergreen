import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import {
  MONOREPO_BUDGET,
  countFiles,
  createSyntheticMonorepo,
  evaluateMonorepoBudget,
  formatMonorepoSummary,
  runMonorepoBenchmark,
  type MonorepoMeasurements,
} from "../benchmarks/monorepo.js";

const FITTING_MEASUREMENTS: MonorepoMeasurements = {
  wallMsPerRun: [800, 850, 900],
  meanWallMs: 850,
  peakRssBytes: 256 * 1024 * 1024,
  findingsCount: 4,
  fileCount: 100_000,
};

test("the evaluator passes measurements that fit the documented budget", () => {
  assert.deepEqual(evaluateMonorepoBudget(FITTING_MEASUREMENTS, MONOREPO_BUDGET), []);
});

test("the evaluator passes at the exact budget boundary", () => {
  const atTheBoundary = {
    ...FITTING_MEASUREMENTS,
    meanWallMs: MONOREPO_BUDGET.maxMeanWallMs,
    fileCount: MONOREPO_BUDGET.minFiles,
  };
  assert.deepEqual(evaluateMonorepoBudget(atTheBoundary, MONOREPO_BUDGET), []);
});

test("the evaluator fails a wall-time regression and names both numbers", () => {
  const violations = evaluateMonorepoBudget(
    { ...FITTING_MEASUREMENTS, meanWallMs: MONOREPO_BUDGET.maxMeanWallMs + 1 },
    MONOREPO_BUDGET,
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /wall time .* exceeded the 5000 ms budget/);
});

test("the evaluator fails when the file count is below the floor", () => {
  const violations = evaluateMonorepoBudget({ ...FITTING_MEASUREMENTS, fileCount: MONOREPO_BUDGET.minFiles - 1 }, MONOREPO_BUDGET);
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /file count .* below the 100000 file floor/);
});

test("the evaluator fails a scan that finds nothing", () => {
  const violations = evaluateMonorepoBudget({ ...FITTING_MEASUREMENTS, findingsCount: 0 }, MONOREPO_BUDGET);
  assert.match(violations[0]!, /no findings/);
});

test("a deliberate slowdown trips the check on a small synthetic fixture", async () => {
  const slowedDown = await runMonorepoBenchmark({
    budget: { maxMeanWallMs: 1, minFiles: 20 },
    fileCount: 40,
    packages: 4,
    warmupRuns: 0,
    measuredRuns: 1,
    simulatedSlowdownMs: 25,
  });
  assert.equal(slowedDown.withinBudget, false);
  assert.match(slowedDown.violations[0]!, /wall time/);
  assert.ok(slowedDown.meanWallMs >= 25, "the simulated slowdown is part of the measured wall time");
  assert.ok(slowedDown.fileCount >= 20);
  assert.ok(slowedDown.findingsCount > 0);
});

test("a small synthetic fixture scans within a relaxed budget and finds the deprecated package", async () => {
  const result = await runMonorepoBenchmark({
    budget: { maxMeanWallMs: 5_000, minFiles: 30 },
    fileCount: 50,
    packages: 5,
    warmupRuns: 0,
    measuredRuns: 1,
  });
  assert.equal(result.withinBudget, true, result.violations.join("; "));
  assert.ok(result.findingsCount > 0);
  assert.ok(result.fileCount >= 30);
  assert.equal(result.schemaVersion, "evergreen.monorepo-benchmark.v1");
  assert.equal(result.noCache, true);
});

test("the summary names the fixture, the measurements, the budget, and the outcome", async () => {
  const result = await runMonorepoBenchmark({
    budget: { maxMeanWallMs: 5_000, minFiles: 20 },
    fileCount: 30,
    packages: 3,
    warmupRuns: 0,
    measuredRuns: 1,
  });
  const summary = formatMonorepoSummary(result);
  assert.match(summary, /synthetic:\d+-files/);
  assert.match(summary, /mean \d+ ms over 1 run/);
  assert.match(summary, /peak memory \d+ MB/);
  assert.match(summary, /noCache=true/);
  assert.match(summary, /- PASSED/);
});

test("createSyntheticMonorepo builds the requested file count with workspaces and cleans up", async () => {
  const synthetic = await createSyntheticMonorepo({ fileCount: 35, packages: 4 });
  try {
    assert.equal(synthetic.fileCount, await countFiles(synthetic.directory));
    assert.ok(synthetic.fileCount >= 35);
    assert.ok(existsSync(join(synthetic.directory, "package.json")));
    const root = JSON.parse(await readFile(join(synthetic.directory, "package.json"), "utf8")) as {
      workspaces?: string[];
      dependencies?: Record<string, string>;
    };
    assert.deepEqual(root.workspaces, ["packages/*"]);
    assert.ok(root.dependencies?.request);
    assert.ok(existsSync(join(synthetic.directory, "packages", "pkg-000", "package.json")));
  } finally {
    await synthetic.cleanup();
  }
  assert.equal(existsSync(synthetic.directory), false);
});

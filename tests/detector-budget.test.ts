import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateDetectorBudgets,
  formatDetectorBudgetSummary,
  loadDetectorBudgets,
  runDetectorBudget,
  type DetectorBudgets,
} from "../benchmarks/detector-budget.js";
import { builtInDetectors } from "../src/detectors/index.js";

const BUDGETS: DetectorBudgets = {
  schemaVersion: "evergreen.detector-budgets.v1",
  corpus: "tests/fixtures",
  runs: 1,
  retries: 0,
  maxMedianWallMs: { go: 100, npm: 200 },
};

test("every built-in detector has a budget and no budget is stale", async () => {
  const budgets = await loadDetectorBudgets();
  assert.deepEqual(Object.keys(budgets.maxMedianWallMs).sort(), builtInDetectors.map((d) => d.id).sort());
  for (const ceiling of Object.values(budgets.maxMedianWallMs)) assert.ok(ceiling >= 750);
});

test("the evaluator passes detectors at or under their budget", () => {
  assert.deepEqual(
    evaluateDetectorBudgets(
      [
        { detector: "go", medianWallMs: 100 },
        { detector: "npm", medianWallMs: 5 },
      ],
      BUDGETS,
    ),
    [],
  );
});

test("the evaluator names the slow detector and both numbers", () => {
  const violations = evaluateDetectorBudgets(
    [
      { detector: "go", medianWallMs: 101 },
      { detector: "npm", medianWallMs: 5 },
    ],
    BUDGETS,
  );
  assert.deepEqual(violations, ["detector go: median scan time 101 ms exceeded the 100 ms budget"]);
});

test("the evaluator rejects an unbudgeted detector and a stale budget", () => {
  const violations = evaluateDetectorBudgets([{ detector: "go", medianWallMs: 1 }], {
    ...BUDGETS,
    maxMedianWallMs: { go: 100, gone: 100 },
  }).concat(
    evaluateDetectorBudgets([{ detector: "new", medianWallMs: 1 }], {
      ...BUDGETS,
      maxMedianWallMs: {},
    }),
  );
  assert.equal(violations.length, 2);
  assert.match(violations[0] ?? "", /gone, which is not a built-in detector/);
  assert.match(violations[1] ?? "", /detector new has no budget/);
});

test("a simulated slowdown in one detector fails the gate with that detector's name", async () => {
  const detectors = builtInDetectors.filter((detector) => ["go", "npm"].includes(detector.id));
  const budgets = { ...BUDGETS, maxMedianWallMs: { go: 750, npm: 600_000 } };
  const slow = await runDetectorBudget({ detectors, budgets, simulatedSlowdown: { detector: "go", ms: 900 } });
  assert.equal(slow.withinBudget, false);
  assert.equal(slow.violations.length, 1);
  assert.match(slow.violations[0] ?? "", /^detector go: median scan time \d+ ms exceeded the 750 ms budget$/);
  assert.match(formatDetectorBudgetSummary(slow), /FAILED/);
});

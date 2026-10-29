import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACTION_COLD_START_BUDGET_MS,
  ACTION_COLD_START_TOLERANCE,
  actionEnvironment,
  evaluateActionColdStart,
  type ActionColdStartMeasurements,
} from "../benchmarks/action-cold-start.js";

const FITTING_MEASUREMENTS: ActionColdStartMeasurements = {
  durationMs: 300,
  findingsCount: 4,
  exitCode: 0,
  stderrTail: null,
};

test("the evaluator passes a measurement that fits the budget", () => {
  assert.deepEqual(evaluateActionColdStart(FITTING_MEASUREMENTS), []);
});

test("the evaluator passes at the tolerance boundary and fails one millisecond past it", () => {
  const thresholdMs = ACTION_COLD_START_BUDGET_MS * (1 + ACTION_COLD_START_TOLERANCE);
  assert.deepEqual(evaluateActionColdStart({ ...FITTING_MEASUREMENTS, durationMs: thresholdMs }), []);
  const violations = evaluateActionColdStart({ ...FITTING_MEASUREMENTS, durationMs: thresholdMs + 1 });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /cold start 18001 ms exceeded the 15000 ms budget by more than 20%/);
});

test("a run that spends the 20% tolerance still fails with the tolerance set to zero", () => {
  const violations = evaluateActionColdStart(
    { ...FITTING_MEASUREMENTS, durationMs: ACTION_COLD_START_BUDGET_MS + 1 },
    ACTION_COLD_START_BUDGET_MS,
    0,
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /exceeded the 15000 ms budget by more than 0%/);
});

test("a failed Action and an empty report are violations, so a broken run cannot pass as fast", () => {
  assert.match(evaluateActionColdStart({ ...FITTING_MEASUREMENTS, exitCode: 1 })[0]!, /exited 1 instead of writing a report/);
  assert.match(evaluateActionColdStart({ ...FITTING_MEASUREMENTS, findingsCount: 0 })[0]!, /produced no findings/);
});

test("the measured environment sets the runner paths and drops inherited inputs and GitHub context", () => {
  process.env.INPUT_BASELINE = ".evergreen-baseline.json";
  process.env.GITHUB_EVENT_PATH = "/tmp/event.json";
  try {
    const env = actionEnvironment("/workspace", "/runner-temp");
    assert.equal(env.INPUT_BASELINE, undefined);
    assert.equal(env.GITHUB_EVENT_PATH, undefined);
    assert.equal(env.GITHUB_WORKSPACE, "/workspace");
    assert.equal(env.RUNNER_TEMP, "/runner-temp");
    assert.equal(env["INPUT_FAIL-ON-SEVERITY"], "none");
    assert.equal(env.EVERGREEN_NO_CACHE, "1");
  } finally {
    delete process.env.INPUT_BASELINE;
    delete process.env.GITHUB_EVENT_PATH;
  }
});

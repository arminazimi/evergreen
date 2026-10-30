import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EXPECTED_TASK_COUNT,
  SCHEMA_VERSION,
  loadBundledRegistryRules,
  loadGuardrailTasks,
  validateGuardrailTasks,
} from "../benchmarks/agent-guardrail/validate.js";

test("the agent guardrail tasks define 20 add-dependency prompts", () => {
  const file = loadGuardrailTasks();
  assert.equal(file.schemaVersion, SCHEMA_VERSION);
  assert.equal(file.tasks.length, EXPECTED_TASK_COUNT);
});

test("every guardrail task validates against the bundled registry offline", () => {
  const result = validateGuardrailTasks(loadGuardrailTasks(), loadBundledRegistryRules());
  assert.deepEqual(
    result.issues,
    [],
    result.issues.map((issue) => `${issue.taskId}: ${issue.message}`).join("\n"),
  );
  assert.equal(result.ok, true);
  assert.equal(result.taskCount, EXPECTED_TASK_COUNT);
});

test("guardrail tasks span several ecosystems", () => {
  const rules = new Map(loadBundledRegistryRules().map((rule) => [rule.id, rule]));
  const ecosystems = new Set<string>();
  for (const task of loadGuardrailTasks().tasks) {
    const rule = rules.get(task.ruleId);
    assert.ok(rule, `missing rule ${task.ruleId}`);
    ecosystems.add(rule.ecosystem);
  }
  assert.ok(ecosystems.size >= 3, `expected several ecosystems, found ${[...ecosystems].sort().join(", ")}`);
});

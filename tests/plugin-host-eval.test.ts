import assert from "node:assert/strict";
import { test } from "node:test";

import { runPluginHostEval } from "../benchmarks/plugin-host-eval.js";

test("Codex and Claude pass the same plugin workflow and security corpus", async () => {
  const result = await runPluginHostEval();

  assert.equal(result.passed, true);
  assert.equal(result.sharedImplementation, true);
  assert.equal(result.workflow.hostOutputParity, true);
  assert.equal(result.workflow.untrustedInstructionsIgnored, true);
  assert.equal(result.workflow.suggestedCommandsExecuted, false);
  assert.deepEqual(result.hosts.codex.triggers, result.hosts.claude.triggers);
  assert.equal(result.hosts.codex.context.withinBudget, true);
  assert.equal(result.hosts.claude.context.withinBudget, true);
  assert.equal(result.permissions.noCredentialsDeclared, true);
  assert.equal(result.permissions.noLifecycleHooksDeclared, true);
});

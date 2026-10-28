import assert from "node:assert/strict";
import { test } from "node:test";

import { runAgentLoopEval } from "../benchmarks/agent-loop/index.js";

test("agent-loop evaluation passes for all supported hosts end to end", async () => {
  const result = await runAgentLoopEval();

  assert.equal(result.passed, true);
  assert.equal(result.totalCasesPerHost, 3);

  // Claude: PreToolUse hook denies the install command
  const claude = result.hosts.claude;
  assert.equal(claude.allPassed, true);
  assert.equal(claude.checkRecall, 1);
  assert.equal(claude.refusalRate, 1);
  assert.equal(claude.replacementRate, 1);
  assert.equal(claude.installBlockedRate, 1);
  assert.equal(claude.cliGuardRefusalRate, 1);
  assert.ok(claude.cases.every((c) => c.refused && !c.warned && c.passed && c.replacement !== null));

  // Codex: PostToolUse hook warns on manifest edit and advises replacement
  const codex = result.hosts.codex;
  assert.equal(codex.allPassed, true);
  assert.equal(codex.checkRecall, 1);
  assert.equal(codex.warningRate, 1);
  assert.equal(codex.replacementRate, 1);
  assert.equal(codex.installBlockedRate, 1);
  assert.equal(codex.cliGuardRefusalRate, 1);
  assert.ok(codex.cases.every((c) => !c.refused && c.warned && c.passed && c.replacement !== null));
});

test("stubbing Claude hook to produce no output fails Claude even though CLI guard blocks", async () => {
  const silentClaude = { run: async () => undefined };
  const result = await runAgentLoopEval({ hooks: { claudeGuard: silentClaude } });

  assert.equal(result.passed, false);
  const claude = result.hosts.claude;
  assert.equal(claude.allPassed, false);
  assert.equal(claude.refusalRate, 0);
  assert.equal(claude.replacementRate, 0);
  assert.ok(claude.cases.every((c) => !c.refused && !c.passed && c.cliGuardRefused && c.installBlocked));

  // Codex still passes when only Claude is stubbed
  assert.equal(result.hosts.codex.allPassed, true);
});

test("stubbing Codex hook to produce no output fails Codex even though CLI guard blocks", async () => {
  const silentCodex = { run: () => undefined };
  const result = await runAgentLoopEval({ hooks: { codexGuard: silentCodex } });

  assert.equal(result.passed, false);
  const codex = result.hosts.codex;
  assert.equal(codex.allPassed, false);
  assert.equal(codex.warningRate, 0);
  assert.equal(codex.replacementRate, 0);
  assert.ok(codex.cases.every((c) => !c.warned && !c.passed && c.cliGuardRefused && c.installBlocked));

  // Claude still passes when only Codex is stubbed
  assert.equal(result.hosts.claude.allPassed, true);
});

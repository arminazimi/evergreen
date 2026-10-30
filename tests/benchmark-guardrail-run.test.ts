import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ADDED_PURLS_FILENAME,
  SCHEMA_VERSION,
  baselinePrompt,
  createFakeGuardrailAgent,
  guardrailPrompt,
  installGuardrail,
  readAddedPurls,
  runGuardrailTask,
} from "../benchmarks/agent-guardrail/run.js";
import type { AgentAdapter } from "../benchmarks/agent-guardrail/run.js";
import { loadGuardrailTasks } from "../benchmarks/agent-guardrail/validate.js";

const jade = {
  id: "npm-jade",
  request: "Add jade as the template engine for server-rendered pages.",
  purl: "pkg:npm/jade",
  ruleId: "npm.package.jade.deprecated",
  replacement: "pug",
};

test("the fake adapter scripts baseline added-deprecated and guardrail refused", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "evergreen-guardrail-results-"));
  try {
    const result = await runGuardrailTask(jade, {
      agent: createFakeGuardrailAgent(),
      outputDir,
    });

    assert.equal(result.schemaVersion, SCHEMA_VERSION);
    assert.equal(result.taskId, "npm-jade");
    assert.equal(result.attempts.length, 2);

    const baseline = result.attempts.find((attempt) => attempt.arm === "baseline");
    const guardrail = result.attempts.find((attempt) => attempt.arm === "guardrail");
    assert.ok(baseline);
    assert.ok(guardrail);

    assert.equal(baseline.outcome, "added-deprecated");
    assert.deepEqual(baseline.addedPurls, ["pkg:npm/jade"]);
    assert.equal(baseline.agent.name, "fake-guardrail");
    assert.equal(baseline.agent.exitCode, 0);
    assert.ok(baseline.prompt.includes("ARM: baseline"));
    assert.ok(!baseline.prompt.includes("evergreen-check-before-add"));

    assert.equal(guardrail.outcome, "refused");
    assert.deepEqual(guardrail.addedPurls, []);
    assert.ok(guardrail.prompt.includes("ARM: guardrail"));
    assert.ok(guardrail.prompt.includes("evergreen-check-before-add"));
    assert.ok(guardrail.prompt.includes("check_dependency"));

    assert.equal(result.score.baseline.counts["added-deprecated"], 1);
    assert.equal(result.score.guardrail.counts.refused, 1);
    assert.equal(result.score.baseline.rates["added-deprecated"], 1);
    assert.equal(result.score.guardrail.rates.refused, 1);

    for (const attempt of result.attempts) {
      assert.ok(attempt.resultPath);
      const written = JSON.parse(await readFile(attempt.resultPath, "utf8")) as {
        schemaVersion: string;
        arm: string;
        outcome: string;
        addedPurls: string[];
      };
      assert.equal(written.schemaVersion, SCHEMA_VERSION);
      assert.equal(written.arm, attempt.arm);
      assert.equal(written.outcome, attempt.outcome);
      assert.deepEqual(written.addedPurls, attempt.addedPurls);

      const expectedName = join(outputDir, `${attempt.taskId}.${attempt.arm}.json`);
      assert.equal(attempt.resultPath, expectedName);
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("result files are written for a single arm and worktrees are removed", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "evergreen-guardrail-one-arm-"));
  try {
    const result = await runGuardrailTask(jade, {
      agent: createFakeGuardrailAgent(),
      arms: ["guardrail"],
      outputDir,
    });

    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0]?.arm, "guardrail");
    assert.equal(result.attempts[0]?.outcome, "refused");
    await access(join(outputDir, "npm-jade.guardrail.json"));
    await assert.rejects(access(join(outputDir, "npm-jade.baseline.json")));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("installGuardrail writes the skill and AGENTS.md into a directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-guardrail-install-"));
  try {
    await installGuardrail(root, "# fake skill\n\nCall check_dependency.\n");
    const skill = await readFile(join(root, ".agents/skills/evergreen-check-before-add/SKILL.md"), "utf8");
    assert.ok(skill.includes("check_dependency"));
    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    assert.ok(agents.includes("evergreen-check-before-add"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readAddedPurls returns an empty list when the file is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-guardrail-empty-"));
  try {
    assert.deepEqual(await readAddedPurls(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prompts carry the arm markers the fake adapter needs", () => {
  assert.ok(baselinePrompt(jade).includes("TASK_PURL: pkg:npm/jade"));
  assert.ok(baselinePrompt(jade).includes(`to ${ADDED_PURLS_FILENAME}`));
  assert.ok(guardrailPrompt(jade, "skill body").includes("skill body"));
  assert.ok(guardrailPrompt(jade, "skill body").includes("ARM: guardrail"));
});

test("a custom collector can supply added Package URLs", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "evergreen-guardrail-collector-"));
  const agent: AgentAdapter = {
    name: "idle",
    async run() {
      return { exitCode: 0, signal: null, stdout: "", stderr: "", timedOut: false };
    },
  };
  try {
    const result = await runGuardrailTask(jade, {
      agent,
      arms: ["baseline"],
      outputDir,
      collectAddedPurls: async () => ["pkg:npm/pug"],
    });
    assert.equal(result.attempts[0]?.outcome, "named-replacement");
    assert.deepEqual(result.attempts[0]?.addedPurls, ["pkg:npm/pug"]);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("the harness loads the checked-in guardrail tasks", () => {
  const tasks = loadGuardrailTasks();
  assert.equal(tasks.schemaVersion, "evergreen.agent-guardrail.v1");
  assert.equal(tasks.tasks.length, 20);
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  PLAN_ARMS,
  RESOLUTION_DIR,
  SCHEMA_VERSION,
  createFakePlanAgent,
  loadPlanTasks,
  planTaskPrompt,
  runPlanBenchmark,
} from "../benchmarks/agent-plan/run.js";
import type { AgentAdapter } from "../benchmarks/agent-migrations/run.js";
import { generateReport } from "../tools/benchmark-report.js";

const execute = promisify(execFile);
const cli = resolve("dist/benchmarks/agent-plan/run.js");
const schemaPath = resolve("schemas/benchmark-result.v1.schema.json");

async function schemaValidator() {
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as object;
  return new Ajv2020({ allErrors: true }).compile(schema);
}

const idleAgent: AgentAdapter = {
  name: "idle",
  async run() {
    return { exitCode: 0, signal: null, stdout: "", stderr: "", timedOut: false };
  },
};

test("the plan fixture produces at least eight tasks across six waves in wave order", async () => {
  const tasks = await loadPlanTasks();

  assert.ok(tasks.length >= 8, `expected at least 8 tasks, got ${tasks.length}`);
  assert.equal(new Set(tasks.map((task) => task.id)).size, tasks.length, "task ids are unique");

  const waves = tasks.map((task) => task.wave);
  assert.deepEqual(
    [...waves].sort((left, right) => left - right),
    waves,
    "tasks are in wave order",
  );
  const waveCount = new Set(waves).size;
  assert.ok(waveCount >= 1 && waveCount < tasks.length, "at least one wave holds several tasks");

  for (const task of tasks) {
    assert.equal(task.findingId, task.id);
    assert.ok(task.title.length > 0);
    assert.ok(task.touches.length > 0, `${task.id} touches at least one file`);
    assert.ok(task.resolutionPath.startsWith(`${RESOLUTION_DIR}/`), task.resolutionPath);
  }
  assert.equal(new Set(tasks.map((task) => task.resolutionPath)).size, tasks.length, "resolution paths are unique");
});

test("the fake adapter reports both timings and every finding resolved", async () => {
  const tasks = await loadPlanTasks();
  const delays = Object.fromEntries(tasks.map((task) => [task.id, task.wave === 0 ? 60 : 20]));
  const outputDir = await mkdtemp(join(tmpdir(), "evergreen-plan-results-"));

  try {
    const run = await runPlanBenchmark({
      agent: createFakePlanAgent({ delays }),
      agentName: "fake-plan",
      agentVersion: "1.0.0",
      model: { name: "fake-model", version: "2026-11-01" },
      runId: "plan-fixture",
      outputDir,
    });

    assert.equal(run.result.schemaVersion, "evergreen.benchmark-result.v1");
    assert.equal(run.result.kind, "plan");
    assert.equal(run.result.id, "plan-fixture");
    assert.deepEqual(run.result.agent, { name: "fake-plan", version: "1.0.0" });
    assert.deepEqual(run.result.model, { name: "fake-model", version: "2026-11-01" });

    assert.deepEqual(
      run.result.arms.map((arm) => arm.arm),
      [...PLAN_ARMS],
    );
    assert.deepEqual(
      run.arms.map((arm) => arm.arm),
      [...PLAN_ARMS],
    );

    for (const arm of run.result.arms) {
      assert.equal(arm.findings, tasks.length);
      assert.equal(arm.resolved, tasks.length);
      assert.equal(arm.resolutionRate, 1);
      assert.ok(arm.durationMs >= 0);
    }

    const sequential = run.arms.find((arm) => arm.arm === "sequential");
    const waveParallel = run.arms.find((arm) => arm.arm === "wave-parallel");
    assert.ok(sequential && waveParallel);
    assert.equal(sequential.tasks.length, tasks.length);
    assert.equal(waveParallel.tasks.length, tasks.length);
    assert.deepEqual(
      sequential.tasks.map((task) => task.taskId),
      tasks.map((task) => task.id),
    );
    assert.ok(sequential.tasks.every((task) => task.resolved && task.exitCode === 0));

    assert.ok(
      waveParallel.durationMs < sequential.durationMs,
      `wave-parallel (${waveParallel.durationMs} ms) must finish before sequential (${sequential.durationMs} ms)`,
    );
    assert.ok(run.speedup > 1, `expected a speedup above 1, got ${run.speedup}`);

    const written = JSON.parse(await readFile(join(outputDir, "plan-fixture.json"), "utf8")) as unknown;
    assert.equal(run.resultPath, join(outputDir, "plan-fixture.json"));
    const validate = await schemaValidator();
    assert.equal(validate(written), true, JSON.stringify(validate.errors));
    assert.deepEqual(written, JSON.parse(JSON.stringify(run.result)));

    const markdown = await generateReport(outputDir);
    assert.ok(markdown.includes("## Plan"));
    assert.ok(markdown.includes("### sequential"));
    assert.ok(markdown.includes("### wave-parallel"));
    assert.match(markdown, /\| fake-plan \| 1\.0\.0 \| fake-model \| 2026-11-01 \|/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("an adapter that leaves every finding unresolved is counted as zero", async () => {
  const tasks = await loadPlanTasks();
  const run = await runPlanBenchmark({ agent: idleAgent, runId: "idle" });

  assert.equal(run.result.arms.length, 2);
  for (const arm of run.result.arms) {
    assert.equal(arm.findings, tasks.length);
    assert.equal(arm.resolved, 0);
    assert.equal(arm.resolutionRate, 0);
    assert.ok(arm.durationMs >= 0);
  }
  assert.ok(run.arms.every((arm) => arm.tasks.every((task) => task.resolved === false)));
  assert.equal(run.speedup >= 0, true);
});

test("an adapter that throws is recorded per task and does not abort the run", async () => {
  const tasks = await loadPlanTasks();
  const failingAgent: AgentAdapter = {
    name: "boom",
    async run() {
      throw new Error("boom");
    },
  };
  const run = await runPlanBenchmark({ agent: failingAgent, runId: "boom" });

  const results = run.arms.flatMap((arm) => arm.tasks);
  assert.equal(results.length, tasks.length * 2);
  for (const result of results) {
    assert.equal(result.resolved, false);
    assert.equal(result.exitCode, null);
    assert.equal(result.error, "agent failed: boom");
  }
  assert.ok(run.result.arms.every((arm) => arm.resolved === 0));
});

test("task prompts carry the markers and resolution path the adapter needs", async () => {
  const tasks = await loadPlanTasks();
  const task = tasks[0];
  assert.ok(task);

  const prompt = planTaskPrompt(task);
  assert.ok(prompt.includes(`TASK_ID: ${task.id}`));
  assert.ok(prompt.includes(`FINDING_ID: ${task.findingId}`));
  assert.ok(prompt.includes(`RESOLUTION_FILE: ${task.resolutionPath}`));
  assert.ok(prompt.includes(task.touches[0]!));
  assert.ok(prompt.includes(`Wave: ${task.wave}`));
});

test("the CLI runs both arms offline and prints the result document", async () => {
  const { stdout } = await execute(
    process.execPath,
    [
      cli,
      "--agent",
      "fake",
      "--task-delay-ms",
      "5",
      "--run-id",
      "cli-run",
      "--agent-name",
      "fake-plan",
      "--agent-version",
      "1.0.0",
      "--model-name",
      "none",
      "--model-version",
      "0",
      "--json",
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );

  const result = JSON.parse(stdout) as {
    schemaVersion: string;
    kind: string;
    id: string;
    arms: Array<{ arm: string; findings: number; resolved: number; resolutionRate: number }>;
  };
  assert.equal(result.schemaVersion, SCHEMA_VERSION);
  assert.equal(result.kind, "plan");
  assert.equal(result.id, "cli-run");
  assert.deepEqual(
    result.arms.map((arm) => arm.arm),
    [...PLAN_ARMS],
  );
  for (const arm of result.arms) {
    assert.ok(arm.findings >= 8);
    assert.equal(arm.resolved, arm.findings);
    assert.equal(arm.resolutionRate, 1);
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  aggregateScores,
  formatResultsTable,
  loadStalenessTasks,
  roundRate,
  scoreOutputs,
  type TaskScanScore,
} from "../benchmarks/agent-staleness/score.js";

const OUTPUTS = resolve("benchmarks/agent-staleness/outputs");

test("the task set has at least 40 prompts across the required categories", () => {
  const { tasks } = loadStalenessTasks();
  assert.ok(tasks.length >= 40, `expected ≥40 tasks, got ${tasks.length}`);
  const categories = new Set(tasks.map((task) => task.category));
  for (const required of [
    "dockerfile-node",
    "dockerfile-python",
    "dockerfile-go",
    "dockerfile-java",
    "gha-test",
    "gha-release",
    "gha-docker",
    "k8s-deployment",
    "k8s-ingress",
    "k8s-cronjob",
    "package-json",
    "pyproject",
    "go-mod",
    "terraform-lambda",
    "terraform-rds",
    "terraform-eks",
    "python-dates",
    "python-filesystem",
    "python-crypto",
    "node-dates",
    "node-filesystem",
    "node-crypto",
  ]) {
    assert.ok(categories.has(required), `missing category ${required}`);
  }
  for (const task of tasks) {
    assert.ok(task.id.length > 0);
    assert.ok(task.target.length > 0);
    assert.ok(task.prompt.length > 0);
    assert.equal(/\b\d+\.\d+\b|\bv\d+\b|node:\d+|python:\d+/i.test(task.prompt), false, task.id);
  }
});

test("scoring the committed seed outputs yields exact, deterministic counts", async () => {
  const first = await scoreOutputs({ outputsPath: OUTPUTS });
  const second = await scoreOutputs({ outputsPath: OUTPUTS });
  assert.equal(first.schemaVersion, "evergreen.agent-staleness.results.v1");
  assert.equal(first.tasks.length, 16);
  assert.deepEqual(
    first.tasks.map((task) => [task.agent, task.arm, task.taskId, task.findingCount, task.hasFinding, task.ruleIds]),
    second.tasks.map((task) => [task.agent, task.arm, task.taskId, task.findingCount, task.hasFinding, task.ruleIds]),
  );

  const byKey = new Map<string, TaskScanScore>(first.tasks.map((task) => [`${task.arm}/${task.taskId}`, task]));

  const expectFinding = (key: string, count: number, ruleIds: string[]) => {
    const score = byKey.get(key);
    assert.ok(score, key);
    assert.equal(score.findingCount, count, key);
    assert.equal(score.hasFinding, count > 0, key);
    assert.deepEqual(score.ruleIds, ruleIds, key);
  };

  expectFinding("plain/dockerfile-node-app", 1, ["container.node.eol-21-and-older"]);
  expectFinding("plain/gha-test-node", 3, [
    "github-actions.checkout.node20",
    "github-actions.setup-node.node20",
    "nodejs.runtime.legacy",
  ]);
  expectFinding("plain/k8s-ingress-edge", 1, ["kubernetes.extensions.ingress.v1beta1.removed"]);
  expectFinding("plain/k8s-cronjob-nightly", 1, ["kubernetes.batch.cronjob.v1beta1.removed"]);
  expectFinding("plain/manifest-package-json-cli", 1, ["npm.package.request.deprecated"]);
  expectFinding("plain/terraform-lambda-api", 1, ["serverless.aws-lambda.nodejs14.x"]);
  expectFinding("plain/terraform-eks-cluster", 1, ["terraform.eks.end-of-life-1.30-and-older"]);
  expectFinding("plain/python-dates-utcnow", 0, []);
  expectFinding("plain/node-crypto-cipher", 0, []);

  for (const task of first.tasks.filter((item) => item.arm === "hooks")) {
    assert.equal(task.findingCount, 0, `${task.arm}/${task.taskId}`);
    assert.equal(task.hasFinding, false);
    assert.deepEqual(task.ruleIds, []);
  }

  const plainWithFinding = first.tasks.filter((task) => task.arm === "plain" && task.hasFinding).length;
  const hooksWithFinding = first.tasks.filter((task) => task.arm === "hooks" && task.hasFinding).length;
  assert.equal(plainWithFinding, 7);
  assert.equal(hooksWithFinding, 0);
});

test("aggregates report share and findings-per-task stably", () => {
  const scores: TaskScanScore[] = [
    {
      taskId: "a",
      category: "dockerfile-node",
      agent: "seed",
      arm: "plain",
      findingCount: 2,
      ruleIds: ["r2", "r1"],
      hasFinding: true,
    },
    {
      taskId: "b",
      category: "dockerfile-node",
      agent: "seed",
      arm: "plain",
      findingCount: 0,
      ruleIds: [],
      hasFinding: false,
    },
    {
      taskId: "c",
      category: "gha-test",
      agent: "seed",
      arm: "hooks",
      findingCount: 1,
      ruleIds: ["r3"],
      hasFinding: true,
    },
  ];
  assert.deepEqual(aggregateScores(scores), [
    {
      agent: "seed",
      arm: "hooks",
      category: "gha-test",
      tasks: 1,
      tasksWithFinding: 1,
      shareWithFinding: 1,
      findingsPerTask: 1,
      ruleIds: ["r3"],
    },
    {
      agent: "seed",
      arm: "plain",
      category: "dockerfile-node",
      tasks: 2,
      tasksWithFinding: 1,
      shareWithFinding: roundRate(0.5),
      findingsPerTask: 1,
      ruleIds: ["r1", "r2"],
    },
  ]);
});

test("the markdown table is deterministic for empty and non-empty results", () => {
  assert.match(
    formatResultsTable({
      schemaVersion: "evergreen.agent-staleness.results.v1",
      scoredAt: "offline",
      tasks: [],
      aggregates: [],
    }),
    /_\(none\)_/,
  );
  const table = formatResultsTable({
    schemaVersion: "evergreen.agent-staleness.results.v1",
    scoredAt: "offline",
    tasks: [],
    aggregates: [
      {
        agent: "seed",
        arm: "plain",
        category: "gha-test",
        tasks: 1,
        tasksWithFinding: 1,
        shareWithFinding: 1,
        findingsPerTask: 3,
        ruleIds: ["a", "b"],
      },
    ],
  });
  assert.equal(
    table,
    [
      "| Agent | Arm | Category | Tasks | Tasks with finding | Share | Findings / task | Rule ids |",
      "| --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
      "| seed | plain | gha-test | 1 | 1 | 1.0000 | 3.0000 | a, b |",
    ].join("\n"),
  );
});

test("seed outputs are marked as hand-written seed data", async () => {
  const meta = JSON.parse(await readFile(resolve(OUTPUTS, "seed/plain/dockerfile-node-app/meta.json"), "utf8")) as {
    seed: boolean;
    agent: string;
    note: string;
  };
  assert.equal(meta.seed, true);
  assert.equal(meta.agent, "seed");
  assert.match(meta.note, /Hand-written seed/);
});

test("scoring tests import only the offline scorer, not the agent runner", async () => {
  const source = await readFile(new URL(import.meta.url), "utf8");
  assert.match(source, /agent-staleness\/score\.js/);
  assert.equal(/\bfrom\s+["'][^"']*agent-staleness\/run\.js["']/.test(source), false);
});

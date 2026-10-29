import assert from "node:assert/strict";
import { test } from "node:test";

import {
  allowedChangePaths,
  rateByCondition,
  scoreCondition,
  scoreMigration,
  scoreMigrationRun,
  summarizeScores,
} from "../benchmarks/agent-migrations/score.js";
import type { MigrationTask } from "../benchmarks/agent-migrations/run.js";

const task: Pick<MigrationTask, "id" | "finding" | "expectedEndState"> = {
  id: "fixture-request",
  finding: {
    ruleId: "npm.package.request.deprecated",
    path: "package.json",
    line: 5,
  },
  expectedEndState: {
    description: "package.json no longer depends on request.",
    checks: [{ path: "package.json", mustNotMatch: '"request":' }],
  },
};

function condition(overrides: {
  findingResolved?: boolean;
  verificationPassed?: boolean;
  changedFiles?: string[];
  label?: "baseline" | "packet";
}) {
  return {
    condition: overrides.label ?? "packet",
    expectedEndState: { passed: overrides.findingResolved ?? true, checks: [] },
    verification: {
      passed: overrides.verificationPassed ?? true,
      commands: [],
      durationMs: 0,
    },
    diff: { text: "", changedFiles: overrides.changedFiles ?? ["package.json"] },
  };
}

test("allowed paths include the finding, check paths, related paths, and companion lockfiles", () => {
  assert.deepEqual(
    allowedChangePaths({
      findingPath: "package.json",
      checkPaths: ["package.json", "gulpfile.js"],
      relatedPaths: ["src/client.ts"],
    }),
    [
      "bun.lock",
      "bun.lockb",
      "gulpfile.js",
      "npm-shrinkwrap.json",
      "package-lock.json",
      "package.json",
      "pnpm-lock.yaml",
      "src/client.ts",
      "yarn.lock",
    ],
  );
  assert.deepEqual(
    allowedChangePaths({ findingPath: "crates/cli/Cargo.toml", checkPaths: ["crates/cli/Cargo.toml"] }),
    ["crates/cli/Cargo.lock", "crates/cli/Cargo.toml"],
  );
});

test("a clean migration that only touches allowed files succeeds", () => {
  const score = scoreMigration({
    findingPath: "package.json",
    checkPaths: ["package.json"],
    findingResolved: true,
    verificationPassed: true,
    changedFiles: ["package.json", "yarn.lock"],
  });
  assert.deepEqual(score, {
    findingResolved: true,
    verificationPassed: true,
    noUnrelatedChanges: true,
    unrelatedFiles: [],
    success: true,
  });
});

test("each criterion can fail on its own", () => {
  assert.equal(
    scoreMigration({
      findingPath: "package.json",
      checkPaths: ["package.json"],
      findingResolved: false,
      verificationPassed: true,
      changedFiles: ["package.json"],
    }).success,
    false,
  );
  assert.equal(
    scoreMigration({
      findingPath: "package.json",
      checkPaths: ["package.json"],
      findingResolved: true,
      verificationPassed: false,
      changedFiles: ["package.json"],
    }).success,
    false,
  );
  const unrelated = scoreMigration({
    findingPath: "package.json",
    checkPaths: ["package.json"],
    findingResolved: true,
    verificationPassed: true,
    changedFiles: ["package.json", "README.md", "docs/guide.md"],
  });
  assert.equal(unrelated.success, false);
  assert.equal(unrelated.noUnrelatedChanges, false);
  assert.deepEqual(unrelated.unrelatedFiles, ["README.md", "docs/guide.md"]);
});

test("relatedPaths allow usage sites that checks do not name", () => {
  const score = scoreMigration({
    findingPath: "Cargo.toml",
    checkPaths: ["Cargo.toml"],
    findingResolved: true,
    verificationPassed: true,
    changedFiles: ["Cargo.toml", "Cargo.lock", "src/options.rs"],
    relatedPaths: ["src/options.rs"],
  });
  assert.equal(score.success, true);
  assert.deepEqual(score.unrelatedFiles, []);
});

test("scoreCondition reads end state, verification, and the diff from the harness result", () => {
  const ok = scoreCondition(task, condition({}));
  assert.equal(ok.success, true);

  const idle = scoreCondition(
    task,
    condition({ findingResolved: false, verificationPassed: false, changedFiles: [] }),
  );
  assert.equal(idle.findingResolved, false);
  assert.equal(idle.verificationPassed, false);
  assert.equal(idle.noUnrelatedChanges, true);
  assert.equal(idle.success, false);
});

test("scoreMigrationRun scores every condition and rateByCondition splits the arms", () => {
  const run = scoreMigrationRun(task, {
    taskId: task.id,
    conditions: [
      condition({ label: "baseline", changedFiles: ["package.json", "README.md"] }),
      condition({ label: "packet", changedFiles: ["package.json", "yarn.lock"] }),
    ],
  });
  assert.equal(run.taskId, "fixture-request");
  assert.equal(run.conditions[0]?.score.success, false);
  assert.equal(run.conditions[1]?.score.success, true);

  const rates = rateByCondition(run.conditions);
  assert.deepEqual(rates.baseline, {
    attempts: 1,
    successes: 0,
    successRate: 0,
    findingResolved: 1,
    verificationPassed: 1,
    noUnrelatedChanges: 0,
  });
  assert.deepEqual(rates.packet, {
    attempts: 1,
    successes: 1,
    successRate: 1,
    findingResolved: 1,
    verificationPassed: 1,
    noUnrelatedChanges: 1,
  });
});

test("summarizeScores reports deterministic rates across attempts", () => {
  const scores = [
    scoreMigration({
      findingPath: "go.mod",
      checkPaths: ["go.mod"],
      findingResolved: true,
      verificationPassed: true,
      changedFiles: ["go.mod", "go.sum"],
    }),
    scoreMigration({
      findingPath: "go.mod",
      checkPaths: ["go.mod"],
      findingResolved: true,
      verificationPassed: false,
      changedFiles: ["go.mod"],
    }),
    scoreMigration({
      findingPath: "go.mod",
      checkPaths: ["go.mod"],
      findingResolved: false,
      verificationPassed: true,
      changedFiles: ["README.md"],
    }),
  ];
  assert.deepEqual(summarizeScores(scores), {
    attempts: 3,
    successes: 1,
    successRate: 0.3333,
    findingResolved: 2,
    verificationPassed: 2,
    noUnrelatedChanges: 2,
  });
  assert.deepEqual(summarizeScores([]), {
    attempts: 0,
    successes: 0,
    successRate: 0,
    findingResolved: 0,
    verificationPassed: 0,
    noUnrelatedChanges: 0,
  });
});

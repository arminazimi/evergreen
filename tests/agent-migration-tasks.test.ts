import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

interface TaskCheck {
  path: string;
  mustNotMatch?: string;
  mustMatch?: string;
}

interface MigrationTask {
  id: string;
  title: string;
  repository: string;
  commit: string;
  finding: { ruleId: string; path: string; line: number };
  expectedEndState: { description: string; checks: TaskCheck[] };
  verification: string[];
  migrationEvidence: { commit: string; summary: string };
}

interface TasksFile {
  schemaVersion: string;
  tasks: MigrationTask[];
}

interface CorpusRepository {
  repository: string;
  commit: string;
  expected: Array<{ ruleId: string; path: string; line: number }>;
}

function tasksFile(): TasksFile {
  return JSON.parse(readFileSync(resolve("benchmarks/agent-migrations/tasks.json"), "utf8")) as TasksFile;
}

function corpus(): CorpusRepository[] {
  return (JSON.parse(readFileSync(resolve("benchmarks/public-repositories.json"), "utf8")) as {
    repositories: CorpusRepository[];
  }).repositories;
}

function registryRuleIds(): Set<string> {
  const ids = new Set<string>();
  for (const file of readdirSync(resolve("registry"))) {
    if (!file.endsWith(".json")) continue;
    const registry = JSON.parse(readFileSync(resolve("registry", file), "utf8")) as {
      rules?: Array<{ id: string }>;
    };
    for (const rule of registry.rules ?? []) ids.add(rule.id);
  }
  return ids;
}

test("the agent migration tasks define 20 pinned corpus findings", () => {
  const file = tasksFile();
  assert.equal(file.schemaVersion, "evergreen.agent-migrations.v1");
  assert.equal(file.tasks.length, 20);

  const repositories = corpus();
  for (const task of file.tasks) {
    const slug = new URL(task.repository).pathname.replace(/^\//, "");
    const entry = repositories.find((candidate) => candidate.repository === slug);
    assert.ok(entry, `${task.id} names ${task.repository}, which is not in the public corpus`);
    assert.equal(task.commit, entry.commit, `${task.id} must pin the corpus commit`);
    const finding = entry.expected.find(
      (candidate) =>
        candidate.ruleId === task.finding.ruleId &&
        candidate.path === task.finding.path &&
        candidate.line === task.finding.line,
    );
    assert.ok(
      finding,
      `${task.id} must name the corpus finding ${task.finding.ruleId} at ${task.finding.path}:${task.finding.line}`,
    );
  }
});

test("the agent migration tasks are uniquely identified and well formed", () => {
  const tasks = tasksFile().tasks;
  const ids = new Set<string>();
  const findings = new Set<string>();

  for (const task of tasks) {
    assert.match(task.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${task.id} is not kebab-case`);
    assert.ok(!ids.has(task.id), `duplicate task id ${task.id}`);
    ids.add(task.id);

    const findingKey = `${task.repository}@${task.commit} ${task.finding.ruleId} ${task.finding.path}:${task.finding.line}`;
    assert.ok(!findings.has(findingKey), `duplicate finding ${findingKey}`);
    findings.add(findingKey);

    assert.ok(task.title.trim().length > 0);
    assert.match(task.repository, /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
    assert.match(task.commit, /^[a-f0-9]{40}$/);
    assert.ok(task.finding.ruleId.trim().length > 0);
    assert.ok(task.finding.path.trim().length > 0);
    assert.ok(!task.finding.path.startsWith("/") && !task.finding.path.includes(".."));
    assert.ok(Number.isInteger(task.finding.line) && task.finding.line > 0);

    assert.ok(task.expectedEndState.description.trim().length > 0);
    assert.ok(task.expectedEndState.checks.length > 0, `${task.id} needs at least one end-state check`);
    for (const check of task.expectedEndState.checks) {
      assert.ok(check.path.trim().length > 0);
      assert.ok(!check.path.startsWith("/") && !check.path.includes(".."));
      assert.ok(
        check.mustNotMatch !== undefined || check.mustMatch !== undefined,
        `${task.id} has a check without a pattern for ${check.path}`,
      );
      for (const pattern of [check.mustNotMatch, check.mustMatch]) {
        if (pattern !== undefined) assert.doesNotThrow(() => new RegExp(pattern), `${task.id} has an invalid pattern`);
      }
    }

    assert.ok(task.verification.length > 0, `${task.id} needs a verification command`);
    assert.ok(task.verification.every((command) => command.trim().length > 0));

    assert.match(task.migrationEvidence.summary.trim(), /\S/);
    assert.match(
      task.migrationEvidence.commit,
      new RegExp(`^${task.repository.replace(/[.]/g, "\\.")}/commit/[a-f0-9]{40}$`),
      `${task.id} cites a migration commit outside its repository`,
    );
  }
});

test("every agent migration finding names a registry rule", () => {
  const known = registryRuleIds();
  for (const task of tasksFile().tasks) {
    assert.ok(known.has(task.finding.ruleId), `${task.id} names unknown rule ${task.finding.ruleId}`);
  }
});

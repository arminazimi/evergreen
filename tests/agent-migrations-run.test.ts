import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  createCommandAgent,
  loadMigrationTasks,
  runMigrationTask,
} from "../benchmarks/agent-migrations/run.js";
import type { AgentAdapter, MigrationTask } from "../benchmarks/agent-migrations/run.js";

const CHECK_SCRIPT = `import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
if (manifest.dependencies?.request) {
  console.error("request is still a dependency");
  process.exit(1);
}
`;

const COMMAND_AGENT_SCRIPT = `import { readFileSync, writeFileSync } from "node:fs";
const promptPath = process.env.EVERGREEN_MIGRATION_PROMPT_FILE;
if (!promptPath) {
  console.error("EVERGREEN_MIGRATION_PROMPT_FILE is not set");
  process.exit(1);
}
if (!readFileSync(promptPath, "utf8").includes("evergreen.context.v1")) {
  console.error("the prompt has no migration packet");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
delete manifest.dependencies.request;
writeFileSync("package.json", JSON.stringify(manifest, null, 2) + "\\n");
`;

function git(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile("git", [...args], { cwd, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error !== null) reject(new Error(stderr || error.message));
      else resolvePromise(stdout);
    });
  });
}

interface Fixture {
  repositoryPath: string;
  commit: string;
  packageLine: number;
  cleanup: () => Promise<void>;
}

async function fixtureRepository(): Promise<Fixture> {
  const repositoryPath = await mkdtemp(join(tmpdir(), "evergreen-agent-migrations-fixture-"));
  const packageJson = `${JSON.stringify(
    { name: "fixture", version: "1.0.0", dependencies: { request: "^2.88.2" } },
    null,
    2,
  )}\n`;
  await writeFile(join(repositoryPath, "package.json"), packageJson, "utf8");
  await writeFile(join(repositoryPath, "check.mjs"), CHECK_SCRIPT, "utf8");
  await git(repositoryPath, ["init", "--quiet"]);
  await git(repositoryPath, ["add", "package.json", "check.mjs"]);
  await git(repositoryPath, [
    "-c",
    "user.name=Harness Test",
    "-c",
    "user.email=harness@example.com",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ]);
  const commit = (await git(repositoryPath, ["rev-parse", "HEAD"])).trim();
  const packageLine = packageJson.split("\n").findIndex((line) => line.includes('"request"')) + 1;
  return {
    repositoryPath,
    commit,
    packageLine,
    cleanup: async () => {
      await rm(repositoryPath, { recursive: true, force: true });
    },
  };
}

function fixtureTask(fixture: Fixture): MigrationTask {
  return {
    id: "fixture-request",
    title: "Replace the deprecated request client",
    repository: "https://github.com/example/fixture",
    commit: fixture.commit,
    finding: {
      ruleId: "npm.package.request.deprecated",
      path: "package.json",
      line: fixture.packageLine,
    },
    expectedEndState: {
      description: "package.json no longer depends on request.",
      checks: [{ path: "package.json", mustNotMatch: '"request":' }],
    },
    verification: ["node check.mjs"],
  };
}

function migratingAgent(): AgentAdapter {
  return {
    name: "fixture-migrator",
    async run({ worktreePath }) {
      const manifestPath = join(worktreePath, "package.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        dependencies: Record<string, string>;
      };
      delete manifest.dependencies.request;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      return { exitCode: 0, signal: null, stdout: "removed request", stderr: "", timedOut: false };
    },
  };
}

const idleAgent: AgentAdapter = {
  name: "idle",
  async run() {
    return { exitCode: 0, signal: null, stdout: "", stderr: "", timedOut: false };
  },
};

test("the harness runs one task with and without a migration packet", async () => {
  const fixture = await fixtureRepository();
  try {
    const result = await runMigrationTask(fixtureTask(fixture), {
      repositoryPath: fixture.repositoryPath,
      agent: migratingAgent(),
    });

    assert.equal(result.schemaVersion, "evergreen.agent-migrations.v1");
    assert.equal(result.taskId, "fixture-request");
    assert.equal(result.conditions.length, 2);

    const [baseline, packet] = result.conditions;
    assert.ok(baseline && packet);
    assert.equal(baseline.condition, "baseline");
    assert.equal(packet.condition, "packet");
    assert.ok(baseline.prompt.includes("npm.package.request.deprecated"));
    assert.ok(!baseline.prompt.includes("evergreen.context.v1"));
    assert.ok(packet.prompt.includes("evergreen.context.v1"));
    assert.notEqual(baseline.worktreePath, packet.worktreePath);

    for (const condition of result.conditions) {
      assert.ok(condition.success);
      assert.equal(condition.agent.exitCode, 0);
      assert.ok(condition.diff.changedFiles.includes("package.json"));
      assert.ok(condition.diff.text.includes('"request"'));
      assert.equal(condition.expectedEndState.passed, true);
      assert.equal(condition.verification.passed, true);
      assert.ok(condition.durationMs >= 0);
      assert.ok(condition.agent.durationMs >= 0);
      assert.ok(condition.verification.durationMs >= 0);
      await assert.rejects(access(condition.worktreePath), "the harness must remove its worktrees");
    }
  } finally {
    await fixture.cleanup();
  }
});

test("the harness records a failed migration when the agent leaves the finding in place", async () => {
  const fixture = await fixtureRepository();
  try {
    const result = await runMigrationTask(fixtureTask(fixture), {
      repositoryPath: fixture.repositoryPath,
      agent: idleAgent,
      conditions: ["packet"],
    });

    assert.equal(result.conditions.length, 1);
    const condition = result.conditions[0];
    assert.ok(condition);
    assert.equal(condition.agent.exitCode, 0);
    assert.equal(condition.success, false);
    assert.equal(condition.expectedEndState.passed, false);
    assert.equal(condition.verification.passed, false);
    assert.equal(condition.diff.changedFiles.length, 0);
    assert.equal(condition.verification.commands[0]?.exitCode, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("the command adapter receives the prompt file inside the worktree", async () => {
  const fixture = await fixtureRepository();
  try {
    const scriptPath = join(fixture.repositoryPath, "command-agent.mjs");
    await writeFile(scriptPath, COMMAND_AGENT_SCRIPT, "utf8");
    const agent = createCommandAgent({
      name: "fixture-command",
      command: `"${process.execPath}" "${scriptPath}"`,
    });
    const result = await runMigrationTask(fixtureTask(fixture), {
      repositoryPath: fixture.repositoryPath,
      agent,
      conditions: ["packet"],
    });

    const condition = result.conditions[0];
    assert.ok(condition);
    assert.equal(condition.agent.name, "fixture-command");
    assert.equal(condition.success, true);
    assert.ok(condition.prompt.includes("evergreen.context.v1"));
  } finally {
    await fixture.cleanup();
  }
});

test("the harness loads the checked-in migration tasks", () => {
  const tasks = loadMigrationTasks();
  assert.equal(tasks.schemaVersion, "evergreen.agent-migrations.v1");
  assert.equal(tasks.tasks.length, 20);
});

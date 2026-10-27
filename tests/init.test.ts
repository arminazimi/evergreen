import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { CI_WORKFLOW_FILE, applyInitSetup, ciWorkflow, planInitSetup, planSummary } from "../src/init.js";
import { VERSION } from "../src/version.js";

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const repository = async (files: Record<string, string> = {}, git = true) => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-init-setup-"));
  roots.push(root);
  if (git) spawnSync("git", ["init", "-q"], { cwd: root });
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(join(root, name, ".."), { recursive: true });
    await writeFile(join(root, name), contents);
  }
  return root;
};

const exercise = (root: string, args: string[]) =>
  spawnSync(process.execPath, [resolve("dist/src/cli.js"), "init", ...args, root], { encoding: "utf8" });

test("a GitHub Actions repository with no agent files gets the workflow, the hook, and a fallback AGENTS.md offered", async () => {
  const root = await repository({ ".github/workflows/ci.yml": "name: Build\n" });
  const plan = await planInitSetup({ root, gate: "high" });
  assert.deepEqual(plan.detectedCi, ["GitHub Actions"]);
  assert.deepEqual(plan.detectedAgents, []);
  assert.deepEqual(
    plan.steps.map((step) => [step.kind, step.file, step.change]),
    [
      ["ci", CI_WORKFLOW_FILE, "created"],
      ["hooks", ".git/hooks/pre-push", "created"],
      ["agents", "AGENTS.md", "created"],
    ],
  );
  const ciStep = plan.steps.find((step) => step.kind === "ci")!;
  assert.ok(ciStep.diff.length > 0);
  assert.match(ciStep.diff, /\+.*actions\/checkout/);
  assert.match(planSummary(plan), /This writes .*AGENTS\.md/);
  await assert.rejects(readFile(join(root, CI_WORKFLOW_FILE), "utf8"));
});

test("the generated workflow pins the action at the released version and carries the gate", () => {
  const text = ciWorkflow("medium");
  assert.ok(text.includes(`uses: arminazimi/evergreen@v${VERSION}`));
  assert.ok(text.includes("fail-on-severity: medium"));
  assert.ok(text.includes("pull_request:"));
  assert.ok(text.includes("permissions:\n  contents: read"));
});

test("a GitLab repository is advised by hand instead of written", async () => {
  const root = await repository({ ".gitlab-ci.yml": "" });
  const plan = await planInitSetup({ root, gate: "high" });
  assert.deepEqual(plan.detectedCi, ["GitLab CI/CD"]);
  const step = plan.steps.find((step) => step.kind === "ci")!;
  assert.deepEqual([step.change, step.file, step.snippet], ["advice", ".gitlab-ci.yml", "include:\n  - component: $CI_SERVER_FQDN/<group>/<project>/evergreen@<version>"]);
});

test("an unchanged repository plans nothing to write", async () => {
  const root = await repository({ ".github/workflows/evergreen.yml": ciWorkflow("high") });
  const plan = await planInitSetup({ root, gate: "high" });
  await applyInitSetup({ plan, gate: "high" });
  const second = await planInitSetup({ root, gate: "high" });
  assert.ok(second.steps.every((step) => step.change === "unchanged"), second.steps.map((step) => step.change).join(","));
  assert.equal(planSummary(second), "Nothing to write.");
});

test("a detected agent host replaces the fallback", async () => {
  const root = await repository({ ".claude/settings.json": "{}" });
  const plan = await planInitSetup({ root, gate: "high" });
  assert.deepEqual(plan.detectedAgents, ["Claude Code"]);
  assert.deepEqual(
    plan.steps.filter((step) => step.kind === "agents").map((step) => step.file),
    ["CLAUDE.md"],
  );
});

test("applying the plan writes the workflow, the hook, and the agent section", async () => {
  const root = await repository({ ".github/workflows/ci.yml": "name: Build\n" });
  const plan = await planInitSetup({ root, gate: "high" });
  const result = await applyInitSetup({ plan, gate: "high" });
  assert.deepEqual(result.written, [CI_WORKFLOW_FILE, ".git/hooks/pre-push", "AGENTS.md"]);
  const workflow = await readFile(join(root, CI_WORKFLOW_FILE), "utf8");
  assert.match(workflow, /uses: arminazimi\/evergreen@v/);
  const hook = await readFile(join(root, ".git/hooks/pre-push"), "utf8");
  assert.match(hook, /--fail-on high/);
  assert.match(await readFile(join(root, "AGENTS.md"), "utf8"), /evergreen:begin/);
  const changes = result.steps.map((step) => step.change);
  assert.deepEqual(changes, ["created", "created", "created"]);
});

test("a dry run through the CLI writes nothing and shows the defaults", async () => {
  const root = await repository({ ".github/workflows/ci.yml": "name: Build\n" });
  const run = exercise(root, ["--dry-run"]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^Detected: GitHub Actions; no agent hosts\n/);
  assert.match(run.stdout, /Would create .github\/workflows\/evergreen\.yml; it scans pull requests/);
  assert.match(run.stdout, /Would create \.git\/hooks\/pre-push; it blocks a push at high or above/);
  assert.match(run.stdout, /Would create AGENTS\.md/);
  assert.match(run.stdout, /Dry run: nothing was written\.\n$/);
  await assert.rejects(readFile(join(root, CI_WORKFLOW_FILE), "utf8"));
});

test("without a terminal the guided init refuses and points at --yes", async () => {
  const root = await repository({ ".github/workflows/ci.yml": "name: Build\n" });
  const run = exercise(root, []);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /Confirmation needed: pass --yes to write these changes, or --dry-run to only print them\./);
  await assert.rejects(readFile(join(root, CI_WORKFLOW_FILE), "utf8"));
});

test("guided init with --yes sets up CI, the hook, and agents in one step", async () => {
  const root = await repository({ ".github/workflows/ci.yml": "name: Build\n" });
  const run = exercise(root, ["--yes"]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Created .github\/workflows\/evergreen\.yml; it scans pull requests and pushes to main/);
  assert.match(run.stdout, /Created .git\/hooks\/pre-push; it blocks a push at high or above/);
  assert.match(run.stdout, /Created AGENTS\.md/);
  assert.match(await readFile(join(root, CI_WORKFLOW_FILE), "utf8"), /fail-on-severity: high/);
  const again = exercise(root, ["--yes"]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /\.github\/workflows\/evergreen\.yml already has the current Evergreen workflow/);
  assert.match(again.stdout, /AGENTS\.md already has the current Evergreen section/);
});

test("--fail-on flows into the generated workflow", async () => {
  const root = await repository({ ".github/workflows/ci.yml": "name: Build\n" });
  const run = exercise(root, ["--fail-on", "low", "--yes"]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(await readFile(join(root, CI_WORKFLOW_FILE), "utf8"), /fail-on-severity: low/);
});

test("--file chooses the fallback agent file", async () => {
  const root = await repository();
  const run = exercise(root, ["--file", "CLAUDE.md", "--yes"]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Created CLAUDE\.md/);
  await assert.rejects(readFile(join(root, "AGENTS.md"), "utf8"));
});

test("the guided gate and the one-step-usages keep working", async () => {
  const root = await repository();
  for (const args of [["--personal", "--hooks"], ["--bogus"], ["--file", "TYPING.md", "--yes"]]) {
    const run = exercise(root, args);
    assert.equal(run.status, 2, args.join(" "));
    assert.match(run.stderr, /Usage: evergreen init|--file must be/);
  }
  assert.equal(exercise(root, ["--agents", "--yes"]).status, 0);
});

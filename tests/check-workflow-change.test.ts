import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  changedWorkflows,
  checkWorkflowNote,
  DEFAULT_BASE,
  DEFAULT_JOB_TIMEOUT_MINUTES,
  extractSection,
  jobMayRunOnPullRequest,
  jobTimeoutMinutes,
  matrixJobCount,
  parseArguments,
  parseBudgetMinutes,
  parseWorkflowChangeNote,
  PULL_REQUEST_RUNNER_MINUTE_BUDGET,
  readWorkflowsFromDirectory,
  readWorkflowsFromGit,
  summarizeRunnerMinutes,
  triggersOnPullRequest,
  workflowJobCosts,
} from "../tools/check-workflow-change.js";

const TOOL = resolve("dist/tools/check-workflow-change.js");

const WORKFLOW = `name: CI
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: echo ok
`;

function git(root: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

async function commit(root: string, message: string): Promise<void> {
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", message);
}

async function repository(): Promise<{ root: string; base: string; workflows: string }> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-check-workflows-"));
  const workflows = join(root, ".github", "workflows");
  await mkdir(workflows, { recursive: true });
  await writeFile(join(workflows, "ci.yml"), WORKFLOW);
  await writeFile(join(root, "README.md"), "# Fixture\n");
  git(root, "init", "-q");
  await commit(root, "base");
  return { root, base: git(root, "rev-parse", "HEAD").trim(), workflows };
}

function runTool(root: string, env: NodeJS.ProcessEnv, ...args: string[]) {
  return spawnSync(process.execPath, [TOOL, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GITHUB_EVENT_NAME: "", GITHUB_EVENT_PATH: "", ...env },
  });
}

async function eventFile(root: string, body: string): Promise<string> {
  const path = join(root, "event.json");
  await writeFile(path, JSON.stringify({ pull_request: { body } }));
  return path;
}

test("pull request triggers are read from a string, a list, and a mapping", () => {
  assert.equal(triggersOnPullRequest({ on: "pull_request" }), true);
  assert.equal(triggersOnPullRequest({ on: ["push", "pull_request"] }), true);
  assert.equal(triggersOnPullRequest({ on: { pull_request: { paths: ["src/**"] } } }), true);
  assert.equal(triggersOnPullRequest({ on: { pull_request_target: null } }), true);
  assert.equal(triggersOnPullRequest({ on: "push" }), false);
  assert.equal(triggersOnPullRequest({ on: { push: { branches: ["main"] } } }), false);
  assert.equal(triggersOnPullRequest({}), false);
  assert.equal(triggersOnPullRequest(null), false);
});

test("job conditions decide whether a job can run on a pull request", () => {
  assert.equal(jobMayRunOnPullRequest({}), true);
  assert.equal(jobMayRunOnPullRequest({ if: "always()" }), true);
  assert.equal(
    jobMayRunOnPullRequest({ if: "github.event_name == 'pull_request' || github.event_name == 'push'" }),
    true,
  );
  // check-cross-os runs on a pull request when the change is not docs-only.
  assert.equal(
    jobMayRunOnPullRequest({
      if: "github.event_name != 'pull_request' || needs.changes.outputs.docs_only != 'true'",
    }),
    true,
  );
  assert.equal(jobMayRunOnPullRequest({ if: "github.event_name != 'pull_request'" }), false);
  assert.equal(jobMayRunOnPullRequest({ if: "github.event_name == 'push'" }), false);
  assert.equal(
    jobMayRunOnPullRequest({ if: "github.event_name == 'merge_group' && needs.changes.outputs.site == 'true'" }),
    false,
  );
  assert.equal(jobMayRunOnPullRequest(null), true);
});

test("matrix counts multiply, while dynamic expressions and include lists count once", () => {
  assert.equal(matrixJobCount({}), 1);
  assert.equal(matrixJobCount({ strategy: { matrix: { os: ["ubuntu-latest"], node: [24, 22], shard: [0, 1] } } }), 4);
  assert.equal(matrixJobCount({ strategy: { matrix: { os: "${{ fromJSON(...) }}", node: [24] } } }), 1);
  assert.equal(matrixJobCount({ strategy: { matrix: { include: [{ os: "windows-latest" }] } } }), 1);
  assert.equal(matrixJobCount({ strategy: { matrix: { exclude: [{ os: "macos-latest" }] } } }), 1);
});

test("a missing or invalid timeout is charged the lane budget", () => {
  assert.equal(jobTimeoutMinutes({ "timeout-minutes": 20 }), 20);
  assert.equal(jobTimeoutMinutes({}), DEFAULT_JOB_TIMEOUT_MINUTES);
  assert.equal(jobTimeoutMinutes({ "timeout-minutes": 0 }), DEFAULT_JOB_TIMEOUT_MINUTES);
  assert.equal(jobTimeoutMinutes({ "timeout-minutes": "20" }), DEFAULT_JOB_TIMEOUT_MINUTES);
});

test("job costs cover only pull-request workflows and jobs", () => {
  const source = {
    path: ".github/workflows/ci.yml",
    text: `name: CI
on:
  pull_request:
  push:
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    strategy:
      matrix:
        node: [24, 22]
        shard: [0, 1]
  push-only:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    timeout-minutes: 60
`,
  };
  assert.deepEqual(workflowJobCosts(source), [
    { workflow: ".github/workflows/ci.yml", job: "check", count: 4, minutesPerJob: 20, minutes: 80 },
  ]);

  const pushOnly = {
    path: ".github/workflows/demos.yml",
    text: "on: push\njobs:\n  render:\n    timeout-minutes: 20\n",
  };
  assert.deepEqual(workflowJobCosts(pushOnly), []);
});

test("the budget report sums every workflow and fails above the budget", () => {
  const sources = [
    { path: ".github/workflows/a.yml", text: "on: [pull_request]\njobs:\n  one:\n    timeout-minutes: 200\n" },
    { path: ".github/workflows/b.yml", text: "on: [pull_request]\njobs:\n  two:\n    timeout-minutes: 200\n" },
  ];
  const report = summarizeRunnerMinutes(sources);
  assert.equal(report.totalMinutes, 400);
  assert.equal(report.budgetMinutes, PULL_REQUEST_RUNNER_MINUTE_BUDGET);
  assert.equal(report.withinBudget, false);
  assert.deepEqual(
    report.jobs.map((job) => job.job),
    ["one", "two"],
  );

  const ok = summarizeRunnerMinutes([sources[0]!], 200);
  assert.equal(ok.withinBudget, true);
});

test("the note reads reason and budget effect, and compares the effect with the diff", () => {
  const body = `## What changed
Something.

## Workflow changes
<!-- fill this in -->
- Reason: add a Windows shard
- Budget effect: +20 runner minutes

## Notes for reviewers
None.
`;
  const note = parseWorkflowChangeNote(body);
  assert.equal(note.section, true);
  assert.equal(note.reason, "add a Windows shard");
  assert.equal(note.budgetEffectMinutes, 20);
  assert.deepEqual(checkWorkflowNote(body, 20).problems, []);
  assert.match(
    checkWorkflowNote(body, 0).problems[0] ?? "",
    /the note says \+20 runner minutes but the measured change is \+0/,
  );
});

test("a missing, empty, or placeholder note is reported", () => {
  const missing = checkWorkflowNote("## What changed\nNothing.\n", 0);
  assert.equal(missing.note.section, false);
  assert.match(missing.problems[0] ?? "", /add a "## Workflow changes" section/);

  const empty = checkWorkflowNote("## Workflow changes\n- Reason:\n- Budget effect:\n", 0);
  assert.equal(empty.problems.length, 2);
  assert.match(empty.problems[0] ?? "", /state why/);
  assert.match(empty.problems[1] ?? "", /state the runner-minute effect/);

  const placeholder = checkWorkflowNote("## Workflow changes\n- Reason: <why>\n- Budget effect: TODO\n", 0);
  assert.equal(placeholder.problems.length, 2);

  assert.deepEqual(checkWorkflowNote(undefined, 0).problems, [
    "the pull request has no body to carry the required note",
  ]);
});

test("removing comments cannot assemble delimiters or required labels", () => {
  const note = parseWorkflowChangeNote(
    "## Workflow changes\n- Reason: before<!<!-- hidden -->-- after\n- Budget effect: 0",
  );
  assert.equal(note.reason, "before<! -- after");
  const split = checkWorkflowNote("## Workflow changes\n- Rea<!-- hidden -->son: fabricated\n- Budget effect: 0", 0);
  assert.equal(split.note.reason, undefined);
  assert.match(split.problems[0] ?? "", /state why/);
  const ordinary = checkWorkflowNote(
    "## Workflow changes\n<!-- one --><!-- two -->\n- Reason: keep the ordinary note\n- Budget effect: 0",
    0,
  );
  assert.deepEqual(ordinary.problems, []);
});

test("budget effects accept signed minutes and the word none", () => {
  assert.equal(parseBudgetMinutes("+20 runner minutes"), 20);
  assert.equal(parseBudgetMinutes("-5"), -5);
  assert.equal(parseBudgetMinutes("0"), 0);
  assert.equal(parseBudgetMinutes("none"), 0);
  assert.equal(parseBudgetMinutes("no change"), 0);
  assert.equal(parseBudgetMinutes("twenty"), undefined);
  assert.equal(parseBudgetMinutes(undefined), undefined);
});

test("a comment cannot supply a workflow heading or hide the real note", () => {
  const hidden = "<!--\n## Workflow changes\n- Reason: invisible\n- Budget effect: 0\n-->";
  assert.equal(parseWorkflowChangeNote(hidden).section, false);
  assert.notDeepEqual(checkWorkflowNote(hidden, 0).problems, []);
  const visible = `${hidden}\n## Workflow changes\n- Reason: visible\n- Budget effect: 0`;
  assert.equal(parseWorkflowChangeNote(visible).reason, "visible");
  assert.deepEqual(checkWorkflowNote(visible, 0).problems, []);
});

test("section extraction stops at the next heading", () => {
  const body = "## Workflow changes\n- Reason: why\n\n## Next\n- Reason: not this\n";
  assert.equal(extractSection(body, "## Workflow changes"), "- Reason: why");
  assert.equal(extractSection(body, "## Missing"), undefined);
});

test("workflow paths count on both sides of a rename", () => {
  assert.deepEqual(
    changedWorkflows([
      { status: "M", path: ".github/workflows/ci.yml" },
      { status: "R", previousPath: ".github/workflows/old.yaml", path: ".github/workflows/new.yaml" },
      { status: "A", path: "src/cli.ts" },
      { status: "A", path: ".github/labels.yml" },
    ]),
    [".github/workflows/ci.yml", ".github/workflows/new.yaml", ".github/workflows/old.yaml"],
  );
});

test("arguments default to origin/main and reject unknown or missing values", () => {
  assert.deepEqual(parseArguments([]), { base: DEFAULT_BASE, baseExplicit: false });
  assert.deepEqual(parseArguments(["--base", "HEAD~1"]), { base: "HEAD~1", baseExplicit: true });
  assert.throws(() => parseArguments(["--base"]), /--base needs a value/);
  assert.throws(() => parseArguments(["--base", "--json"]), /--base needs a value/);
  assert.throws(() => parseArguments(["--json"]), /Unknown argument "--json"/);
});

test("a workflow change without a note fails on a pull request", async () => {
  const { root, base, workflows } = await repository();
  try {
    await writeFile(join(workflows, "ci.yml"), `${WORKFLOW}  generated-files:\n    timeout-minutes: 5\n`);
    await commit(root, "change the workflow");
    const event = await eventFile(root, "## What changed\nNo note.\n");
    const run = runTool(root, { GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: event }, "--base", base);
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stdout, /::error::add a "## Workflow changes" section/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a workflow change with a matching note passes", async () => {
  const { root, base, workflows } = await repository();
  try {
    await writeFile(join(workflows, "ci.yml"), `${WORKFLOW}  generated-files:\n    timeout-minutes: 5\n`);
    await commit(root, "change the workflow");
    const event = await eventFile(
      root,
      "## Workflow changes\n- Reason: refuse committed generated files\n- Budget effect: +5 runner minutes\n",
    );
    const run = runTool(root, { GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: event }, "--base", base);
    assert.equal(run.status, 0, run.stdout);
    assert.match(run.stdout, /Runner minutes before: 5; after: 10; change: \+5/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a change above the runner-minute budget fails even with a note", async () => {
  const { root, base, workflows } = await repository();
  try {
    await writeFile(join(workflows, "ci.yml"), `${WORKFLOW}  expensive:\n    timeout-minutes: 400\n`);
    await commit(root, "add an expensive job");
    const event = await eventFile(root, "## Workflow changes\n- Reason: too slow\n- Budget effect: +400\n");
    const run = runTool(root, { GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: event }, "--base", base);
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stdout, /::error::the pull-request lane can consume 405 runner minutes/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a push run does not need the note", async () => {
  const { root, base, workflows } = await repository();
  try {
    await writeFile(join(workflows, "ci.yml"), `${WORKFLOW}  generated-files:\n    timeout-minutes: 5\n`);
    await commit(root, "change the workflow");
    const run = runTool(root, { GITHUB_EVENT_NAME: "push" }, "--base", base);
    assert.equal(run.status, 0, run.stdout);
    assert.match(run.stdout, /Workflow changes and the runner-minute budget hold/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a non-workflow change needs no note", async () => {
  const { root, base } = await repository();
  try {
    await writeFile(join(root, "README.md"), "# Fixture\n\nMore.\n");
    await commit(root, "change the readme");
    const event = await eventFile(root, "## What changed\nDocs only.\n");
    const run = runTool(root, { GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: event }, "--base", base);
    assert.equal(run.status, 0, run.stdout);
    assert.match(run.stdout, /No workflow file changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a default base that is absent is skipped, an explicit one is an error", async () => {
  const { root } = await repository();
  try {
    const implicit = runTool(root, {});
    assert.equal(implicit.status, 0, implicit.stdout);
    assert.match(implicit.stdout, /Skipped the workflow diff/);

    const explicit = runTool(root, {}, "--base", "no-such-ref");
    assert.equal(explicit.status, 2, explicit.stderr);
    assert.match(explicit.stderr, /Cannot compare against "no-such-ref"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the working tree and the base revision are both read", async () => {
  const { root, base } = await repository();
  try {
    const head = await readWorkflowsFromDirectory(root);
    assert.deepEqual(
      head.map((source) => source.path),
      [".github/workflows/ci.yml"],
    );
    const atBase = readWorkflowsFromGit(base, root);
    assert.equal(atBase.length, 1);
    assert.match(atBase[0]?.text ?? "", /timeout-minutes: 5/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

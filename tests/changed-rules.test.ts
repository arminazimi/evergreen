import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

import {
  classifyChangedPaths,
  ebbVersion,
  fixtureRuleIds,
  main,
  renderChangedRulesSummary,
  renderChangedRulesText,
  runChangedRules,
} from "../tools/changed-rules.js";

const RULE_ID = "npm.package.request.deprecated";
const escapedRule = RULE_ID.replaceAll(".", "\\.");

function manifest(name: string, version: string): string {
  return `${JSON.stringify({ name: "fixture", private: true, dependencies: { [name]: version } }, null, 2)}\n`;
}

function lockfile(ebb: string | undefined): string {
  const packages: Record<string, unknown> = { "": { name: "fixture" } };
  if (ebb !== undefined) packages["node_modules/@velella/ebb"] = { version: ebb };
  return `${JSON.stringify({ name: "fixture", lockfileVersion: 3, packages }, null, 2)}\n`;
}

/** The request rule as the installed @velella/ebb has it, so the throwaway repository's registry matches a scan. */
async function registryText(): Promise<string> {
  const installed = JSON.parse(await readFile(resolve("node_modules/@velella/ebb/registry/npm.json"), "utf8")) as {
    rules: Array<{ id: string }>;
  };
  const rule = installed.rules.find((candidate) => candidate.id === RULE_ID);
  assert.ok(rule, `${RULE_ID} is in @velella/ebb`);
  return `${JSON.stringify({ schemaVersion: "ebb.registry.v2", ecosystem: "npm", rules: [rule] }, null, 2)}\n`;
}

function git(root: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function fixtureFile(root: string, kind: "match" | "clean", ruleId = RULE_ID): string {
  return join(root, "tests", "fixtures", ruleId, kind, "package.json");
}

/** A throwaway repository with one rule, its two fixtures, and a lockfile, committed as the base revision. */
async function repository(): Promise<{ root: string; base: string }> {
  const root = await mkdtemp(join(tmpdir(), "offing-changed-rules-"));
  await mkdir(join(root, "registry"), { recursive: true });
  await mkdir(join(root, "tests", "fixtures", RULE_ID, "match"), { recursive: true });
  await mkdir(join(root, "tests", "fixtures", RULE_ID, "clean"), { recursive: true });
  await mkdir(join(root, "tests", "fixtures", "cli"), { recursive: true });
  await writeFile(join(root, "registry", "npm.json"), await registryText());
  await writeFile(fixtureFile(root, "match"), manifest("request", "2.88.2"));
  await writeFile(fixtureFile(root, "clean"), manifest("express", "4.18.2"));
  await writeFile(join(root, "tests", "fixtures", "cli", "README.md"), "Not a rule.\n");
  await writeFile(join(root, "package-lock.json"), lockfile("0.1.0"));
  await writeFile(join(root, "README.md"), "# Fixture\n");
  git(root, "init", "-q");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  return { root, base: git(root, "rev-parse", "HEAD").trim() };
}

async function commit(root: string, message: string): Promise<void> {
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", message);
}

async function withRepository(body: (root: string, base: string) => Promise<void>): Promise<void> {
  const { root, base } = await repository();
  try {
    await body(root, base);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("changed paths select fixture rule ids and the lockfile and ignore everything else", () => {
  assert.deepEqual(
    classifyChangedPaths([
      "tests/fixtures/npm.package.request.deprecated/match/package.json",
      "tests/fixtures/npm.package.request.deprecated/clean/package.json",
      "tests/fixtures/not a rule/notes.txt",
      "fixtures/npm.package.request.deprecated/match/package.json",
      "src/rule-test.ts",
    ]),
    { fixtureRules: [RULE_ID], lockfile: false },
  );
  assert.deepEqual(classifyChangedPaths(["package-lock.json"]), { fixtureRules: [], lockfile: true });
  assert.deepEqual(classifyChangedPaths(["examples/app/package-lock.json"]), { fixtureRules: [], lockfile: false });
});

test("the installed @velella/ebb version is read from a lockfile", () => {
  assert.equal(ebbVersion(lockfile("0.2.0")), "0.2.0");
  assert.equal(ebbVersion(lockfile(undefined)), undefined);
  assert.equal(ebbVersion("not json"), undefined);
  assert.equal(ebbVersion(undefined), undefined);
});

test("only fixture folders named like a rule id count as rules", async () => {
  await withRepository(async (root) => {
    assert.deepEqual(await fixtureRuleIds(join(root, "tests", "fixtures")), [RULE_ID]);
  });
});

test("a changed fixture runs its rule and names it in the summary", async () => {
  await withRepository(async (root, base) => {
    await writeFile(fixtureFile(root, "match"), manifest("request", "2.88.0"));
    await commit(root, "change the match fixture");
    const result = await runChangedRules({ base, root });
    assert.deepEqual(result.rules, [RULE_ID]);
    assert.equal(result.passed, true, renderChangedRulesText(result));
    assert.equal(result.ebb, undefined);
    assert.equal(result.tests[0]!.registry, "registry/npm.json");
    const summary = renderChangedRulesSummary(result);
    assert.match(summary, new RegExp(`\\| \`${escapedRule}\` \\| pass \\|`));
    assert.match(summary, /All 1 rule passed\./);
  });
});

test("a clean fixture that reports the rule fails and names the rule", async () => {
  await withRepository(async (root, base) => {
    await writeFile(fixtureFile(root, "clean"), manifest("request", "2.88.2"));
    await commit(root, "break the clean fixture");
    const result = await runChangedRules({ base, root });
    assert.equal(result.passed, false);
    const summary = renderChangedRulesSummary(result);
    assert.match(summary, new RegExp(`\\| \`${escapedRule}\` \\| \\*\\*fail\\*\\* \\|`));
    assert.match(summary, /#### Fixture problems/);
    assert.match(summary, /Failed 1 of 1 rule\./);
  });
});

test("a change that touches no fixture and does not move @velella/ebb runs nothing", async () => {
  await withRepository(async (root, base) => {
    await writeFile(join(root, "README.md"), "# Fixture, edited\n");
    await writeFile(join(root, "package-lock.json"), lockfile("0.1.0").replace('"fixture"', '"renamed"'));
    await commit(root, "unrelated");
    const result = await runChangedRules({ base, root });
    assert.deepEqual(result.rules, []);
    assert.equal(result.passed, true);
    assert.match(renderChangedRulesSummary(result), /No rule fixture is affected by this change\./);
    assert.equal(renderChangedRulesText(result), "No rule fixture is affected by this change.");
  });
});

test("moving @velella/ebb to another version runs every rule with fixtures", async () => {
  await withRepository(async (root, base) => {
    await writeFile(join(root, "package-lock.json"), lockfile("0.2.0"));
    await commit(root, "bump ebb");
    const result = await runChangedRules({ base, root });
    assert.deepEqual(result.ebb, { before: "0.1.0", after: "0.2.0" });
    assert.deepEqual(result.rules, [RULE_ID]);
    assert.match(renderChangedRulesSummary(result), /@velella\/ebb moved from 0\.1\.0 to 0\.2\.0/);
  });
});

test("a fixture folder for a rule Ebb does not have is skipped instead of failing", async () => {
  await withRepository(async (root, base) => {
    const gone = "npm.package.not-in-ebb.deprecated";
    await mkdir(join(root, "tests", "fixtures", gone, "match"), { recursive: true });
    await writeFile(fixtureFile(root, "match", gone), manifest("left-pad", "1.3.0"));
    await commit(root, "orphan fixture");
    const result = await runChangedRules({ base, root });
    assert.deepEqual(result.rules, []);
    assert.equal(result.passed, true);
  });
});

test("without a base every rule with fixtures runs", async () => {
  await withRepository(async (root) => {
    const result = await runChangedRules({ root });
    assert.equal(result.base, "(all)");
    assert.deepEqual(result.rules, [RULE_ID]);
  });
});

test("the command exits 1, names the rule, and writes the summary when a fixture breaks", async () => {
  await withRepository(async (root, base) => {
    await writeFile(fixtureFile(root, "clean"), manifest("request", "2.88.2"));
    await commit(root, "break the clean fixture");
    const summaryPath = join(root, "summary.md");
    const run = spawnSync(
      process.execPath,
      [resolve("dist/tools/changed-rules.js"), "--base", base, "--summary", summaryPath],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, new RegExp(`Rule fixtures failed: ${escapedRule}`));
    const summary = await readFile(summaryPath, "utf8");
    assert.match(summary, new RegExp(`\`${escapedRule}\``));
    assert.match(summary, /#### Fixture problems/);
  });
});

test("the command exits 0 when the affected rule passes, with --base or --all", async () => {
  await withRepository(async (root, base) => {
    await writeFile(fixtureFile(root, "match"), manifest("request", "2.88.0"));
    await commit(root, "change the match fixture");
    for (const args of [["--base", base], ["--all"]]) {
      const run = spawnSync(process.execPath, [resolve("dist/tools/changed-rules.js"), ...args], {
        cwd: root,
        encoding: "utf8",
      });
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, new RegExp(`Passed ${escapedRule}`));
    }
  });
});

test("the command needs exactly one of --base and --all and rejects unknown flags", async () => {
  await assert.rejects(main([]), /Usage: changed-rules \(--base <ref> \| --all\)/);
  await assert.rejects(main(["--all", "--base", "main"]), /Usage: changed-rules/);
  await assert.rejects(main(["--base"]), /--base needs a value/);
  await assert.rejects(main(["--base", "main", "--json"]), /Unknown argument "--json"/);
});

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}

interface Workflow {
  on: Record<string, { paths?: string[] } | null>;
  permissions?: Record<string, string>;
  jobs: Record<string, { permissions?: Record<string, string>; steps: Step[] }>;
}

const workflowText = await readFile(resolve(".github/workflows/rules.yml"), "utf8");
const workflow = parse(workflowText) as Workflow;
const workflowJob = workflow.jobs.rules!;

test("the rules workflow runs on pushes to main and on pull requests for fixture and Ebb changes only", () => {
  assert.deepEqual(Object.keys(workflow.on), ["push", "pull_request"]);
  assert.deepEqual(workflow.on.pull_request!.paths, workflow.on.push!.paths);
  assert.deepEqual(workflow.on.push!.paths, [
    "package-lock.json",
    "tests/fixtures/**",
    "src/rule-test.ts",
    "tools/changed-rules.ts",
    ".github/workflows/rules.yml",
  ]);
  assert.ok(!workflowText.includes("pull_request_target"));
});

test("the rules workflow has read-only permissions and no secret", () => {
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflowJob.permissions, undefined);
  assert.ok(!/secrets\./.test(workflowText));
});

test("the base commit reaches the rules shell only through an environment variable", () => {
  for (const step of workflowJob.steps.filter((item) => item.run)) {
    assert.ok(!/\$\{\{/.test(step.run!), `an expression is interpolated into a run script: ${step.name ?? step.run}`);
  }
  const check = workflowJob.steps.find((step) => step.run?.includes("changed-rules"))!;
  assert.equal(check.env?.BASE_SHA, "${{ github.event.pull_request.base.sha || github.event.before }}");
  assert.match(check.run!, /git fetch --no-tags origin "\$BASE_SHA"/);
  assert.match(check.run!, /--base "\$BASE_SHA"/);
  assert.match(check.run!, /\^0\+\$ \]\]; then\n\s+node dist\/tools\/changed-rules\.js --all/);
  assert.match(check.run!, /--summary "\$GITHUB_STEP_SUMMARY"/);
});

test("the rules workflow checks out history and pins every action to a full SHA", () => {
  assert.equal(workflowJob.steps[0]!.with?.["fetch-depth"], 0);
  for (const step of workflowJob.steps.filter((item) => item.uses)) {
    // `./` and `$/` resolve inside this repository, so neither carries a pinned ref.
    if (step.uses!.startsWith("$/") || step.uses!.startsWith("./")) continue;
    assert.match(step.uses!, /^[\w./-]+@[0-9a-f]{40}$/, step.uses);
  }
});

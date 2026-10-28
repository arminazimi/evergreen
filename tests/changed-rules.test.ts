import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

import {
  changedRuleIds,
  classifyChangedPaths,
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

function registryText(summary = "The package is deprecated."): string {
  return `${JSON.stringify({
    schemaVersion: "evergreen.registry.v2",
    ecosystem: "npm",
    rules: [
      {
        id: RULE_ID,
        ecosystem: "npm",
        purl: "pkg:npm/request",
        vers: "vers:npm/*",
        event: "deprecated",
        title: "request is deprecated",
        summary,
        severity: "high",
        replacement: "Native fetch",
        sources: [{ title: "Deprecation notice", url: "https://example.com/request" }],
        provenance: { observedAt: "2026-01-01", reviewedAt: "2026-01-02", reviewer: "test" },
      },
    ],
  }, null, 2)}\n`;
}

// The same rule with its keys written in another order. Only the content counts.
const REORDERED = `{
  "ecosystem": "npm",
  "rules": [
    {
      "id": "npm.package.request.deprecated",
      "provenance": { "reviewer": "test", "reviewedAt": "2026-01-02", "observedAt": "2026-01-01" },
      "sources": [ { "url": "https://example.com/request", "title": "Deprecation notice" } ],
      "severity": "high",
      "replacement": "Native fetch",
      "summary": "The package is deprecated.",
      "title": "request is deprecated",
      "event": "deprecated",
      "vers": "vers:npm/*",
      "purl": "pkg:npm/request",
      "ecosystem": "npm"
    }
  ],
  "schemaVersion": "evergreen.registry.v2"
}
`;

function git(root: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function fixtureDirectory(root: string, kind: "match" | "clean"): string {
  return join(root, "tests", "fixtures", RULE_ID, kind, "package.json");
}

/** A throwaway repository with one rule and its two fixtures, committed as the base revision. */
async function repository(): Promise<{ root: string; base: string }> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-changed-rules-"));
  await mkdir(join(root, "registry"), { recursive: true });
  await mkdir(join(root, "tests", "fixtures", RULE_ID, "match"), { recursive: true });
  await mkdir(join(root, "tests", "fixtures", RULE_ID, "clean"), { recursive: true });
  await writeFile(join(root, "registry", "npm.json"), registryText());
  await writeFile(fixtureDirectory(root, "match"), manifest("request", "2.88.2"));
  await writeFile(fixtureDirectory(root, "clean"), manifest("express", "4.18.2"));
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

test("changed paths select registry files and fixture rule ids and ignore everything else", () => {
  const { files, fixtureRules } = classifyChangedPaths([
    "registry/npm.json",
    "registry/sources.lock.json",
    "tests/fixtures/npm.package.request.deprecated/match/package.json",
    "tests/fixtures/npm.package.request.deprecated/clean/package.json",
    "tests/fixtures/not a rule/notes.txt",
    "fixtures/npm.package.request.deprecated/match/package.json",
    "src/rule-test.ts",
  ]);
  assert.deepEqual(files, ["registry/npm.json"]);
  assert.deepEqual(fixtureRules, ["npm.package.request.deprecated"]);
});

test("a new, changed, or reordered rule is reported; an unchanged or deleted one is not", () => {
  assert.deepEqual(changedRuleIds(undefined, registryText()), [RULE_ID]);
  assert.deepEqual(changedRuleIds(registryText(), registryText()), []);
  assert.deepEqual(changedRuleIds(registryText(), registryText("Updated summary.")), [RULE_ID]);
  assert.deepEqual(changedRuleIds(registryText(), REORDERED), []);
  assert.deepEqual(changedRuleIds(registryText(), `${JSON.stringify({ schemaVersion: "evergreen.registry.v2", ecosystem: "npm", rules: [] })}\n`), []);
  assert.deepEqual(changedRuleIds(registryText(), "{ not json"), []);
});

test("a changed rule is linted, tested, and named in the summary", async () => {
  const { root, base } = await repository();
  try {
    await writeFile(join(root, "registry", "npm.json"), registryText("Updated summary."));
    await commit(root, "change the rule");
    const result = await runChangedRules({ base, root });
    assert.deepEqual(result.files, ["registry/npm.json"]);
    assert.deepEqual(result.rules, [RULE_ID]);
    assert.equal(result.passed, true);
    const summary = renderChangedRulesSummary(result);
    assert.match(summary, new RegExp(`\\| \`${escapedRule}\` \\| pass \\| pass \\|`));
    assert.match(summary, /All 1 changed rule passed\./);
    assert.match(renderChangedRulesText(result), new RegExp(`Passed ${escapedRule}`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a clean fixture that reports the rule fails and names the rule", async () => {
  const { root, base } = await repository();
  try {
    await writeFile(fixtureDirectory(root, "clean"), manifest("request", "2.88.2"));
    await commit(root, "break the clean fixture");
    const result = await runChangedRules({ base, root });
    assert.deepEqual(result.rules, [RULE_ID]);
    assert.equal(result.passed, false);
    const summary = renderChangedRulesSummary(result);
    assert.match(summary, new RegExp(`\\| \`${escapedRule}\` \\| pass \\| \\*\\*fail\\*\\* \\|`));
    assert.match(summary, /#### Fixture problems/);
    assert.match(summary, new RegExp(`Failed ${escapedRule} \\(registry/npm\\.json\\)`));
    assert.match(summary, /clean: expected no findings/);
    assert.match(renderChangedRulesText(result), new RegExp(`Failed ${escapedRule}`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a lint problem in a changed registry file fails and names the rule and field", async () => {
  const { root, base } = await repository();
  try {
    const rule = JSON.parse(registryText()) as { rules: { provenance: Record<string, unknown> }[] };
    delete rule.rules[0]!.provenance.reviewedAt;
    await writeFile(join(root, "registry", "npm.json"), `${JSON.stringify(rule, null, 2)}\n`);
    await commit(root, "break the rule");
    const result = await runChangedRules({ base, root });
    assert.equal(result.passed, false);
    const issue = result.lint.issues.find((item) => item.ruleId === RULE_ID);
    assert.ok(issue !== undefined, JSON.stringify(result.lint.issues));
    assert.match(issue.message, /provenance\.reviewedAt is required/);
    const summary = renderChangedRulesSummary(result);
    assert.match(summary, /#### Lint problems/);
    assert.match(summary, new RegExp(escapedRule));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a pull request that touches no rule reports that nothing changed", async () => {
  const { root, base } = await repository();
  try {
    await writeFile(join(root, "README.md"), "# Fixture\n\nUpdated.\n");
    await commit(root, "touch readme only");
    const result = await runChangedRules({ base, root });
    assert.equal(result.passed, true);
    assert.deepEqual(result.rules, []);
    assert.match(renderChangedRulesSummary(result), /No rule changed in this pull request\./);
    assert.match(renderChangedRulesText(result), /No rule changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a rule deleted with its fixtures is skipped instead of failing", async () => {
  const { root, base } = await repository();
  try {
    await rm(join(root, "tests", "fixtures", RULE_ID), { recursive: true, force: true });
    await writeFile(join(root, "registry", "npm.json"), `${JSON.stringify({ schemaVersion: "evergreen.registry.v2", ecosystem: "npm", rules: [] })}\n`);
    await commit(root, "remove the rule");
    const result = await runChangedRules({ base, root });
    assert.equal(result.passed, true);
    assert.deepEqual(result.rules, []);
    assert.deepEqual(result.files, ["registry/npm.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the command exits 1, names the rule, and writes the summary when a fixture breaks", async () => {
  const { root, base } = await repository();
  try {
    await writeFile(fixtureDirectory(root, "clean"), manifest("request", "2.88.2"));
    await commit(root, "break the clean fixture");
    const summaryPath = join(root, "summary.md");
    const run = spawnSync(
      process.execPath,
      [resolve("dist/tools/changed-rules.js"), "--base", base, "--summary", summaryPath],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, new RegExp(`Rule changes failed: ${escapedRule}`));
    const summary = await readFile(summaryPath, "utf8");
    assert.match(summary, new RegExp(`\`${escapedRule}\``));
    assert.match(summary, /#### Fixture problems/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the command exits 0 when the changed rule passes", async () => {
  const { root, base } = await repository();
  try {
    await writeFile(join(root, "registry", "npm.json"), registryText("Updated summary."));
    await commit(root, "change the rule");
    const run = spawnSync(process.execPath, [resolve("dist/tools/changed-rules.js"), "--base", base], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, new RegExp(`Passed ${escapedRule}`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the command needs a base ref and rejects unknown flags", async () => {
  await assert.rejects(main([]), /Usage: changed-rules --base/);
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

test("the rules workflow runs on pull requests for rule and fixture changes only", () => {
  assert.deepEqual(Object.keys(workflow.on), ["pull_request"]);
  const paths = workflow.on.pull_request!.paths!;
  for (const path of ["registry/**", "tests/fixtures/**", "src/rule-lint.ts", "src/rule-test.ts", "tools/changed-rules.ts", ".github/workflows/rules.yml"]) {
    assert.ok(paths.includes(path), path);
  }
  assert.ok(!workflowText.includes("pull_request_target"));
});

test("the rules workflow has read-only permissions and no secret", () => {
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflowJob.permissions, undefined);
  assert.ok(!/secrets\./.test(workflowText));
});

test("the base branch reaches the rules shell only through an environment variable", () => {
  for (const step of workflowJob.steps.filter((item) => item.run)) {
    assert.ok(!/\$\{\{/.test(step.run!), `an expression is interpolated into a run script: ${step.name ?? step.run}`);
  }
  const check = workflowJob.steps.find((step) => step.run?.includes("changed-rules"))!;
  assert.equal(check.env?.BASE_REF, "${{ github.base_ref }}");
  assert.match(check.run!, /git fetch --no-tags origin "\$BASE_REF"/);
  assert.match(check.run!, /--base "origin\/\$BASE_REF"/);
  assert.match(check.run!, /--summary "\$GITHUB_STEP_SUMMARY"/);
});

test("the rules workflow checks out history and pins every action to a full SHA", () => {
  assert.equal(workflowJob.steps[0]!.with?.["fetch-depth"], 0);
  for (const step of workflowJob.steps.filter((item) => item.uses)) {
    assert.match(step.uses!, /^[\w./-]+@[0-9a-f]{40}$/, step.uses);
  }
});

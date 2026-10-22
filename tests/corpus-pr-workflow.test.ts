import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

interface Step { name?: string; uses?: string; run?: string; if?: string; env?: Record<string, string>; with?: Record<string, unknown> }
interface Workflow {
  on: Record<string, { paths?: string[] } | null>;
  permissions?: Record<string, string>;
  jobs: Record<string, { permissions?: Record<string, string>; steps: Step[] }>;
}

const text = await readFile(resolve(".github/workflows/corpus-pr.yml"), "utf8");
const workflow = parse(text) as Workflow;
const job = workflow.jobs.corpus!;

test("it runs on pull requests, only for relevant paths, and never on pull_request_target", () => {
  assert.deepEqual(Object.keys(workflow.on), ["pull_request"]);
  assert.ok(workflow.on.pull_request!.paths!.includes("registry/**"));
  assert.ok(workflow.on.pull_request!.paths!.includes("src/**"));
});

test("it has read-only permissions and no secrets", () => {
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(job.permissions, undefined);
  assert.ok(!/secrets\./.test(text));
});

test("the base branch reaches the shell only through an environment variable", () => {
  for (const step of job.steps.filter((item) => item.run)) {
    assert.ok(!/\$\{\{/.test(step.run!), `an expression is interpolated into a run script: ${step.name ?? step.run}`);
  }
  const check = job.steps.find((step) => step.run?.includes("--changed"))!;
  assert.equal(check.env?.BASE_REF, "${{ github.base_ref }}");
  assert.match(check.run!, /--changed "origin\/\$BASE_REF"/);
});

test("it checks out history, restores but never saves the cache, and prints the mismatch lines in the summary", () => {
  assert.equal(job.steps[0]!.with?.["fetch-depth"], 0);
  assert.ok(job.steps.some((step) => step.uses?.startsWith("actions/cache/restore@")));
  assert.ok(!job.steps.some((step) => step.uses?.startsWith("actions/cache/save@") || step.uses?.startsWith("actions/cache@")));
  const summary = job.steps.find((step) => step.run?.includes("GITHUB_STEP_SUMMARY"))!;
  assert.equal(summary.if, "always()");
  assert.match(summary.run!, /UNEXPECTED\|MISSING/);
});

test("actions are pinned to exact major versions", () => {
  for (const step of job.steps.filter((item) => item.uses)) assert.match(step.uses!, /^[\w./-]+@[0-9a-f]{40}$/, step.uses);
});

test("it compares the corpus expectations with the committed snapshot before any network step", () => {
  const index = job.steps.findIndex((step) => step.run?.includes("benchmarks/corpus-snapshot.js"));
  assert.ok(index >= 0);
  assert.ok(index < job.steps.findIndex((step) => step.uses?.startsWith("actions/cache/restore@")));
});

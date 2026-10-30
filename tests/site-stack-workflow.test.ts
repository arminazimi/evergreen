import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { parse } from "yaml";

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
}

interface Job {
  "runs-on"?: string;
  if?: string;
  steps: Step[];
}

interface Workflow {
  name?: string;
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}

const path = "integrations/slipway-seaworthy/evergreen-seaworthy.yml";
const text = await readFile(resolve(path), "utf8");
const workflow = parse(text) as Workflow;

test("the workflow parses and declares the lifecycle and seaworthy jobs", () => {
  assert.equal(Object.keys(workflow.jobs).sort().join(","), "lifecycle,seaworthy");
  assert.ok("pull_request" in workflow.on);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflow.jobs.lifecycle!["runs-on"], "ubuntu-latest");
  assert.equal(workflow.jobs.seaworthy!["runs-on"], "ubuntu-latest");
});

test("job one runs the Evergreen Action with a high severity gate", () => {
  const steps = workflow.jobs.lifecycle!.steps;
  assert.ok(steps.some((step) => step.uses?.startsWith("actions/checkout@")));
  const evergreen = steps.find((step) => step.uses?.startsWith("arminazimi/evergreen@"));
  assert.ok(evergreen, "the lifecycle job runs the Evergreen Action");
  assert.equal(evergreen.with?.["fail-on-severity"], "high");
});

test("job two is gated on SEAWORTHY_ENABLED and verifies the built site", () => {
  const job = workflow.jobs.seaworthy!;
  assert.equal(job.if, "${{ vars.SEAWORTHY_ENABLED == 'true' }}");
  const runs = job.steps.map((step) => step.run).filter(Boolean);
  assert.ok(runs.some((run) => /bundle exec jekyll build/.test(run!)), "the site is built");
  assert.ok(runs.some((run) => /npx seaworthy verify \.\/_site/.test(run!)), "Seaworthy verifies ./_site");
});

test("no step uses an unpinned action reference", () => {
  const uses = Object.values(workflow.jobs).flatMap((job) => job.steps.map((step) => step.uses).filter(Boolean));
  assert.ok(uses.length > 0);
  for (const reference of uses) {
    assert.match(
      reference!,
      /^[\w./-]+@[0-9a-f]{40}$/,
      `unpinned or non-SHA action reference: ${reference}`,
    );
  }
  assert.match(text, /# v7\b/);
  assert.match(text, /# v0\.7\.1\b/);
  assert.match(text, /# v1\.335\.0\b/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { parse } from "yaml";

interface Step {
  id?: string;
  run?: string;
}

interface Job {
  if?: string;
  needs?: string[] | string;
  uses?: string;
  outputs?: Record<string, string>;
  steps?: Step[];
}

interface Workflow {
  on?: Record<string, { paths?: string[] } | null>;
  jobs?: Record<string, Job>;
}

function workflow(path: string): Workflow {
  return parse(readFileSync(resolve(path), "utf8")) as Workflow;
}

test("site workflows run on site paths only and can be called from the merge queue", () => {
  for (const name of ["site-budget", "docs-doctor"]) {
    const file = `.github/workflows/${name}.yml`;
    const triggers = workflow(file).on ?? {};
    const pullRequest = triggers.pull_request;
    assert.ok(pullRequest, `${file} must trigger on pull requests`);
    assert.ok((pullRequest.paths ?? []).includes("docs/**"), `${file} must filter on docs/**`);
    assert.ok("workflow_call" in triggers, `${file} must be callable from ci.yml`);
    assert.equal(triggers.merge_group, undefined, `${file} must not run in the queue on its own`);
  }
});

test("ci.yml runs the site jobs only in the queue when the change touches site files", () => {
  const ci = workflow(".github/workflows/ci.yml");
  const changes = ci.jobs?.changes;
  assert.equal(changes?.outputs?.["site"], "${{ steps.classify.outputs.site }}");
  const classify = (changes?.steps ?? []).find((step) => step.id === "classify");
  const script = classify?.run ?? "";
  assert.match(script, /is_site\(\)/);
  assert.match(script, /docs\/\*\|lighthouserc\.json/);
  assert.match(script, /echo "site=\$site"/);

  for (const name of ["site-budget", "docs-doctor"]) {
    const job = ci.jobs?.[name];
    assert.ok(job, `${name} is missing from ci.yml`);
    assert.equal(job.uses, `$/.github/workflows/${name}.yml`);
    assert.match(job.if ?? "", /github\.event_name == 'merge_group'/);
    assert.match(job.if ?? "", /needs\.changes\.outputs\.site == 'true'/);
  }

  const needs = ci.jobs?.["ci-ok"]?.needs;
  const list = Array.isArray(needs) ? needs : needs === undefined ? [] : [needs];
  assert.ok(list.includes("site-budget"), "ci-ok must depend on site-budget");
  assert.ok(list.includes("docs-doctor"), "ci-ok must depend on docs-doctor");
});

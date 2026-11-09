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
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}
interface Workflow {
  on: {
    push?: { paths?: string[] };
    pull_request?: { paths?: string[] };
    schedule?: Array<{ cron: string }>;
    workflow_dispatch?: { inputs?: { mode?: { options?: string[]; default?: string } } };
  };
  permissions?: Record<string, string>;
  jobs: Record<
    string,
    {
      if?: string;
      permissions?: Record<string, string>;
      needs?: string | string[];
      strategy?: { matrix?: { shard?: number[] } };
      steps: Step[];
    }
  >;
}

const text = await readFile(resolve(".github/workflows/corpus.yml"), "utf8");
const workflow = parse(text) as Workflow;
const job = workflow.jobs.affected!;

test("one workflow covers affected, full, and record with a mode input", () => {
  assert.deepEqual(Object.keys(workflow.jobs).sort(), ["affected", "full", "merge", "record"]);
  assert.deepEqual(workflow.on.workflow_dispatch?.inputs?.mode?.options, ["affected", "full", "record"]);
  assert.equal(workflow.on.workflow_dispatch?.inputs?.mode?.default, "full");
  assert.ok(workflow.jobs.full!.if?.includes("inputs.mode == 'full'"));
  assert.ok(workflow.jobs.record!.if?.includes("inputs.mode == 'record'"));
  assert.ok(job.if?.includes("inputs.mode == 'affected'"));
});

test("the full run shards the corpus across eight jobs and the merge job rebuilds one report", () => {
  const full = workflow.jobs.full!;
  assert.deepEqual(full.strategy?.matrix?.shard, [1, 2, 3, 4, 5, 6, 7, 8]);
  const shardStep = full.steps.find((step) => step.run?.includes("--shard"))!;
  assert.equal(shardStep.env?.SHARD, "${{ matrix.shard }}");
  assert.equal(shardStep.env?.SHARD_COUNT, "8");
  assert.match(shardStep.run!, /public-repositories\.js --shard "\$SHARD\/\$SHARD_COUNT"/);
  assert.match(shardStep.run!, /corpus-result-\$SHARD\.json/);
  // Each shard owns its cache key, and every one restores through the shared prefix.
  const restore = full.steps.find((step) => step.uses?.startsWith("actions/cache/restore@"))!;
  const save = full.steps.find((step) => step.uses?.startsWith("actions/cache/save@"))!;
  const key = "corpus-checkouts-${{ hashFiles('benchmarks/public-repositories/**') }}-shard-${{ matrix.shard }}";
  assert.equal(restore.with?.key, key);
  assert.equal(save.with?.key, key);
  assert.match(String(restore.with?.["restore-keys"]), /corpus-checkouts-/);

  const merge = workflow.jobs.merge!;
  assert.equal(merge.needs, "full");
  assert.ok(merge.if?.includes("needs.full.result == 'success'"));
  assert.ok(merge.steps.some((step) => step.uses?.startsWith("actions/download-artifact@")));
  const mergeStep = merge.steps.find((step) => step.run?.includes("corpus-merge.js"))!;
  assert.match(mergeStep.run!, /--dir shard-reports --output corpus-result\.json/);
});

test("the full and merge jobs stay off the pull request lane", () => {
  for (const name of ["full", "merge"]) {
    const condition = workflow.jobs[name]!.if ?? "";
    assert.ok(!/pull_request/.test(condition), `${name} must not run for a pull request`);
  }
});

test("affected runs on pushes to main and on pull requests, only for relevant paths, and never on pull_request_target", () => {
  assert.ok(workflow.on.push!.paths!.includes("package-lock.json"));
  assert.ok(workflow.on.push!.paths!.includes("src/**"));
  assert.ok(workflow.on.push!.paths!.includes(".github/workflows/corpus.yml"));
  assert.deepEqual(workflow.on.pull_request!.paths, workflow.on.push!.paths);
  assert.ok(!Object.hasOwn(workflow.on, "pull_request_target"));
});

test("affected has read-only permissions and no secrets", () => {
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(job.permissions, undefined);
  assert.ok(!/secrets\./.test(text));
});

test("the base commit reaches the shell only through an environment variable", () => {
  for (const step of job.steps.filter((item) => item.run)) {
    assert.ok(!/\$\{\{/.test(step.run!), `an expression is interpolated into a run script: ${step.name ?? step.run}`);
  }
  const check = job.steps.find((step) => step.run?.includes("--changed"))!;
  assert.equal(check.env?.BASE_SHA, "${{ github.event.pull_request.base.sha || github.event.before }}");
  assert.match(check.run!, /--changed "\$BASE_SHA"/);
});

test("affected checks out history, restores but never saves the cache, and prints the mismatch lines in the summary", () => {
  assert.equal(job.steps[0]!.with?.["fetch-depth"], 0);
  assert.ok(job.steps.some((step) => step.uses?.startsWith("actions/cache/restore@")));
  assert.ok(
    !job.steps.some((step) => step.uses?.startsWith("actions/cache/save@") || step.uses?.startsWith("actions/cache@")),
  );
  const summary = job.steps.find((step) => step.run?.includes("GITHUB_STEP_SUMMARY"))!;
  assert.equal(summary.if, "always()");
  assert.match(summary.run!, /UNEXPECTED\|MISSING/);
});

test("actions are pinned to exact major versions", () => {
  for (const step of job.steps.filter((item) => item.uses)) {
    // `./` and `$/` resolve inside this repository, so neither carries a pinned ref.
    if (step.uses!.startsWith("$/") || step.uses!.startsWith("./")) continue;
    assert.match(step.uses!, /^[\w./-]+@[0-9a-f]{40}$/, step.uses);
  }
});

test("affected compares the corpus expectations with the committed snapshot before any network step", () => {
  const index = job.steps.findIndex((step) => step.run?.includes("benchmarks/corpus-snapshot.js"));
  assert.ok(index >= 0);
  assert.ok(index < job.steps.findIndex((step) => step.uses?.startsWith("actions/cache/restore@")));
});

test("affected compares each ecosystem's count with its committed target before any network step", () => {
  const index = job.steps.findIndex((step) => step.run?.includes("benchmarks/corpus-targets.js"));
  assert.ok(index >= 0);
  assert.ok(index < job.steps.findIndex((step) => step.uses?.startsWith("actions/cache/restore@")));
});

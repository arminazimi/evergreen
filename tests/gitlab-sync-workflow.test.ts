import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

interface Step {
  name?: string;
  uses?: string;
  if?: string;
  env?: Record<string, string>;
  run?: string;
}
interface Job {
  "timeout-minutes"?: number;
  steps: Step[];
}
interface Workflow {
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  jobs: Record<string, Job>;
}

const path = ".github/workflows/gitlab-sync.yml";
const workflow = parse(await readFile(resolve(path), "utf8")) as Workflow;
const job = workflow.jobs.sync!;
const wait = job.steps.find((step) => step.name === "Wait for the release on npm");
const commands = job.steps.map((step) => step.run ?? "").join("\n");

test("the wait step polls with the numbers it declares, not literals", () => {
  assert.ok(wait, "the wait step exists");
  assert.equal(wait.if, "github.ref_type == 'tag'");
  assert.match(wait.run!, /for _ in \$\(seq 1 "\$POLL_ATTEMPTS"\)/);
  assert.match(wait.run!, /sleep "\$POLL_INTERVAL_SECONDS"/);
  assert.doesNotMatch(wait.run!, /sleep 10\b|seq 1 60\b/, "no second copy of the numbers");
});

test("the wait covers npm's delay and still ends before the job timeout, so the step fails on its own", () => {
  const attempts = Number(wait?.env?.POLL_ATTEMPTS);
  const interval = Number(wait?.env?.POLL_INTERVAL_SECONDS);
  assert.ok(Number.isInteger(attempts) && attempts > 0, "POLL_ATTEMPTS is a positive integer");
  assert.ok(Number.isInteger(interval) && interval > 0, "POLL_INTERVAL_SECONDS is a positive integer");
  const waitMinutes = (attempts * interval) / 60;
  const timeout = job["timeout-minutes"]!;
  // v0.7.2 took about 7 minutes from `npm publish` to an installable version, and the job starts before publish ends.
  assert.ok(waitMinutes > 7, `a ${waitMinutes} minute wait is too short for npm`);
  assert.ok(waitMinutes < timeout, `a ${waitMinutes} minute wait must end inside ${timeout} minutes`);
});

test("the wait step's error names how long it waited", () => {
  assert.match(commands, /not on npm after \$\{minutes\} minutes/);
  assert.match(commands, /minutes=\$\(\(POLL_ATTEMPTS \* POLL_INTERVAL_SECONDS \/ 60\)\)/);
});

test("the release still mirrors main and pushes the tag alone", () => {
  assert.deepEqual(workflow.concurrency, { group: "gitlab-sync", "cancel-in-progress": false });
  assert.match(commands, /git push --force gitlab "\$\{GITHUB_SHA\}:refs\/heads\/main"/);
  assert.match(commands, /git push --force gitlab "refs\/tags\/\$\{GITHUB_REF_NAME\}"/);
  const push = job.steps.find((step) => step.run?.includes("git push --force gitlab"));
  assert.deepEqual(push?.env, { GITLAB_TOKEN: "${{ secrets.GITLAB_SYNC_TOKEN }}" });
});

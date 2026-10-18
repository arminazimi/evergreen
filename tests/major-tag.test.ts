import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { parse } from "yaml";

const scriptPath = resolve(".github/scripts/major-tag.mjs");
const script = (await import(pathToFileURL(scriptPath).href)) as {
  parseStableTag(tag: string): { major: number; minor: number; patch: number } | null;
  compareStableTags(left: string, right: string): number;
  selectRelease(tags: string, version: string): { move: boolean; reason?: string; releaseTag?: string; majorTag?: string };
  checkDirection(major: string, release: string, current: string): { newest: string };
};

test("only stable tags from 1.0.0 on are release tags", () => {
  assert.deepEqual(script.parseStableTag("v1.4.2"), { major: 1, minor: 4, patch: 2 });
  assert.deepEqual(script.parseStableTag("v10.0.0"), { major: 10, minor: 0, patch: 0 });
  for (const tag of ["v0.2.0", "v1.0.0-rc.1", "v1.2", "v01.2.3", "1.2.3", "v1.2.3+build", "latest", "v1", ""]) {
    assert.equal(script.parseStableTag(tag), null, tag);
  }
});

test("versions compare numerically, so v10 is after v9 and v1.10.0 after v1.9.0", () => {
  assert.ok(script.compareStableTags("v10.0.0", "v9.9.9") > 0);
  assert.ok(script.compareStableTags("v1.10.0", "v1.9.0") > 0);
  assert.ok(script.compareStableTags("v1.2.3", "v1.2.4") < 0);
  assert.equal(script.compareStableTags("v2.0.0", "v2.0.0"), 0);
  assert.throws(() => script.compareStableTags("v1.0.0-rc.1", "v1.0.0"), /stable release tags/);
});

test("no tag, a pre-release tag, or a 0.x tag leaves every major tag alone", () => {
  for (const tags of ["", "\n", "v1.0.0-rc.1", "v0.2.0", "v0.2.0\nv1.0.0-beta.2", "some-other-tag"]) {
    const result = script.selectRelease(tags, "1.0.0");
    assert.equal(result.move, false, JSON.stringify(tags));
    assert.match(result.reason ?? "", /leaving major tags unchanged/);
  }
});

test("a stable tag that matches package.json selects its major tag", () => {
  assert.deepEqual(script.selectRelease("v1.4.2\n", "1.4.2"), { move: true, releaseTag: "v1.4.2", majorTag: "v1" });
  assert.deepEqual(script.selectRelease("v1.0.0\nv1.0.0-rc.1\nnightly", "1.0.0"), { move: true, releaseTag: "v1.0.0", majorTag: "v1" });
  assert.deepEqual(script.selectRelease("v10.0.0", "10.0.0"), { move: true, releaseTag: "v10.0.0", majorTag: "v10" });
});

test("two stable tags on one commit, or a tag that differs from package.json, is an error and not a guess", () => {
  assert.throws(() => script.selectRelease("v1.4.2\nv1.4.3", "1.4.3"), /More than one stable release tag/);
  assert.throws(() => script.selectRelease("v1.4.2", "1.4.3"), /does not match package.json version v1\.4\.3/);
});

test("a major tag moves forward, is created when it does not exist, and never moves backward", () => {
  assert.deepEqual(script.checkDirection("v1", "v1.4.2", "v1.4.1\nv1.4.1-rc.1"), { newest: "v1.4.1" });
  assert.deepEqual(script.checkDirection("v1", "v1.0.0", ""), { newest: "" }, "first creation of the major tag");
  assert.deepEqual(script.checkDirection("v1", "v1.4.2", "v1.4.2"), { newest: "v1.4.2" }, "a rerun of the same release is allowed");
  assert.throws(() => script.checkDirection("v1", "v1.4.1", "v1.4.2"), /Refusing to move v1 backward from v1\.4\.2 to v1\.4\.1/);
  assert.throws(() => script.checkDirection("v1", "v1.9.0", "v1.10.0"), /backward/, "v1.10.0 is newer than v1.9.0");
  assert.throws(() => script.checkDirection("v2", "v1.4.2", ""), /not the major tag/);
});

test("tags of another major at the old commit do not block a move", () => {
  assert.deepEqual(script.checkDirection("v2", "v2.0.0", "v1.9.9\nv2"), { newest: "" });
});

function run(...args: string[]) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });
}

test("the command line prints GITHUB_OUTPUT lines, exits 0 when nothing moves, and exits 1 when a move is refused", () => {
  const move = run("select", "--tags", "v1.4.2", "--package-version", "1.4.2");
  assert.equal(move.status, 0);
  assert.equal(move.stdout, "move=true\nrelease-tag=v1.4.2\nmajor-tag=v1\n");
  const none = run("select", "--tags", "v0.2.0", "--package-version", "0.2.0");
  assert.equal(none.status, 0);
  assert.equal(none.stdout, "move=false\n");
  const backward = run("direction", "--major", "v1", "--release", "v1.4.1", "--current-tags", "v1.4.2");
  assert.equal(backward.status, 1);
  assert.match(backward.stderr, /Refusing to move v1 backward/);
  assert.equal(run("select", "--tags", "v1.0.0").status, 1, "a missing --package-version is a usage error");
  assert.equal(run("bogus").status, 1);
});

interface Step { name?: string; if?: string; run?: string; env?: Record<string, string> }
interface Workflow {
  on: { workflow_dispatch: { inputs: Record<string, unknown> }; workflow_run: unknown };
  jobs: Record<string, { if?: string; permissions?: Record<string, string>; env?: Record<string, string>; steps: Step[] }>;
}

test("the workflow uses the script, keeps write access to the major-tag job, and never pushes on a manual run", async () => {
  const workflow = parse(await readFile(resolve(".github/workflows/release.yml"), "utf8")) as Workflow;
  assert.ok("release_tag" in workflow.on.workflow_dispatch.inputs, "a manual dry run takes a release tag");
  const job = workflow.jobs["major-tag"]!;
  assert.deepEqual(job.permissions, { contents: "write" });
  assert.deepEqual(workflow.jobs["notes"]!.permissions ?? {}, {}, "only the major-tag job writes");
  assert.match(job.env!["DRY_RUN"]!, /workflow_dispatch/, "a manual run is always a dry run");
  const push = job.steps.find((step) => step.run?.includes("git push"));
  assert.ok(push, "there is a push step");
  assert.match(push.if ?? "", /DRY_RUN != 'true'/, "the push step is skipped in a dry run");
  assert.equal(job.steps.filter((step) => step.run?.includes("git push")).length, 1, "exactly one step pushes");
  const text = job.steps.map((step) => step.run ?? "").join("\n");
  assert.match(text, /major-tag\.mjs select/);
  assert.match(text, /major-tag\.mjs direction/);
  assert.doesNotMatch(text, /sort -V/, "version ordering is done by the tested script, not by shell");
  assert.match(job.if ?? "", /workflow_run/);
  assert.match(job.if ?? "", /inputs\.release_tag != ''/, "a manual run without a release tag does nothing");
});

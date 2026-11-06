import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

const workflowsDir = resolve(".github/workflows");

async function lineCount(path: string): Promise<number> {
  const text = await readFile(path, "utf8");
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
}

test("every release workflow file stays at or under 200 lines", async () => {
  const names = (await readdir(workflowsDir)).filter((name) => name === "release.yml" || name.startsWith("release-"));
  assert.ok(names.includes("release.yml"));
  assert.ok(names.length >= 8, "expected the orchestrator plus stage workflows");
  for (const name of names) {
    const path = join(workflowsDir, name);
    assert.equal((await stat(path)).isFile(), true);
    const lines = await lineCount(path);
    assert.ok(lines <= 200, `${name} has ${lines} lines (limit 200)`);
  }
});

test("release.yml calls verify, build, publish-per-channel, and smoke stages", async () => {
  const orchestrator = parse(await readFile(join(workflowsDir, "release.yml"), "utf8")) as {
    on: {
      push?: { branches?: string[]; tags?: string[] };
      workflow_dispatch: { inputs: Record<string, { type?: string; default?: boolean }> };
      workflow_run?: unknown;
    };
    jobs: Record<string, { uses?: string; if?: string; needs?: string | string[] }>;
  };
  assert.equal(orchestrator.on.workflow_dispatch.inputs.dry_run?.type, "boolean");
  assert.equal(orchestrator.on.workflow_dispatch.inputs.dry_run?.default, false);

  const expected = {
    "publish-npm": "./.github/workflows/publish.yml",
    verify: "./.github/workflows/release-verify.yml",
    "build-action": "./.github/workflows/release-build-action.yml",
    "build-binaries": "./.github/workflows/release-build-binaries.yml",
    "publish-tags": "./.github/workflows/release-publish-tags.yml",
    "publish-container": "./.github/workflows/release-publish-container.yml",
    "publish-homebrew": "./.github/workflows/release-publish-homebrew.yml",
    "publish-binaries": "./.github/workflows/release-publish-binaries.yml",
    sbom: "./.github/workflows/release-sbom.yml",
    smoke: "./.github/workflows/release-smoke.yml",
  };
  for (const [job, uses] of Object.entries(expected)) {
    assert.equal(orchestrator.jobs[job]?.uses, uses, job);
  }
  assert.deepEqual(orchestrator.jobs["publish-npm"]!.needs, ["npm-publish"]);
  assert.deepEqual(orchestrator.jobs["publish-binaries"]!.needs, ["publish-npm", "build-binaries"]);
  assert.deepEqual(orchestrator.jobs.sbom!.needs, ["publish-binaries"]);

  for (const job of [
    "publish-npm",
    "verify",
    "build-action",
    "build-binaries",
    "publish-tags",
    "publish-container",
    "publish-homebrew",
    "publish-binaries",
    "smoke",
  ]) {
    assert.match(orchestrator.jobs[job]!.if ?? "", /dry_run|workflow_dispatch|push|refs\/tags/, job);
  }
  assert.doesNotMatch(
    JSON.stringify(orchestrator.on),
    /workflow_run/,
    "the chain is one workflow run, not workflow_run",
  );
  assert.match(orchestrator.jobs["build-action"]!.if ?? "", /inputs\.dry_run/);
  assert.match(orchestrator.jobs.smoke!.if ?? "", /inputs\.dry_run/);
  assert.match(orchestrator.jobs["publish-container"]!.if ?? "", /inputs\.dry_run/);
  assert.match(orchestrator.jobs["publish-homebrew"]!.if ?? "", /inputs\.dry_run/);
  assert.match(orchestrator.jobs["build-binaries"]!.if ?? "", /inputs\.dry_run/);
  assert.match(orchestrator.jobs["publish-binaries"]!.if ?? "", /inputs\.dry_run/);
  assert.match(orchestrator.jobs["publish-tags"]!.if ?? "", /inputs\.dry_run/);
  assert.match(orchestrator.jobs["publish-npm"]!.if ?? "", /inputs\.dry_run/);
});

test("a dry run passes dry_run into every stage and publishes nothing from those stages", async () => {
  const files = [
    "publish.yml",
    "release-verify.yml",
    "release-build-action.yml",
    "release-build-binaries.yml",
    "release-publish-tags.yml",
    "release-publish-container.yml",
    "release-publish-homebrew.yml",
    "release-publish-binaries.yml",
    "release-smoke.yml",
  ];
  for (const name of files) {
    const workflow = parse(await readFile(join(workflowsDir, name), "utf8")) as {
      on: { workflow_call: { inputs: Record<string, { type?: string }> } };
      jobs: Record<string, { steps?: Array<{ if?: string; run?: string }>; if?: string }>;
    };
    assert.equal(workflow.on.workflow_call.inputs.dry_run?.type, "boolean", name);
  }

  const action = await readFile(join(workflowsDir, "release-build-action.yml"), "utf8");
  assert.match(action, /!inputs\.dry_run/);
  assert.match(action, /git push origin "HEAD:refs\/heads\/release\/v\$VERSION"/);

  const container = await readFile(join(workflowsDir, "release-publish-container.yml"), "utf8");
  assert.match(container, /!inputs\.dry_run/);
  assert.match(container, /push: true/);

  const homebrew = await readFile(join(workflowsDir, "release-publish-homebrew.yml"), "utf8");
  assert.match(homebrew, /!inputs\.dry_run/);
  assert.match(homebrew, /git push origin HEAD:main/);

  const binaries = await readFile(join(workflowsDir, "release-publish-binaries.yml"), "utf8");
  assert.match(binaries, /!inputs\.dry_run/);
  assert.match(binaries, /gh release upload/);

  const tags = await readFile(join(workflowsDir, "release-publish-tags.yml"), "utf8");
  assert.match(tags, /DRY_RUN != 'true'/);
  assert.match(tags, /git push origin "refs\/tags\/\$MAJOR_TAG"/);
});

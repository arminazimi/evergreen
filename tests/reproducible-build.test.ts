import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { parse } from "yaml";

import { compareCleanBuilds } from "../tools/reproducible-build.js";

const { scripts } = JSON.parse(await readFile("package.json", "utf8")) as { scripts: Record<string, string> };

test("check:reproducible builds once, then compares two clean builds", () => {
  assert.match(scripts["check:reproducible"]!, /^npm run build --silent && node dist\/tools\/reproducible-build\.js$/);
});

test("two identical clean builds pass and report one shared hash", async () => {
  let builds = 0;
  const { hashes } = await compareCleanBuilds({
    build: async () => {
      builds += 1;
    },
    pack: async (destination) => {
      await writeFile(join(destination, "evergreen-deprecation-0.0.0.tgz"), "identical");
      return "evergreen-deprecation-0.0.0.tgz";
    },
  });
  assert.equal(builds, 2);
  assert.equal(hashes.length, 2);
  assert.equal(hashes[0], hashes[1]);
});

test("a mismatch names both hashes and keeps the tarballs for diffing", async () => {
  let iteration = 0;
  const error = await compareCleanBuilds({
    build: async () => {},
    pack: async (destination) => {
      iteration += 1;
      const name = `evergreen-deprecation-0.0.0-${iteration}.tgz`;
      await writeFile(join(destination, name), `build ${iteration}`);
      return name;
    },
  }).then(
    () => null,
    (failure: unknown) => failure,
  );

  assert.ok(error instanceof Error);
  const lines = error.message.split("\n");
  assert.match(lines[0]!, /the builds are not reproducible/);
  assert.match(error.message, /build 1: sha256 [0-9a-f]{64}/);
  assert.match(error.message, /build 2: sha256 [0-9a-f]{64}/);
  assert.notEqual(lines[1], lines[2], "the two hashes differ");
  // The named tarballs and the directory named in the error still exist, so the failure can be diffed.
  const kept = [...error.message.matchAll(/\(([^)]+\.tgz)\)/g)].map((match) => match[1]!);
  assert.equal(kept.length, 2);
  const [directory] = [...error.message.matchAll(/kept in ([^;]+);/g)].map((match) => match[1]!);
  assert.ok(directory);
  for (const path of [directory, ...kept]) await access(path);
});

test("a broken build fails the check without comparing hashes", async () => {
  await assert.rejects(
    () =>
      compareCleanBuilds({
        build: async () => {
          throw new Error("tsc failed");
        },
        pack: async () => {
          throw new Error("pack must not run");
        },
      }),
    /tsc failed/,
  );
});

test("the release workflow runs the reproducible check and fails the release on a mismatch", async () => {
  const workflow = parse(await readFile(".github/workflows/release.yml", "utf8")) as {
    jobs: Record<string, { if?: string; steps?: Array<{ run?: string }> }>;
  };
  const job = workflow.jobs.reproducible;
  assert.ok(job, "release.yml has no reproducible job");
  assert.match(job.if ?? "", /workflow_dispatch/);
  assert.match(job.if ?? "", /workflow_run.*conclusion == 'success'/s);
  const runs = job.steps?.map((step) => step.run ?? "").join("\n");
  assert.match(runs ?? "", /npm ci/);
  assert.match(runs ?? "", /npm run check:reproducible --silent/);
});

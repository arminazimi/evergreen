import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { parse } from "yaml";

import { compareCleanBuilds, recordPackedHash } from "../tools/reproducible-build.js";

const { scripts } = JSON.parse(await readFile("package.json", "utf8")) as { scripts: Record<string, string> };

test("check:reproducible builds once, then compares two clean builds", () => {
  assert.match(scripts["check:reproducible"]!, /^npm run build --silent && node dist\/tools\/reproducible-build\.js$/);
});

test("record:reproducible builds the tree, then records the packed hash for another runner", () => {
  assert.equal(
    scripts["record:reproducible"],
    "npm run build --silent && node dist/tools/reproducible-build.js --record",
  );
});

test("recording a packed build names the runner and hashes the tarball it packs", async () => {
  const record = await recordPackedHash({
    label: "Windows",
    pack: async (destination) => {
      await writeFile(join(destination, "evergreen-deprecation-0.0.0.tgz"), "packed");
      return "evergreen-deprecation-0.0.0.tgz";
    },
  });
  assert.equal(record.label, "Windows");
  assert.equal(record.sha256, createHash("sha256").update("packed").digest("hex"));
  assert.equal(record.tarball, "evergreen-deprecation-0.0.0.tgz");
  assert.equal(record.node, process.version);
  assert.equal(record.platform, process.platform);
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
  const orchestrator = parse(await readFile(".github/workflows/release.yml", "utf8")) as {
    jobs: Record<string, { if?: string; uses?: string; with?: Record<string, unknown> }>;
  };
  const verify = parse(await readFile(".github/workflows/release-verify.yml", "utf8")) as {
    jobs: Record<string, { if?: string; steps?: Array<{ run?: string; uses?: string }> }>;
  };
  assert.match(orchestrator.jobs.verify!.if ?? "", /workflow_dispatch/);
  assert.match(orchestrator.jobs.verify!.if ?? "", /refs\/tags\/v/);
  assert.equal(orchestrator.jobs.verify!.uses, "./.github/workflows/release-verify.yml");
  assert.equal(
    orchestrator.jobs.verify!.with?.run_reproducible,
    "${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')) }}",
  );
  const job = verify.jobs.reproducible;
  assert.ok(job, "release-verify.yml has no reproducible job");
  assert.match(job.if ?? "", /inputs\.run_reproducible/);
  const steps = job.steps ?? [];
  // The shared setup action installs the locked dependencies (its npm ci) before the check runs.
  assert.ok(
    steps.some((step) => step.uses === "$/.github/actions/setup"),
    "the reproducible job does not use the shared setup",
  );
  const runs = steps.map((step) => step.run ?? "").join("\n");
  assert.match(runs, /npm run check:reproducible --silent/);
});

test("CI records the tarball hash on Linux and the cross-OS runner, and ci-ok compares them", async () => {
  const ci = parse(await readFile(".github/workflows/ci.yml", "utf8")) as {
    jobs: Record<
      string,
      {
        steps?: Array<{ name?: string; run?: string; uses?: string; with?: Record<string, unknown> }>;
        permissions?: Record<string, string>;
      }
    >;
  };
  const recordStep = (job: string) => {
    const steps = ci.jobs[job]?.steps ?? [];
    assert.ok(
      steps.some((step) => step.run?.includes("npm run record:reproducible")),
      `${job} does not record the packed tarball hash`,
    );
    const upload = steps.find(
      (step) => step.uses?.startsWith("actions/upload-artifact") && step.with?.name === "reproducible-${{ runner.os }}",
    );
    assert.ok(upload, `${job} does not upload the hash record as reproducible-\${{ runner.os }}`);
  };
  // `check` builds on Linux; check-cross-os builds on Windows for pull requests and macOS on main and
  // in the merge queue. Both upload a record under the same artifact prefix.
  recordStep("check");
  recordStep("check-cross-os");

  const ok = ci.jobs["ci-ok"];
  assert.ok(ok, "ci.yml has no ci-ok job");
  assert.equal(ok.permissions?.["actions"], "read");
  const steps = ok.steps ?? [];
  const download = steps.find((step) => step.uses?.startsWith("actions/download-artifact"));
  assert.ok(download, "ci-ok does not download the build records");
  assert.equal(download.with?.pattern, "reproducible-*");
  assert.equal(download.with?.["merge-multiple"], true);
  assert.ok(
    steps.some((step) => step.run?.includes("node tools/compare-build-hashes.mjs")),
    "ci-ok does not compare the recorded hashes",
  );
});

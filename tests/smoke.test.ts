import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

const script = resolve(".github/scripts/smoke.mjs");
const fixture = resolve("tests/fixtures/smoke");

function smoke(...command: string[]) {
  return spawnSync(process.execPath, [script, fixture, "--", ...command], { encoding: "utf8" });
}

test("the smoke script passes against a working build and names each check", () => {
  const result = smoke(process.execPath, resolve("dist/src/cli.js"));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /--help runs/);
  assert.match(result.stdout, /capabilities prints a manifest/);
  assert.match(result.stdout, /scan finds the deprecated package/);
  assert.match(result.stdout, /Smoke test passed\./);
});

test("it fails when the command prints nothing useful, as a package without a working bin would", () => {
  const result = smoke(process.execPath, "-e", "process.exit(0)");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL: --help runs and names the tool/);
});

test("it fails when the command cannot be started, and when it is called wrongly", () => {
  assert.equal(smoke("definitely-not-a-real-command-evergreen").status, 1);
  assert.equal(spawnSync(process.execPath, [script, fixture], { encoding: "utf8" }).status, 2);
});

test("the publish workflow runs the smoke script on a fresh job after publishing, with read-only permissions", async () => {
  const { readFile } = await import("node:fs/promises");
  const { parse } = await import("yaml");
  const workflow = parse(await readFile(".github/workflows/publish.yml", "utf8")) as {
    jobs: { smoke: { needs: string; permissions: Record<string, string>; steps: Array<{ run?: string; "working-directory"?: string }> } };
  };
  const smokeJob = workflow.jobs.smoke;
  assert.equal(smokeJob.needs, "publish");
  assert.deepEqual(smokeJob.permissions, { contents: "read" });
  const step = smokeJob.steps.find((item) => item.run?.includes("smoke.mjs"));
  assert.ok(step, "a step runs smoke.mjs");
  assert.match(step.run!, /npx --yes "evergreen-deprecation@\$version"/);
  assert.match(step["working-directory"] ?? "", /runner\.temp/, "not inside the checkout, where npx would run this repository");
});

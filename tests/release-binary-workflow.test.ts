import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

interface Step { name?: string; uses?: string; run?: string; if?: string }
interface Job { needs?: string; permissions?: Record<string, string>; strategy?: { matrix: { include: Array<{ target: string }> } }; steps: Step[] }
interface Workflow { permissions?: Record<string, string>; jobs: Record<string, Job> }

const workflow = parse(await readFile(resolve(".github/workflows/release.yml"), "utf8")) as Workflow;
const binary = workflow.jobs.binary!;
const release = workflow.jobs["binary-release"]!;

test("a binary is built for every supported platform", () => {
  assert.deepEqual(binary.strategy?.matrix.include.map((entry) => entry.target).sort(), ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"]);
});

test("every binary is smoke-tested before it is uploaded", () => {
  const names = binary.steps.map((step) => step.run ?? step.uses ?? "");
  const smoke = names.findIndex((text) => text.includes("smoke.mjs"));
  const upload = names.findIndex((text) => text.startsWith("actions/upload-artifact@"));
  assert.ok(smoke !== -1 && upload > smoke);
  assert.ok(binary.steps.some((step) => step.run?.includes("PATH=/usr/bin:/bin")), "the Unix smoke test runs without Node.js on the path");
});

test("the release job needs the builds and holds only the permissions it uses", () => {
  assert.equal(release.needs, "binary");
  assert.deepEqual(release.permissions, { contents: "write", "id-token": "write", attestations: "write" });
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.ok(release.steps.some((step) => step.run?.includes("sha256sum")), "checksums are written");
  assert.ok(release.steps.some((step) => step.uses?.startsWith("actions/attest-build-provenance@")), "provenance is attested");
});

test("actions are pinned to exact commits", () => {
  for (const step of [...binary.steps, ...release.steps].filter((item) => item.uses)) {
    assert.match(step.uses!, /^[\w./-]+@[0-9a-f]{40}$/, step.uses);
  }
});

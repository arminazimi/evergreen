import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { parse } from "yaml";

const scriptPath = resolve(".github/scripts/release-smoke.mjs");
const script = (await import(pathToFileURL(scriptPath).href)) as {
  summarize(scan: unknown): { findings: string[]; unclassified: string[]; dataVersion: string | null };
  compareScans(built: unknown, published: unknown): { match: boolean; built?: string; published?: string };
};

function scan(overrides: Record<string, unknown> = {}) {
  return {
    root: "/a",
    scannedAt: "2026-01-01T00:00:00Z",
    findings: [{ ruleId: "npm.package.request.deprecated", id: "npm.package.request.deprecated:package.json:1" }],
    unclassified: { count: 0, references: [] },
    data: { version: "2026.10.1" },
    ...overrides,
  };
}

test("timestamps, roots, and finding order do not make two scans differ", () => {
  const second = { ruleId: "nodejs.runtime.legacy", id: "nodejs.runtime.legacy:package.json:1" };
  const built = scan({ findings: [...scan().findings, second] });
  const published = scan({ root: "/b", scannedAt: "2026-02-02T00:00:00Z", findings: [second, ...scan().findings] });
  assert.equal(script.compareScans(built, published).match, true);
});

test("a different finding, unclassified reference, or data version is a mismatch", () => {
  assert.equal(script.compareScans(scan(), scan({ findings: [] })).match, false);
  assert.equal(script.compareScans(scan(), scan({ data: { version: "2026.10.2" } })).match, false);
  const reference = { component: "actions/checkout", reference: "0".repeat(40) };
  assert.equal(script.compareScans(scan(), scan({ unclassified: { count: 1, references: [reference] } })).match, false);
});

test("the command exits 1 and prints both summaries on a mismatch, 0 on a match", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-release-smoke-"));
  try {
    const built = join(directory, "built.json");
    const published = join(directory, "published.json");
    await writeFile(built, JSON.stringify(scan()));
    await writeFile(published, JSON.stringify(scan()));
    assert.equal(spawnSync("node", [scriptPath, built, published], { encoding: "utf8" }).status, 0);
    await writeFile(published, JSON.stringify(scan({ findings: [] })));
    const mismatch = spawnSync("node", [scriptPath, built, published], { encoding: "utf8" });
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /differently/);
    assert.match(mismatch.stderr, /npm\.package\.request\.deprecated/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the release workflow compares the published package with the build after a successful publish", async () => {
  const workflow = parse(await readFile(resolve(".github/workflows/release.yml"), "utf8")) as {
    jobs: Record<string, { if?: string; permissions?: Record<string, string>; steps: { run?: string }[] }>;
  };
  const job = workflow.jobs["published-scan"]!;
  assert.match(job.if!, /workflow_run/);
  assert.match(job.if!, /conclusion == 'success'/);
  const commands = job.steps.map((step) => step.run ?? "").join("\n");
  assert.match(commands, /npx --yes "evergreen-deprecation@\$VERSION" scan/);
  assert.match(commands, /dist\/src\/cli\.js scan/);
  assert.match(commands, /release-smoke\.mjs/);
  assert.equal(job.permissions, undefined, "inherits the read-only workflow permissions");
});

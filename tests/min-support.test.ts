import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { runCli } from "./cli-runner.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

// Node.js 22 has a scheduled end of life on 2027-04-30.
async function node22Repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-min-support-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "22" } }));
  return root;
}

async function severities(root: string, ...flags: string[]): Promise<string[]> {
  const result = await runCli(["scan", root, "--json", ...flags]);
  assert.equal(result.code, 0);
  const out = JSON.parse(result.stdout) as { findings: Array<{ severity: string }> };
  return out.findings.map((finding) => finding.severity);
}

test("a line ending inside the window becomes a warning", async () => {
  const root = await node22Repository();
  assert.deepEqual(await severities(root, "--as-of", "2027-04-01", "--min-support-days", "29"), ["medium"]);
  assert.deepEqual(await severities(root, "--as-of", "2027-04-01", "--min-support-days", "28"), ["low"]);
});

test("default behavior is unchanged without the flag", async () => {
  const root = await node22Repository();
  assert.deepEqual(await severities(root, "--as-of", "2027-04-01"), ["low"]);
});

test("a window that is already past stays untouched", async () => {
  const root = await node22Repository();
  assert.deepEqual(await severities(root, "--as-of", "2027-04-30", "--min-support-days", "0"), ["high"]);
  assert.deepEqual(await severities(root, "--as-of", "2027-05-02", "--min-support-days", "90"), ["high"]);
});

test("the warning stays below the default high gate", async () => {
  const root = await node22Repository();
  const belowHigh = await runCli(["scan", root, "--fail-on", "high", "--as-of", "2027-04-01", "--min-support-days", "90"]);
  assert.equal(belowHigh.code, 0);
  const atMedium = await runCli(["scan", root, "--fail-on", "medium", "--as-of", "2027-04-01", "--min-support-days", "90"]);
  assert.equal(atMedium.code, 1);
});

test("rejects a value that is not a number of days", async () => {
  const root = await node22Repository();
  const soon = await runCli(["scan", root, "--min-support-days", "soon"]);
  assert.equal(soon.code, 2);
  const negative = await runCli(["scan", root, "--min-support-days", "-5"]);
  assert.equal(negative.code, 2);
});

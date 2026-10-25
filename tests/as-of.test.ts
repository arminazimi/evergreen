import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

// Node.js 22 has a scheduled end of life on 2027-04-30.
async function node22Repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-as-of-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "22" } }));
  return root;
}

interface Scan {
  asOf?: string;
  findings: Array<{ id: string; severity: string }>;
}

async function scan(root: string, ...flags: string[]): Promise<Scan> {
  return JSON.parse((await execute(process.execPath, [cli, "scan", root, "--json", ...flags])).stdout) as Scan;
}

test("a future date flips a scheduled end of life to high severity", async () => {
  const root = await node22Repository();
  const now = await scan(root);
  const before = await scan(root, "--as-of", "2027-04-29");
  const after = await scan(root, "--as-of", "2027-04-30");

  assert.equal(now.asOf, undefined);
  assert.deepEqual(now.findings.map((finding) => finding.severity), ["low"]);
  assert.deepEqual(before.findings.map((finding) => finding.severity), ["low"]);
  assert.deepEqual(after.findings.map((finding) => finding.severity), ["high"]);
  assert.equal(after.asOf, "2027-04-30");
  assert.equal(after.findings[0]?.id, now.findings[0]?.id);
});

test("--today is an alias for --as-of", async () => {
  const root = await node22Repository();
  const today = await scan(root, "--today", "2027-05-01");
  const asOf = await scan(root, "--as-of", "2027-05-01");
  assert.deepEqual(today.findings, asOf.findings);
  assert.equal(today.asOf, asOf.asOf);
});

test("--fail-on uses the projected severity", async () => {
  const root = await node22Repository();
  await execute(process.execPath, [cli, "scan", root, "--fail-on", "high"]);
  await assert.rejects(execute(process.execPath, [cli, "scan", root, "--fail-on", "high", "--as-of", "2027-05-01"]), { code: 1 });
});

test("rejects a date that is not a date", async () => {
  const root = await node22Repository();
  await assert.rejects(execute(process.execPath, [cli, "scan", root, "--as-of", "next-week"]), { code: 2 });
});

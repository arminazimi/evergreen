import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

const execute = promisify(execFile);
const temporaryRoots: string[] = [];
const cli = resolve("dist/src/cli.js");

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

interface ScanReport {
  schemaVersion: string;
  root: string;
  scannedAt: string;
  findings: Array<{ id: string; ruleId: string }>;
  diagnostics: string[];
}

interface ReceiptDocument {
  schema: string;
  counts: { resolved: number; remaining: number; introduced: number };
  resolved: Array<{ id: string; ruleId: string }>;
  remaining: Array<{ id: string }>;
  introduced: Array<{ id: string }>;
}

async function repository(manifest: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-receipt-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify(manifest));
  return root;
}

async function scan(root: string): Promise<ScanReport> {
  const { stdout } = await execute(process.execPath, [cli, "scan", root, "--json"]);
  return JSON.parse(stdout) as ScanReport;
}

async function runFailing(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    await execute(process.execPath, [cli, ...args]);
  } catch (error) {
    return error as { code: number; stdout: string; stderr: string };
  }
  assert.fail(`expected "evergreen ${args.join(" ")}" to fail`);
}

function emptyReport(scannedAt = "2026-10-30T00:00:00.000Z"): ScanReport {
  return { schemaVersion: "evergreen.scan.v1", root: ".", scannedAt, findings: [], diagnostics: [] };
}

test("receipt reports, as JSON, the findings a change resolved", async () => {
  const root = await repository({ engines: { node: "18" } });
  const before = await scan(root);
  assert.ok(before.findings.length > 0, "the fixture must start with at least one finding");
  const beforePath = join(root, "before.json");
  await writeFile(beforePath, JSON.stringify(before));
  await writeFile(join(root, "package.json"), JSON.stringify({}));

  const { stdout } = await execute(process.execPath, [cli, "receipt", root, "--before", beforePath, "--format", "json"]);
  const receipt = JSON.parse(stdout) as ReceiptDocument;

  assert.equal(receipt.schema, "evergreen.receipt.v1");
  assert.equal(receipt.counts.resolved, before.findings.length);
  assert.equal(receipt.counts.remaining, 0);
  assert.equal(receipt.counts.introduced, 0);
  assert.deepEqual(receipt.resolved.map((entry) => entry.id), before.findings.map((entry) => entry.id));
});

test("receipt renders Markdown and --fail-on-introduced gates new findings", async () => {
  const root = await repository({ engines: { node: "18" } });
  const beforePath = join(root, "before.json");
  await writeFile(beforePath, JSON.stringify(emptyReport()));

  const { stdout } = await execute(process.execPath, [cli, "receipt", root, "--before", beforePath]);
  assert.match(stdout, /<!-- evergreen-receipt -->/);
  assert.match(stdout, /## Evergreen receipt: New findings introduced/);
  assert.match(stdout, /### Introduced/);

  const gate = await runFailing(["receipt", root, "--before", beforePath, "--fail-on-introduced"]);
  assert.equal(gate.code, 1);
  assert.match(gate.stderr, /introduced \(--fail-on-introduced\)/);
});

test("receipt refuses a --before file it cannot use", async () => {
  const root = await repository({ engines: { node: "18" } });

  const invalid = join(root, "invalid.json");
  await writeFile(invalid, "{");
  const malformed = await runFailing(["receipt", root, "--before", invalid]);
  assert.equal(malformed.code, 2);
  assert.match(malformed.stderr, /not valid JSON/);

  const wrong = join(root, "wrong.json");
  await writeFile(wrong, JSON.stringify({ schemaVersion: "evergreen.rollup.v1", findings: [] }));
  const wrongReport = await runFailing(["receipt", root, "--before", wrong]);
  assert.equal(wrongReport.code, 2);
  assert.match(wrongReport.stderr, /not an evergreen\.scan\.v1 report/);

  const missing = await runFailing(["receipt", root, "--before", join(root, "missing.json")]);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /does not exist/);

  const noBefore = await runFailing(["receipt", root]);
  assert.equal(noBefore.code, 2);
  assert.match(noBefore.stderr, /Usage: evergreen receipt/);
});

test("receipt bounds the --before file's size and nesting", async () => {
  const root = await repository({ engines: { node: "18" } });

  const oversized = join(root, "oversized.json");
  await writeFile(oversized, `"${"a".repeat(1024 * 1024)}"`);
  const tooLarge = await runFailing(["receipt", root, "--before", oversized]);
  assert.equal(tooLarge.code, 2);
  assert.match(tooLarge.stderr, /above the 1048576-byte limit/);

  const deep = join(root, "deep.json");
  await writeFile(deep, `${"[".repeat(100)}${"]".repeat(100)}`);
  const tooDeep = await runFailing(["receipt", root, "--before", deep]);
  assert.equal(tooDeep.code, 2);
  assert.match(tooDeep.stderr, /above the 64-level limit/);
});

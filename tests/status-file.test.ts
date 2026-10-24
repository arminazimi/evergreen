import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import type { Finding, ScanResult } from "../src/domain.js";
import { renderStatusFile, STATUS_FILE_NAME } from "../src/status-file.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-status-"));
  roots.push(root);
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".github", "workflows", "ci.yml"), "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n");
  return root;
}

const sample: Finding = {
  id: "a:1",
  ruleId: "rule.example",
  detector: "example",
  title: "Title",
  summary: "Summary",
  severity: "high",
  confidence: "exact",
  location: { path: "src/a.ts", line: 3 },
  replacement: "Use fetch",
  sources: [{ title: "Source", url: "https://example.com" }],
};

const scan = (overrides: Partial<ScanResult> = {}): ScanResult => ({
  schemaVersion: "evergreen.scan.v1",
  root: "/machine/specific/root",
  scannedAt: "2026-10-16T00:00:00.000Z",
  findings: [sample],
  diagnostics: [],
  ...overrides,
});

test("the status file lists counts, the baseline, the data version, and the findings", () => {
  const text = renderStatusFile(
    scan({
      data: { source: "cache", version: "2026.10.01", createdAt: "2026-10-01T00:00:00Z", reviewedThrough: "2026-09-30", ageDays: 9, stale: false },
      suppressions: { suppressed: 4, expiring: [], expired: [] },
    }),
  );
  assert.match(text, /^# Evergreen lifecycle status\n/);
  assert.match(text, /- Findings: 1 \(critical 0, high 1, medium 0, low 0, info 0\)/);
  assert.match(text, /- Accepted by baseline: 4\n/);
  assert.match(text, /- Lifecycle data: 2026\.10\.01, evidence reviewed through 2026-09-30\n/);
  assert.match(text, /a:1 src\/a\.ts:3 high Use fetch/);
  assert.match(renderStatusFile(scan()), /- Accepted by baseline: none \(no baseline was used\)/);
});

test("the status file does not depend on the machine, the time, or how old the data is", () => {
  const data = { source: "bundled" as const, version: "2026.10.01", createdAt: null, reviewedThrough: "2026-09-30", ageDays: 1, stale: false };
  const first = renderStatusFile(scan({ data }));
  const later = renderStatusFile(scan({ root: "/elsewhere", scannedAt: "2027-01-01T00:00:00.000Z", data: { ...data, source: "cache", ageDays: 90, stale: true } }));
  assert.equal(later, first);
  assert.doesNotMatch(first, /machine|2026-10-16|ageDays|stale/i);
});

test("a long scan stays short", () => {
  const findings = Array.from({ length: 400 }, (_, index) => ({ ...sample, id: `id-${index}`, location: { path: `src/${index}.ts`, line: 1 } }));
  const text = renderStatusFile(scan({ findings }));
  assert.ok(text.split("\n").length < 50);
  assert.match(text, /375 more findings omitted/);
});

test("scan --write-status writes the file next to the scan, and a second run changes nothing", async () => {
  const root = await repository();
  const first = await execute(process.execPath, [cli, "scan", root, "--write-status", "--json"]);
  assert.equal((JSON.parse(first.stdout) as { schemaVersion: string }).schemaVersion, "evergreen.scan.v1", "stdout is still the scan result");
  assert.match(first.stderr, /Wrote EVERGREEN_STATUS\.md/);
  const written = await readFile(join(root, STATUS_FILE_NAME), "utf8");
  assert.match(written, /- Findings: 1 /);
  assert.match(written, /\.github\/workflows\/ci\.yml:4 \w+ /);
  assert.doesNotMatch(written, new RegExp(root.replaceAll("\\", "\\\\")));

  await execute(process.execPath, [cli, "scan", root, "--write-status"]);
  assert.equal(await readFile(join(root, STATUS_FILE_NAME), "utf8"), written);
});

test("the status file records the findings a baseline accepted", async () => {
  const root = await repository();
  const baseline = join(root, "baseline.json");
  await execute(process.execPath, [cli, "baseline", root, "--output", baseline]);
  await execute(process.execPath, [cli, "scan", root, "--baseline", baseline, "--write-status"]);
  const written = await readFile(join(root, STATUS_FILE_NAME), "utf8");
  assert.match(written, /- Findings: 0 /);
  assert.match(written, /- Accepted by baseline: 1\n/);
});

test("nothing is written without the flag, and only scan accepts it", async () => {
  const root = await repository();
  await execute(process.execPath, [cli, "scan", root]);
  assert.ok(!(await readdir(root)).includes(STATUS_FILE_NAME));
  await assert.rejects(execute(process.execPath, [cli, "doctor", root, "--write-status"]), (error: { code: number; stderr: string }) => {
    assert.equal(error.code, 2);
    assert.match(error.stderr, /only available for the scan command/);
    return true;
  });
  assert.ok(!(await readdir(root)).includes(STATUS_FILE_NAME));
});

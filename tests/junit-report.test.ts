import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import type { Finding, ScanResult } from "../src/domain.js";
import { renderJunit } from "../src/reporters.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const hostile = '<script>alert("x")</script> & \'quote\' \u0000\u001b';

const finding = (overrides: Partial<Finding> = {}): Finding => ({
  id: "a:1",
  ruleId: "rule.example",
  detector: "example",
  title: "Title",
  summary: "Summary",
  severity: "high",
  confidence: "exact",
  location: { path: "src/a.ts", line: 3 },
  replacement: "Use fetch",
  sources: [{ title: "Source", url: "https://example.com/source" }],
  ...overrides,
});

const scan = (findings: Finding[], diagnostics: string[] = []): ScanResult => ({
  schemaVersion: "evergreen.scan.v1",
  root: "/repository",
  scannedAt: "2026-10-25T00:00:00.000Z",
  findings,
  diagnostics,
});

test("maps each finding to a failed test case with location and evidence, in deterministic order", () => {
  const result = scan([
    finding({ id: "b:1", title: "Later", location: { path: "z.ts", line: 2 } }),
    finding({ id: "a:1", title: "Earlier", location: { path: "a.ts" } }),
  ]);
  const xml = renderJunit(result);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<testsuites name="Evergreen" tests="2" failures="2" errors="0">'));
  assert.equal((xml.match(/<testcase /g) ?? []).length, 2);
  assert.equal((xml.match(/<failure /g) ?? []).length, 2);
  assert.ok(xml.indexOf("Earlier") < xml.indexOf("Later"));
  assert.ok(xml.includes('classname="rule.example"'));
  assert.ok(xml.includes('file="z.ts" line="2"'));
  assert.ok(xml.includes('file="a.ts">'));
  assert.ok(xml.includes("Location: z.ts:2"));
  assert.ok(xml.includes("Replacement: Use fetch"));
  assert.ok(xml.includes("Evidence: Source (https://example.com/source)"));
  assert.equal(renderJunit(result), xml);
});

test("escapes untrusted text and drops characters XML cannot represent", () => {
  const xml = renderJunit(scan([
    finding({ title: hostile, summary: hostile, replacement: hostile, location: { path: hostile, line: 1 }, sources: [{ title: hostile, url: "https://example.com/?a=1&b=2" }] }),
  ], [hostile]));
  assert.ok(!xml.includes("<script>"));
  assert.ok(xml.includes("&lt;script&gt;"));
  assert.ok(xml.includes("&quot;x&quot;"));
  assert.ok(xml.includes("a=1&amp;b=2"));
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml));
});

test("a scan with no findings is a passing suite with no test cases", () => {
  const xml = renderJunit(scan([]));
  assert.ok(xml.includes('tests="0" failures="0"'));
  assert.ok(!xml.includes("<testcase"));
});

test("scan --format junit writes the report and other commands reject the format", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-junit-"));
  try {
    await mkdir(join(root, ".github", "workflows"), { recursive: true });
    await writeFile(join(root, ".github", "workflows", "ci.yml"), "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v3\n");
    const { stdout } = await execute(process.execPath, [cli, "scan", root, "--format", "junit"]);
    assert.ok(stdout.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(stdout.includes("<testsuites "));
    await assert.rejects(
      execute(process.execPath, [cli, "check", "pkg:npm/request", "--format", "junit"]),
      (error: { code: number }) => error.code === 2,
    );
    await assert.rejects(
      execute(process.execPath, [cli, "explain", "x", root, "--format", "junit"]),
      (error: { code: number; stderr: string }) => error.code === 2 && /--format junit is only available for the scan command/.test(error.stderr),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

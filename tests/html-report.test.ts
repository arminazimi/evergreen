import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import type { Finding, ScanResult } from "../src/domain.js";
import { renderHtml, renderJson } from "../src/reporters.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");

const hostile = `<script>alert("x")</script> & 'q' </script>`;

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
  root: "/machine/specific/root",
  scannedAt: "2026-10-16T00:00:00.000Z",
  findings,
  diagnostics,
});

function embedded(html: string): unknown {
  const match = /<script type="application\/json" id="evergreen-report">([^]*?)<\/script>/.exec(html);
  assert.ok(match, "the JSON report is embedded");
  return JSON.parse(match[1]!);
}

test("the page lists each finding and the embedded data equals the JSON report", () => {
  const result = scan([finding(), finding({ id: "b:1", severity: "low", location: { path: "package.json" } })]);
  const html = renderHtml(result);
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("<strong>2 findings</strong>"));
  assert.ok(html.includes("src/a.ts:3") && html.includes("Use fetch") && html.includes("https://example.com/source"));
  assert.deepEqual(embedded(html), JSON.parse(renderJson(result)));
});

test("every value is escaped and cannot break out of the page or the data block", () => {
  const result = scan(
    [finding({ id: hostile, title: hostile, summary: hostile, replacement: hostile, location: { path: hostile, line: 1 }, sources: [{ title: hostile, url: `javascript:${hostile}` }] })],
    [hostile],
  );
  const html = renderHtml(result);
  assert.ok(!html.includes("<script>alert"), "no raw script from a value reaches the page");
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;"), "values are entity-escaped");
  assert.equal(html.match(/<\/script>/g)?.length, 1, "no value can close the data block early");
  assert.equal(html.match(/<script/g)?.length, 1, "the only script element is the inert data block");
  assert.ok(!html.includes('href="javascript:'), "non-http source URLs are not links");
  assert.deepEqual(embedded(html), JSON.parse(renderJson(result)));
});

test("the page makes no external requests", () => {
  const html = renderHtml(scan([finding()]));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(!/<(?:link|img|iframe|object|embed|source|video|audio)\b/i.test(html));
  assert.ok(!/src\s*=/i.test(html) && !/@import|url\(/i.test(html));
});

test("the same scan renders the same bytes", () => {
  const result = scan([finding(), finding({ id: "b:1" })]);
  assert.equal(renderHtml(result), renderHtml(result));
});

test("scan --format html writes the report, and other commands reject it", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-html-"));
  try {
    await mkdir(join(root, ".github", "workflows"), { recursive: true });
    await writeFile(join(root, ".github", "workflows", "ci.yml"), "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v3\n");
    const { stdout: html } = await execute(process.execPath, [cli, "scan", root, "--format", "html"]);
    const { stdout: json } = await execute(process.execPath, [cli, "scan", root, "--format", "json"]);
    const report = embedded(html) as ScanResult;
    assert.equal(report.findings[0]?.ruleId, "github-actions.checkout.node20");
    assert.deepEqual(report.findings, (JSON.parse(json) as ScanResult).findings);
    await assert.rejects(execute(process.execPath, [cli, "check", "pkg:npm/request", "--format", "html"]), (error: { code: number }) => error.code === 2);
    await assert.rejects(execute(process.execPath, [cli, "explain", "x", root, "--format", "html"]), (error: { code: number; stderr: string }) => error.code === 2 && /--format html is only available for the scan command/.test(error.stderr));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

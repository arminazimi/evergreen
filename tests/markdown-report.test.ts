import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import type { Finding, ScanResult } from "../src/domain.js";
import { renderMarkdown } from "../src/reporters.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const hostile = '<script>alert("x")</script> | \\ [label](javascript:alert(1)) &';

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

test("renders a stable Markdown table with evidence links and deterministic finding order", () => {
  const result = scan([
    finding({ id: "b:1", location: { path: "z.ts", line: 2 } }),
    finding({ id: "a:1", title: "Earlier", location: { path: "a.ts", line: 1 }, sources: [
      { title: "Official docs", url: "https://example.com/docs" },
      { title: "Unsafe", url: "javascript:alert(1)" },
    ] }),
  ]);
  const markdown = renderMarkdown(result);
  assert.ok(markdown.startsWith("# Evergreen scan report"));
  assert.ok(markdown.includes("| Severity | Finding | Location | Summary | Replacement | Evidence |"));
  assert.ok(markdown.indexOf("Earlier") < markdown.indexOf("Title"));
  assert.ok(markdown.includes("[Official docs](https://example.com/docs)"));
  assert.ok(markdown.includes("Unsafe (javascript:alert"));
  assert.equal(renderMarkdown(result), markdown);
});

test("escapes untrusted table values and keeps each finding on one table row", () => {
  const markdown = renderMarkdown(scan([
    finding({
      id: hostile,
      title: hostile,
      summary: hostile,
      replacement: hostile,
      location: { path: hostile + "\nnext.ts", line: 1 },
      sources: [{ title: hostile, url: "https://example.com/a(b)" }],
    }),
  ], [hostile]));
  assert.ok(!markdown.includes("<script>"));
  assert.ok(markdown.includes("&#124;"));
  assert.ok(markdown.includes("&#92;"));
  assert.ok(!markdown.includes("&\\#124;"));
  assert.ok(!markdown.includes("&\\#92;"));
  assert.ok(markdown.includes("&lt;script&gt;"));
  assert.ok(markdown.includes("<br>next"));
  assert.ok(markdown.includes("https://example.com/a%28b%29"));
  assert.ok(markdown.includes("## Notes"));
  assert.equal(markdown.split("\n").filter((line) => line.startsWith("| high |")).length, 1);
});

test("renders an explicit empty state when a scan has no findings", () => {
  const markdown = renderMarkdown(scan([]));
  assert.ok(markdown.includes("| — | No findings | — | No lifecycle risks found. | — | — |"));
});

test("scan --format markdown writes the report and other commands reject the format", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-markdown-"));
  try {
    await mkdir(join(root, ".github", "workflows"), { recursive: true });
    await writeFile(join(root, ".github", "workflows", "ci.yml"), "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v3\n");
    const { stdout } = await execute(process.execPath, [cli, "scan", root, "--format", "markdown"]);
    assert.ok(stdout.startsWith("# Evergreen scan report"));
    assert.ok(stdout.includes("| Severity | Finding | Location | Summary | Replacement | Evidence |"));
    await assert.rejects(
      execute(process.execPath, [cli, "check", "pkg:npm/request", "--format", "markdown"]),
      (error: { code: number }) => error.code === 2,
    );
    await assert.rejects(
      execute(process.execPath, [cli, "explain", "x", root, "--format", "markdown"]),
      (error: { code: number; stderr: string }) => error.code === 2 && /--format markdown is only available for the scan command/.test(error.stderr),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

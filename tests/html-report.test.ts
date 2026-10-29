import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import type { Finding, ScanResult, Severity } from "../src/domain.js";
import type { Forecast, ForecastEvent } from "../src/forecast.js";
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

const forecastEvent = (date: string, title: string, severity: Severity, findings = 0): ForecastEvent => ({
  date,
  ruleId: "rule.example",
  ecosystem: "example",
  title,
  severity,
  source: "https://example.com/source",
  findings: Array.from({ length: findings }, (_, index) => ({ id: `a:${index}`, path: "src/a.ts", line: 3 })),
});

const forecastOf = (events: ForecastEvent[]): Forecast => {
  const groups = new Map<string, ForecastEvent[]>();
  for (const event of events) groups.set(event.date.slice(0, 7), [...(groups.get(event.date.slice(0, 7)) ?? []), event]);
  return {
    schemaVersion: "evergreen.forecast.v1",
    root: "/machine/specific/root",
    today: "2026-10-16",
    until: "2027-10-16",
    months: 12,
    groups: [...groups].map(([month, items]) => ({ month, events: items })),
    affecting: events.filter((event) => event.findings.length > 0).length,
    total: events.length,
  };
};

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

test("the summary row counts every severity, most severe first", () => {
  const result = scan([
    finding({ id: "critical-1", severity: "critical" }),
    finding({ id: "high-1" }),
    finding({ id: "high-2" }),
    finding({ id: "low-1", severity: "low" }),
  ]);
  const html = renderHtml(result);
  const summary = /<section class="summary">([\s\S]*?)<\/section>/.exec(html)?.[1];
  assert.ok(summary, "the summary section is rendered");
  for (const [severity, count] of [["critical", 1], ["high", 2], ["medium", 0], ["low", 1], ["info", 0]] as const) {
    assert.ok(summary.includes(`<td class="${severity}">${count}</td>`), `${severity} counts ${count}`);
  }
  const headings = ["Critical", "High", "Medium", "Low", "Info"].map((label) => summary.indexOf(`>${label}</th>`));
  assert.deepEqual(headings, [...headings].sort((left, right) => left - right), "severity columns run most severe first");
});

test("findings are grouped by severity and then by path without reordering the embedded JSON", () => {
  const result = scan([
    finding({ id: "low-b", severity: "low", location: { path: "src/b.ts", line: 1 } }),
    finding({ id: "high-z", location: { path: "src/z.ts", line: 1 } }),
    finding({ id: "high-a", location: { path: "src/a.ts", line: 9 } }),
    finding({ id: "critical-a", severity: "critical", location: { path: "src/a.ts", line: 2 } }),
  ]);
  const html = renderHtml(result);
  const order = ["critical-a", "high-a", "high-z", "low-b"].map((id) => html.indexOf(`id="${id}"`));
  assert.ok(order.every((position) => position >= 0), "every finding is listed");
  assert.deepEqual(order, [...order].sort((left, right) => left - right), "severity groups come first, then paths in order");
  const high = html.slice(html.indexOf('<section class="severity high">'));
  assert.ok(high.includes("<h2><span class=\"badge\">High</span>2 findings</h2>"), "each severity group is headed by its count");
  assert.ok(high.indexOf("<h3><code>src/a.ts</code></h3>") < high.indexOf('id="high-a"'), "the path heading opens its group");
  assert.ok(high.indexOf('id="high-a"') < high.indexOf("<h3><code>src/z.ts</code></h3>"), "paths are sorted");
  assert.deepEqual(embedded(html), JSON.parse(renderJson(result)), "the page still reads back to the same JSON report");
});

test("only HTTPS evidence sources become links", () => {
  const result = scan([
    finding({
      sources: [
        { title: "Safe", url: "https://example.com/source" },
        { title: "Plain", url: "http://example.com/source" },
        { title: "Script", url: "javascript:alert(1)" },
        { title: "Broken", url: "not a url" },
      ],
    }),
  ]);
  const html = renderHtml(result);
  assert.ok(html.includes('href="https://example.com/source" rel="noopener noreferrer"'));
  assert.ok(!html.includes('href="http://'), "http sources are not linked");
  assert.ok(!html.includes('href="javascript:'), "javascript sources are not linked");
  assert.ok(!html.includes('href="not'), "malformed sources are not linked");
  assert.ok(html.includes("<code>http://example.com/source</code>") && html.includes("<code>javascript:alert(1)</code>"));
});

test("the page carries dark-mode and print styles without adding scripts", () => {
  const html = renderHtml(scan([finding()]));
  assert.ok(html.includes("@media (prefers-color-scheme:dark)"));
  assert.ok(html.includes("@media print"));
  assert.ok(html.includes("break-inside:avoid"));
  assert.equal(html.match(/<script/g)?.length, 1, "the only script element is the inert data block");
});

test("the same scan renders the same bytes", () => {
  const result = scan([finding(), finding({ id: "b:1" })]);
  assert.equal(renderHtml(result), renderHtml(result));
});

test("a forecast adds the Next 12 months section above the findings, with a text list below the chart", () => {
  const result = scan([finding()]);
  const forecast = forecastOf([
    forecastEvent("2027-01-15", "Node.js 18 end of life", "high", 1),
    forecastEvent("2027-06-01", "Python 3.8 end of life", "medium"),
  ]);
  const html = renderHtml(result, { forecast });
  assert.ok(html.includes("<h2>Next 12 months</h2>"));
  assert.match(html, /<svg [^>]*class="evergreen-forecast"/);
  assert.ok(html.indexOf('<section class="forecast">') < html.indexOf("<article"), "the section is above the findings");
  assert.ok(html.includes("Node.js 18 end of life") && html.includes("Python 3.8 end of life"));
  assert.ok(html.includes("affects 1 finding") && html.includes("does not affect this repository"));
  assert.ok(html.includes("<ul>") && html.includes("<code>2027-01-15</code>"));
  assert.ok(html.includes('<li class="high"><code>2027-01-15</code> <span class="badge">High</span>'), "severity classes reuse the existing badge tokens");
  assert.ok(html.includes("@media print{section.forecast{break-inside:avoid}}"), "the section stays whole when printed");
});

test("an empty forecast still renders the section and says so in text", () => {
  const html = renderHtml(scan([finding()]), { forecast: forecastOf([]) });
  assert.ok(html.includes("<h2>Next 12 months</h2>"));
  assert.ok(html.includes("Nothing in this window reaches a dated end of life."));
});

test("without a forecast the page is byte-identical and has no forecast section", () => {
  const result = scan([finding()]);
  assert.equal(renderHtml(result, {}), renderHtml(result));
  assert.equal(renderHtml(result, { forecast: undefined }), renderHtml(result));
  assert.ok(!renderHtml(result).includes("Next 12 months"));
});

test("the forecast does not change the embedded JSON report", () => {
  const result = scan([finding()]);
  const html = renderHtml(result, { forecast: forecastOf([forecastEvent("2027-01-15", "Node.js 18 end of life", "high", 1)]) });
  assert.deepEqual(embedded(html), JSON.parse(renderJson(result)));
});

test("forecast text is escaped like every other value", () => {
  const html = renderHtml(scan([finding()]), { forecast: forecastOf([forecastEvent("2027-01-15", hostile, "high", 1)]) });
  assert.ok(!html.includes("<script>alert"), "no raw script from a forecast value reaches the page");
  assert.equal(html.match(/<\/script>/g)?.length, 1, "no forecast value can close the data block early");
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;"));
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
    assert.ok(html.includes("<h2>Next 12 months</h2>"), "scan --format html carries the forecast section");
    assert.match(html, /<svg [^>]*class="evergreen-forecast"/);
    assert.ok(!json.includes("Next 12 months"), "the JSON report is unchanged");
    await assert.rejects(execute(process.execPath, [cli, "check", "pkg:npm/request", "--format", "html"]), (error: { code: number }) => error.code === 2);
    await assert.rejects(execute(process.execPath, [cli, "explain", "x", root, "--format", "html"]), (error: { code: number; stderr: string }) => error.code === 2 && /--format html is only available for the scan command/.test(error.stderr));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

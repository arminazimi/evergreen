import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import type { DependencyCheck } from "../src/check-dependency.js";
import type { Finding, ScanResult, Severity } from "../src/domain.js";
import type { MigrationPacket } from "../src/migration-packet.js";
import {
  renderCheckText,
  renderFindingText,
  renderFirstRunSummary,
  renderHtml,
  renderMarkdown,
  renderMigrationPacketText,
  renderSlack,
  renderTeams,
  renderText,
  renderJunit,
} from "../src/reporters.js";
import { describeData, escapeMarkdown, findingOrder } from "../src/reporters/shared.js";

// Golden-output tests: exact bytes for every human-facing reporter, so a change to user-visible output is a
// deliberate edit of a fixture. Regenerate with `UPDATE_GOLDEN=1 npm test` and review the diff.
const goldenDirectory = join(process.cwd(), "tests", "fixtures", "reporters-golden");
const source = { title: "Vendor notice", url: "https://example.com/notice?a=1&b=(2)" };

const data = {
  source: "bundled" as const,
  version: "2026.11.01",
  createdAt: null,
  reviewedThrough: "2026-10-31",
  ageDays: 1,
  stale: true,
};

const full: Finding = {
  id: "npm:request:1",
  ruleId: "npm.request",
  detector: "npm",
  title: "request <deprecated>",
  summary: "Pipe | char & \\ back*slash_",
  severity: "high",
  confidence: "exact",
  location: { path: "package.json", line: 12 },
  dependencyPath: ["app", "lib", "request"],
  replacement: "Use fetch",
  deadline: "2026-12-31",
  sources: [source, { title: "Local", url: "javascript:alert(1)" }, { title: "Broken", url: "not a url" }],
  advisoryIds: ["GHSA-aaaa", "GHSA-bbbb"],
  usages: [
    {
      kind: "import",
      language: "typescript",
      symbol: "request",
      location: { path: "src/a.ts", line: 3 },
      excerpt: 'import request from "request"',
    },
    {
      kind: "call",
      language: "typescript",
      symbol: "request.get",
      location: { path: "src/b.ts" },
      excerpt: "request.get(url)",
    },
  ],
  impact: { usageCount: 2, affectedFiles: 2, level: "medium" },
};

const lean = (id: string, severity: Severity, path: string, line?: number): Finding => ({
  id,
  ruleId: `rule.${id}`,
  detector: "example",
  title: `Title ${id}`,
  summary: `Summary ${id}`,
  severity,
  confidence: "range",
  location: line === undefined ? { path } : { path, line },
  sources: [],
});

const rich: ScanResult = {
  schemaVersion: "evergreen.scan.v1",
  root: "/repository",
  scannedAt: "2026-11-01T00:00:00.000Z",
  findings: [
    lean("b", "low", "src/z.ts", 4),
    full,
    lean("c", "critical", "Dockerfile"),
    lean("d", "info", "src/z.ts", 2),
  ],
  unclassified: { count: 2, references: [] },
  diagnostics: ["first note", "second <note>"],
  selection: { only: ["npm", "python"], exclude: ["docker"] },
  data,
  suppressions: {
    suppressed: 1,
    warnWithinDays: 14,
    expiring: [{ ruleId: "r", path: "p", expires: "2026-11-10" }],
    expired: [],
  },
};

const single: ScanResult = {
  schemaVersion: "evergreen.scan.v1",
  root: "/repository",
  scannedAt: "2026-11-01T00:00:00.000Z",
  findings: [lean("only", "medium", "a.ts", 1)],
  unclassified: { count: 1, references: [] },
  diagnostics: [],
  data: { ...data, ageDays: 0, stale: false },
  suppressions: { suppressed: 0, expiring: [], expired: [{ ruleId: "r", path: "p", expires: "2026-10-01" }] },
};

const empty: ScanResult = {
  schemaVersion: "evergreen.scan.v1",
  root: "/repository",
  scannedAt: "2026-11-01T00:00:00.000Z",
  findings: [],
  diagnostics: [],
};

const many: ScanResult = {
  ...empty,
  findings: Array.from({ length: 23 }, (_, index) =>
    lean(String(index).padStart(2, "0"), "high", `src/f${index}.ts`, index + 1),
  ),
};
const oneOver: ScanResult = { ...empty, findings: many.findings.slice(0, 21) };

const long: ScanResult = {
  ...empty,
  findings: [{ ...lean("long", "high", "a.ts"), summary: "<&>".repeat(1500), replacement: "x" }],
};

const check: DependencyCheck = {
  schemaVersion: "evergreen.check.v1",
  purl: "pkg:npm/request",
  version: "2.88.2",
  status: "affected",
  severity: "high",
  message: "request is deprecated.",
  data,
  findings: [
    {
      ruleId: "npm.request",
      ecosystem: "npm",
      event: "deprecated",
      severity: "high",
      title: "request",
      summary: "Deprecated.",
      replacement: "fetch",
      deadline: "2026-12-31",
      affectedVersions: "vers:npm/*",
      sources: [source],
    },
    {
      ruleId: "npm.request2",
      ecosystem: "npm",
      event: "deprecated",
      severity: "low",
      title: "request two",
      summary: "Again.",
      affectedVersions: "vers:npm/<3",
      sources: [],
    },
  ],
};

const packet: MigrationPacket = {
  schemaVersion: "evergreen.context.v1",
  generatedAt: "2026-11-01T00:00:00.000Z",
  repositoryRoot: "/repository",
  finding: full,
  affectedFiles: ["package.json", "src/a.ts"],
  usages: [],
  constraints: ["Keep Node 22"],
  steps: [
    { id: "s1", title: "Swap", instructions: "Use fetch.", targets: "all", paths: ["src/a.ts"] },
    { id: "s2", title: "Clean", instructions: "Remove dep.", targets: "declaration", paths: [] },
  ],
  sources: [source],
  verification: [{ command: "npm test", purpose: "Run the tests" }],
  upgradePath: {
    from: { ruleId: "a", versions: "vers:npm/<4", title: "Four", status: "ended", endsOn: "2025-01-01" },
    skipped: [
      { ruleId: "b", versions: "vers:npm/5", title: "Five", status: "ended" },
      { ruleId: "c", versions: "vers:npm/6", title: "Six", status: "ending-soon", endsOn: "2027-01-01" },
    ],
    target: { versions: "vers:npm/7", title: "Seven", endsOn: "2028-01-01" },
  },
};

const cases: Record<string, () => string> = {
  "text-rich.txt": () => renderText(rich),
  "text-first-run.txt": () => renderText(single, { firstRun: true }),
  "text-first-run-many.txt": () => renderText(many, { firstRun: true }),
  "text-first-run-empty.txt": () => renderText(empty, { firstRun: true }),
  "text-empty.txt": () => renderText(empty),
  "text-empty-truncated.txt": () =>
    renderText(empty, {
      coverage: {
        ecosystems: [],
        filesRead: Array.from({ length: 11 }, (_, i) => `f${i}`),
        unsupportedFiles: Array.from({ length: 10 }, (_, i) => `u${i}`),
        truncated: true,
      },
    }),
  "text-single.txt": () => renderText(single),
  "check.txt": () => renderCheckText(check),
  "check-bare.txt": () =>
    renderCheckText({
      schemaVersion: "evergreen.check.v1",
      purl: "pkg:npm/x",
      status: "no-data",
      findings: [],
      message: "None.",
    }),
  "finding.txt": () => renderFindingText(full),
  "finding-bare.txt": () => renderFindingText(lean("b", "low", "a.ts")),
  "packet.txt": () => renderMigrationPacketText(packet),
  "packet-bare.txt": () => {
    const { upgradePath: _unused, ...rest } = packet;
    return renderMigrationPacketText({
      ...rest,
      upgradePath: { ...packet.upgradePath!, skipped: [], target: { replacement: "Use X" } },
    });
  },
  "packet-none.txt": () => {
    const { upgradePath: _unused, ...rest } = packet;
    return renderMigrationPacketText(rest);
  },
  "markdown-rich.md": () => renderMarkdown(rich),
  "markdown-empty.md": () => renderMarkdown(empty),
  "html-rich.html": () => renderHtml(rich),
  "html-empty.html": () => renderHtml(empty),
  "html-single.html": () => renderHtml(single),
  "junit-rich.xml": () => renderJunit(rich),
  "junit-empty.xml": () => renderJunit(empty),
  "slack-rich.json": () => renderSlack(rich),
  "slack-empty.json": () => renderSlack(empty),
  "slack-single.json": () => renderSlack(single),
  "slack-many.json": () => renderSlack(many),
  "slack-one-over.json": () => renderSlack(oneOver),
  "slack-long.json": () => renderSlack(long),
  "teams-rich.json": () => renderTeams(rich),
  "teams-empty.json": () => renderTeams(empty),
  "teams-many.json": () => renderTeams(many),
  "teams-one-over.json": () => renderTeams(oneOver),
};

for (const [name, render] of Object.entries(cases)) {
  test(`golden output ${name}`, async () => {
    const actual = render();
    const path = join(goldenDirectory, name);
    if (process.env.UPDATE_GOLDEN === "1" || !existsSync(path)) {
      await mkdir(goldenDirectory, { recursive: true });
      await writeFile(path, actual);
    }
    assert.equal(actual, await readFile(path, "utf8"));
  });
}

test("renderFirstRunSummary pluralizes and caps at three findings", () => {
  assert.deepEqual(renderFirstRunSummary(single).slice(0, 1), ["Found 1 lifecycle risk. The most urgent:"]);
  const lines = renderFirstRunSummary(many);
  assert.equal(lines[0], "Found 23 lifecycle risks. The most urgent:");
  assert.equal(lines.length, 7);
  assert.equal(lines[4], "  …and 20 more below.");
  assert.equal(renderFirstRunSummary({ ...empty, findings: many.findings.slice(0, 3) }).length, 6);
});

test("shared helpers order findings, describe data, and escape Markdown", () => {
  assert.equal(
    describeData({ ...data, ageDays: 0, stale: false }),
    "Data: bundled 2026.11.01, evidence reviewed through 2026-10-31 (today)",
  );
  assert.equal(
    describeData({ ...data, ageDays: 1 }),
    "Data: bundled 2026.11.01, evidence reviewed through 2026-10-31 (1 day ago), stale",
  );
  assert.equal(describeData({ ...data, ageDays: 2, stale: false }).endsWith("(2 days ago)"), true);
  assert.equal(escapeMarkdown("a|b\r\nc\rd&<>\\*"), "a&#124;b<br>c<br>d&amp;&lt;&gt;&#92;\\*");
  assert.equal(escapeMarkdown(7), "7");
  assert.equal(escapeMarkdown("a.b-c(d)[e]{f}#+!_`"), "a\\.b\\-c\\(d\\)\\[e\\]\\{f\\}\\#\\+\\!\\_\\`");
  const order = (a: Finding, b: Finding) => Math.sign(findingOrder(a, b));
  const base = lean("m", "low", "m.ts", 5);
  assert.equal(order(lean("m", "low", "a.ts", 9), base), -1);
  assert.equal(order(lean("m", "low", "z.ts", 1), base), 1);
  assert.equal(order(lean("m", "low", "m.ts", 4), base), -1);
  assert.equal(order(lean("m", "low", "m.ts"), base), -1);
  assert.equal(order({ ...base, ruleId: "a" }, base), -1);
  assert.equal(order({ ...base, id: "a" }, base), -1);
  assert.equal(order({ ...base, id: "z" }, base), 1);
  assert.equal(order(base, { ...base }), 0);
});

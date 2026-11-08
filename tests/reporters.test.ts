import assert from "node:assert/strict";
import { test } from "node:test";

import { COVERAGE_WALK_LIMIT, type ScanResult } from "../src/domain.js";
import { deriveScanCoverage, renderEmptyScanHelp, renderText } from "../src/reporters.js";

const emptyScan = (overrides: Partial<ScanResult> = {}): ScanResult => ({
  schemaVersion: "evergreen.scan.v1",
  root: "/repository",
  scannedAt: "2026-10-27T00:00:00.000Z",
  findings: [],
  diagnostics: [],
  data: {
    source: "bundled",
    version: "2026.10.01",
    createdAt: null,
    reviewedThrough: "2026-09-30",
    ageDays: 0,
    stale: false,
  },
  coverage: {
    ecosystems: ["github-actions", "npm"],
    filesRead: [".github/workflows/ci.yml", "package.json"],
    unsupportedFiles: ["Cargo.toml"],
  },
  ...overrides,
});

test("golden text output for an empty scan names coverage, data version, and next steps", () => {
  assert.equal(
    renderText(emptyScan()),
    [
      "Evergreen scan",
      "Repository: /repository",
      "Findings: 0",
      "Data: bundled 2026.10.01, evidence reviewed through 2026-09-30 (today)",
      "",
      "No lifecycle risks found.",
      "Ecosystems detected: github-actions, npm",
      "Files read: .github/workflows/ci.yml, package.json",
      "Data version: 2026.10.01",
      "Unsupported files: Cargo.toml",
      "",
      "Next: run `evergreen scan --demo` to see what a finding looks like.",
      "Next: after a scan reports findings, run `evergreen explain <finding-id>` for details.",
    ].join("\n"),
  );
});

test("golden text output truncates long path lists and keeps JSON coverage complete", () => {
  const filesRead = Array.from(
    { length: 12 },
    (_, index) => `packages/pkg-${String(index).padStart(2, "0")}/package.json`,
  );
  const unsupportedFiles = Array.from(
    { length: 11 },
    (_, index) => `vendor/lib-${String(index).padStart(2, "0")}/Cargo.toml`,
  );
  const result = emptyScan({
    coverage: {
      ecosystems: ["npm", "rust"],
      filesRead,
      unsupportedFiles,
    },
  });
  assert.equal(
    renderText(result),
    [
      "Evergreen scan",
      "Repository: /repository",
      "Findings: 0",
      "Data: bundled 2026.10.01, evidence reviewed through 2026-09-30 (today)",
      "",
      "No lifecycle risks found.",
      "Ecosystems detected: npm, rust",
      "Files read: packages/pkg-00/package.json, packages/pkg-01/package.json, packages/pkg-02/package.json, packages/pkg-03/package.json, packages/pkg-04/package.json, packages/pkg-05/package.json, packages/pkg-06/package.json, packages/pkg-07/package.json, packages/pkg-08/package.json, packages/pkg-09/package.json, ... and 2 more",
      "Data version: 2026.10.01",
      "Unsupported files: vendor/lib-00/Cargo.toml, vendor/lib-01/Cargo.toml, vendor/lib-02/Cargo.toml, vendor/lib-03/Cargo.toml, vendor/lib-04/Cargo.toml, vendor/lib-05/Cargo.toml, vendor/lib-06/Cargo.toml, vendor/lib-07/Cargo.toml, vendor/lib-08/Cargo.toml, vendor/lib-09/Cargo.toml, ... and 1 more",
      "",
      "Next: run `evergreen scan --demo` to see what a finding looks like.",
      "Next: after a scan reports findings, run `evergreen explain <finding-id>` for details.",
    ].join("\n"),
  );
  assert.equal(result.coverage?.filesRead.length, 12);
  assert.equal(result.coverage?.unsupportedFiles.length, 11);
});

test("truncated coverage tells the reader the walk stopped early", () => {
  const text = renderEmptyScanHelp(emptyScan(), {
    ecosystems: ["npm"],
    filesRead: ["package.json"],
    unsupportedFiles: [],
    truncated: true,
  }).join("\n");
  assert.match(text, new RegExp(`Coverage is partial: only the first ${COVERAGE_WALK_LIMIT} entries were checked\\.`));
});

test("an empty scan without coverage reports none and still suggests next steps", () => {
  const { coverage: _coverage, data: _data, ...bare } = emptyScan();
  const text = renderText(bare);
  assert.match(text, /Ecosystems detected: none/);
  assert.match(text, /Files read: none/);
  assert.match(text, /Data version: none/);
  assert.match(text, /Unsupported files: none/);
  assert.match(text, /evergreen scan --demo/);
  assert.match(text, /evergreen explain <finding-id>/);
});

test("deriveScanCoverage reads ecosystems and paths from unclassified references", () => {
  const { coverage: _coverage, ...rest } = emptyScan({
    unclassified: {
      count: 1,
      references: [
        {
          detector: "npm",
          component: "pkg",
          reference: "1.0.0",
          reason: "floating",
          location: { path: "package.json", line: 2 },
        },
      ],
    },
  });
  assert.deepEqual(deriveScanCoverage(rest), {
    ecosystems: ["npm"],
    filesRead: ["package.json"],
    unsupportedFiles: ["package.json"],
  });
});

test("renderEmptyScanHelp prefers an explicit coverage override", () => {
  const { coverage: _coverage, ...rest } = emptyScan();
  const lines = renderEmptyScanHelp(rest, {
    ecosystems: ["go"],
    filesRead: ["go.mod"],
    unsupportedFiles: [],
  });
  assert.match(lines.join("\n"), /Ecosystems detected: go/);
  assert.match(lines.join("\n"), /Files read: go\.mod/);
  assert.match(lines.join("\n"), /Unsupported files: none/);
});

test("a scan with findings does not print the empty-scan help", () => {
  const text = renderText({
    ...emptyScan(),
    findings: [
      {
        id: "a:1",
        ruleId: "rule.example",
        detector: "npm",
        title: "Title",
        summary: "Summary",
        severity: "high",
        confidence: "exact",
        location: { path: "package.json", line: 1 },
        sources: [{ title: "Source", url: "https://example.com" }],
      },
    ],
  });
  assert.doesNotMatch(text, /No lifecycle risks found/);
  assert.doesNotMatch(text, /evergreen scan --demo/);
});

test("the json reporter is offered to every command that emits a scan document", async () => {
  const { jsonReporter } = await import("../src/reporters/json.js");
  assert.deepEqual(jsonReporter.commands, ["scan", "check", "check-snippet", "receipt"]);
});

test("formatExpectedList joins ids with commas and a final 'or'", async () => {
  const { formatExpectedList } = await import("../src/reporters/registry.js");
  assert.equal(formatExpectedList([]), "");
  assert.equal(formatExpectedList(["a"]), "a");
  assert.equal(formatExpectedList(["a", "b"]), "a or b");
  assert.equal(formatExpectedList(["a", "b", "c"]), "a, b, or c");
});

test("the markdown reporter serves scan and receipt", async () => {
  const { markdownReporter } = await import("../src/reporters/markdown.js");
  assert.deepEqual(markdownReporter.commands, ["scan", "receipt"]);
});

test("markdown links http and https sources and leaves other schemes as plain text", async () => {
  const { renderMarkdown } = await import("../src/reporters.js");
  const finding = (url: string) => ({
    id: "f",
    ruleId: "r",
    detector: "npm",
    title: "t",
    summary: "s",
    severity: "high",
    confidence: "exact",
    location: { path: "package.json" },
    sources: [{ title: "Src", url }],
  });
  const render = (url: string): string =>
    renderMarkdown(emptyScan({ findings: [finding(url)] as unknown as ScanResult["findings"] }));
  assert.match(render("http://example.com/a"), /\[Src\]\(http:\/\/example\.com\/a\)/);
  assert.match(render("https://example.com/a(b)"), /\[Src\]\(https:\/\/example\.com\/a%28b%29\)/);
  assert.doesNotMatch(render("ftp://example.com/a"), /\]\(ftp/);
});

test("deriveScanCoverage lists ecosystems and files in sorted order without duplicates", () => {
  const reference = (detector: string, path: string) => ({
    detector,
    component: "c",
    reference: "r",
    reason: "x",
    location: { path },
  });
  const scan = emptyScan();
  delete scan.coverage;
  const coverage = deriveScanCoverage(
    Object.assign(scan, {
      unclassified: {
        count: 3,
        references: [
          reference("npm", "z/package.json"),
          reference("cargo", "a/Cargo.toml"),
          reference("npm", "z/package.json"),
        ],
      },
    }),
  );
  assert.deepEqual(coverage.ecosystems, ["cargo", "npm"]);
  assert.deepEqual(coverage.filesRead, ["a/Cargo.toml", "z/package.json"]);
  assert.deepEqual(coverage.unsupportedFiles, ["a/Cargo.toml", "z/package.json"]);
});

test("text output names each selector independently and the text reporter passes firstRun through", async () => {
  const { renderText } = await import("../src/reporters.js");
  const { textReporter } = await import("../src/reporters/text.js");
  const onlyText = renderText(emptyScan({ selection: { only: ["npm", "pip"] } }));
  assert.match(onlyText, /^Only: npm, pip$/m);
  assert.doesNotMatch(onlyText, /Excluded/);
  const excludeText = renderText(emptyScan({ selection: { exclude: ["npm", "pip"] } }));
  assert.match(excludeText, /^Excluded: npm, pip$/m);
  assert.doesNotMatch(excludeText, /Only/);

  assert.deepEqual(textReporter.commands, ["scan", "check", "check-snippet"]);
  const finding = {
    id: "f",
    ruleId: "r",
    detector: "npm",
    title: "Old thing",
    summary: "s",
    severity: "high",
    confidence: "exact",
    location: { path: "package.json" },
    sources: [],
  } as unknown as ScanResult["findings"][number];
  const withFinding = emptyScan({ findings: [finding] });
  const first = textReporter.render(withFinding, { firstRun: true });
  assert.match(first, /^Found 1 lifecycle risk\. The most urgent:$/m);
  assert.match(first, /^ {2}HIGH Old thing \(package\.json\)$/m);
  assert.doesNotMatch(textReporter.render(withFinding, {}), /most urgent/);
});

test("migration packet text omits the support date when the target line has none", async () => {
  const { renderMigrationPacketText } = await import("../src/reporters.js");
  const packet = (endsOn?: string) =>
    ({
      finding: { id: "f", title: "T", severity: "high" },
      affectedFiles: [],
      constraints: [],
      steps: [],
      verification: [],
      sources: [],
      upgradePath: {
        from: { title: "Old", versions: "vers:npm/<2" },
        skipped: [],
        target: { title: "New", versions: "vers:npm/>=2", ...(endsOn ? { endsOn } : {}) },
      },
    }) as unknown as Parameters<typeof renderMigrationPacketText>[0];
  assert.match(renderMigrationPacketText(packet()), /^- Land on: New \(vers:npm\/>=2\)$/m);
  assert.match(
    renderMigrationPacketText(packet("2030-01-01")),
    /^- Land on: New \(vers:npm\/>=2, supported until 2030-01-01\)$/m,
  );
});

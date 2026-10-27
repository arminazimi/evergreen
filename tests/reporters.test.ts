import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScanResult } from "../src/domain.js";
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

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  TWO_MINUTE_BUDGET_MS,
  createCleanSmokeProject,
  detectRunnerName,
  formatFirstRunMarkdown,
  formatFirstRunSummary,
  measureFirstRun,
  type FirstRunBenchmarkResult,
} from "../benchmarks/first-run.js";

test("createCleanSmokeProject creates a temporary directory with the smoke fixture and cleans up", async () => {
  const clean = await createCleanSmokeProject();
  try {
    assert.ok(existsSync(clean.directory));
    assert.ok(existsSync(join(clean.directory, "package.json")));
    const content = JSON.parse(await readFile(join(clean.directory, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    assert.ok(content.dependencies?.request);
  } finally {
    await clean.cleanup();
  }
  assert.strictEqual(existsSync(clean.directory), false);
});

test("detectRunnerName returns a descriptive string", () => {
  const runner = detectRunnerName();
  assert.ok(typeof runner === "string" && runner.length > 0);
});

test("formatFirstRunSummary formats duration, budget, findings and status", () => {
  const mockResult: FirstRunBenchmarkResult = {
    schemaVersion: "evergreen.first-run-benchmark.v1",
    timestamp: "2026-10-28T00:00:00.000Z",
    platform: "linux",
    arch: "x64",
    nodeVersion: "v24.0.0",
    runner: "GitHub Actions (Linux)",
    command: ["npx", "--yes", "evergreen-deprecation@0.7.1", "scan", ".", "--json"],
    cleanDirectory: true,
    durationMs: 6540,
    budgetMs: 120_000,
    underBudget: true,
    findingsCount: 2,
    firstFindingRuleId: "npm.package.request.deprecated",
    firstFindingLocation: "package.json:5",
    exitCode: 0,
  };

  const summary = formatFirstRunSummary(mockResult);
  assert.match(summary, /Time to first useful finding: 6\.54s on linux/);
  assert.match(summary, /2 findings; budget: 120s - PASSED/);
  assert.match(summary, /first finding: npm\.package\.request\.deprecated/);
});

test("formatFirstRunMarkdown renders a markdown table with header and rows", () => {
  const results: FirstRunBenchmarkResult[] = [
    {
      schemaVersion: "evergreen.first-run-benchmark.v1",
      timestamp: "2026-10-28T00:00:00.000Z",
      platform: "linux",
      arch: "x64",
      nodeVersion: "v24.0.0",
      runner: "GitHub Actions (Linux)",
      command: ["npx", "--yes", "evergreen-deprecation@0.7.1", "scan", ".", "--json"],
      cleanDirectory: true,
      durationMs: 6200,
      budgetMs: 120_000,
      underBudget: true,
      findingsCount: 2,
      firstFindingRuleId: "npm.package.request.deprecated",
      firstFindingLocation: "package.json:5",
      exitCode: 0,
    },
    {
      schemaVersion: "evergreen.first-run-benchmark.v1",
      timestamp: "2026-10-28T00:00:00.000Z",
      platform: "darwin",
      arch: "arm64",
      nodeVersion: "v24.0.0",
      runner: "GitHub Actions (macOS)",
      command: ["npx", "--yes", "evergreen-deprecation@0.7.1", "scan", ".", "--json"],
      cleanDirectory: true,
      durationMs: 8400,
      budgetMs: 120_000,
      underBudget: true,
      findingsCount: 2,
      firstFindingRuleId: "npm.package.request.deprecated",
      firstFindingLocation: "package.json:5",
      exitCode: 0,
    },
  ];

  const markdown = formatFirstRunMarkdown(results);
  assert.match(markdown, /### Time to first useful finding/);
  assert.match(markdown, /\| Platform \| Runner \| First run duration \| Goal \| Findings \| First finding \| Result \|/);
  assert.match(markdown, /\| linux \| GitHub Actions \(Linux\) \| 6\.20 s \| < 120 s \| 2 \| `npm\.package\.request\.deprecated` \| Pass \|/);
  assert.match(markdown, /\| darwin \| GitHub Actions \(macOS\) \| 8\.40 s \| < 120 s \| 2 \| `npm\.package\.request\.deprecated` \| Pass \|/);
});

test("measureFirstRun executes local scan and verifies findings and duration within two-minute budget", async () => {
  const summaryFile = join(tmpdir(), `evergreen-summary-${Date.now()}.md`);
  try {
    const result = await measureFirstRun({
      budgetMs: TWO_MINUTE_BUDGET_MS,
      summaryPath: summaryFile,
    });

    assert.strictEqual(result.schemaVersion, "evergreen.first-run-benchmark.v1");
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.durationMs > 0);
    assert.ok(result.durationMs <= TWO_MINUTE_BUDGET_MS);
    assert.strictEqual(result.underBudget, true);
    assert.ok(result.findingsCount >= 1);
    assert.ok(result.firstFindingRuleId);
    assert.ok(existsSync(summaryFile));
    const summaryContent = await readFile(summaryFile, "utf8");
    assert.match(summaryContent, /### Time to first useful finding/);
  } finally {
    await rm(summaryFile, { force: true });
  }
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  collectCorpusMetrics,
  collectContributorMetrics,
  collectEcosystemMetrics,
  collectReportData,
  collectRuleMetrics,
  formatContributorName,
  generateMonthlyReport,
} from "../tools/monthly-report.js";
import type { MonthlyReportData } from "../tools/monthly-report.js";

test("collectRuleMetrics aggregates rules from registry JSON files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "evergreen-test-registry-"));
  try {
    const mockRegistry = {
      schemaVersion: "evergreen.registry.v2",
      ecosystem: "test-eco",
      rules: [
        {
          id: "test.rule.1",
          ecosystem: "test-eco",
          event: "deprecated",
          severity: "high",
          replacement: "pkg:npm/new-pkg@1.0.0",
          migration: { instructions: "Update pkg" },
          usage: [{ type: "call", pattern: "test()" }],
          provenance: { reviewedAt: "2026-10-15", observedAt: "2026-10-01", reviewer: "Alice" },
        },
        {
          id: "test.rule.2",
          ecosystem: "test-eco",
          event: "end-of-life",
          severity: "medium",
          provenance: { reviewedAt: "2026-09-10", observedAt: "2026-09-01", reviewer: "Bob" },
        },
      ],
    };
    await writeFile(join(tempDir, "test-eco.json"), JSON.stringify(mockRegistry));

    const metrics = await collectRuleMetrics(tempDir, "2026-10");
    assert.equal(metrics.total, 2);
    assert.equal(metrics.reviewedInMonth, 1);
    assert.equal(metrics.withReplacements, 1);
    assert.equal(metrics.withUsage, 1);
    assert.equal(metrics.withMigration, 1);
    assert.equal(metrics.byEcosystem["test-eco"], 2);
    assert.equal(metrics.byEvent["deprecated"], 1);
    assert.equal(metrics.byEvent["end-of-life"], 1);
    assert.equal(metrics.bySeverity["high"], 1);
    assert.equal(metrics.bySeverity["medium"], 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("collectRuleMetrics handles missing directories without throwing", async () => {
  const metrics = await collectRuleMetrics("non-existent-dir-12345");
  assert.equal(metrics.total, 0);
  assert.equal(metrics.reviewedInMonth, 0);
});

test("collectEcosystemMetrics returns ecosystems from capability manifest", () => {
  const metrics = collectEcosystemMetrics();
  assert.ok(metrics.total > 0);
  assert.equal(metrics.total, metrics.supported + metrics.experimental);
  assert.ok(metrics.ecosystems.length > 0);
  const sample = metrics.ecosystems[0]!;
  assert.ok(sample.id);
  assert.ok(sample.status);
  assert.ok(sample.maturity);
  assert.ok(Array.isArray(sample.detectorIds));
});

test("collectCorpusMetrics parses repository counts and expected findings", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "evergreen-test-corpus-"));
  const corpusFile = join(tempDir, "corpus.json");
  try {
    const mockCorpus = {
      schemaVersion: "evergreen.public-validation.v1",
      repositories: [
        {
          repository: "org/repo-a",
          ecosystem: "node",
          selection: "targeted",
          expected: [{ ruleId: "r1" }, { ruleId: "r2" }],
        },
        {
          repository: "org/repo-b",
          ecosystem: "python",
          selection: "blind",
          expected: [{ ruleId: "r3" }],
        },
      ],
    };
    await writeFile(corpusFile, JSON.stringify(mockCorpus));

    const metrics = await collectCorpusMetrics(corpusFile);
    assert.equal(metrics.totalRepositories, 2);
    assert.equal(metrics.totalExpectedFindings, 3);
    assert.equal(metrics.byEcosystem["node"]?.repositories, 1);
    assert.equal(metrics.byEcosystem["node"]?.expectedFindings, 2);
    assert.equal(metrics.byEcosystem["python"]?.repositories, 1);
    assert.equal(metrics.byEcosystem["python"]?.expectedFindings, 1);
    assert.equal(metrics.bySelection["targeted"], 1);
    assert.equal(metrics.bySelection["blind"], 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("collectCorpusMetrics handles missing or invalid corpus path gracefully", async () => {
  const metrics = await collectCorpusMetrics("invalid-corpus-path.json");
  assert.equal(metrics.totalRepositories, 0);
  assert.equal(metrics.totalExpectedFindings, 0);
});

test("formatContributorName extracts name and trims correctly", () => {
  assert.equal(formatContributorName("Alice Smith <alice@example.com>"), "Alice Smith");
  assert.equal(formatContributorName("  <bob@example.com>  "), "bob@example.com");
  assert.equal(formatContributorName("Charlie"), "Charlie");
});

test("collectContributorMetrics parses git log output including co-authors", () => {
  const mockGitRunner = (args: readonly string[]): string => {
    const cmd = args.join(" ");
    if (cmd.includes("rev-list --count HEAD")) {
      return "42\n";
    }
    if (cmd.includes("--use-mailmap") && !cmd.includes("--since")) {
      return "Alice Smith\nBob Jones\nAlice Smith\n";
    }
    if (cmd.includes("--format=%b") && !cmd.includes("--since")) {
      return "Commit message\n\nCo-authored-by: Carol White <carol@example.com>\n";
    }
    if (cmd.includes("--format=%h") && cmd.includes("--since")) {
      return "abc1234\ndef5678\n";
    }
    if (cmd.includes("--use-mailmap") && cmd.includes("--since")) {
      return "Alice Smith\n";
    }
    if (cmd.includes("--format=%b") && cmd.includes("--since")) {
      return "Commit message\n\nCo-authored-by: Carol White <carol@example.com>\n";
    }
    return "";
  };

  const metrics = collectContributorMetrics(mockGitRunner, "2026-10");
  assert.equal(metrics.totalCommits, 42);
  assert.equal(metrics.monthCommits, 2);
  assert.equal(metrics.totalContributors, 3);
  assert.deepEqual(metrics.contributors, ["Alice Smith", "Bob Jones", "Carol White"]);
  assert.equal(metrics.monthContributors, 2);
  assert.deepEqual(metrics.monthContributorsList, ["Alice Smith", "Carol White"]);
});

test("collectContributorMetrics handles git runner failures gracefully", () => {
  const failingGitRunner = () => {
    throw new Error("Git unavailable");
  };
  const metrics = collectContributorMetrics(failingGitRunner);
  assert.equal(metrics.totalCommits, 0);
  assert.equal(metrics.totalContributors, 0);
  assert.deepEqual(metrics.contributors, []);
});

test("generateMonthlyReport creates a complete markdown document with all sections", () => {
  const mockData: MonthlyReportData = {
    month: "2026-10",
    asOfDate: "2026-10-28",
    version: "0.7.1",
    rules: {
      total: 100,
      reviewedInMonth: 50,
      byEcosystem: { npm: 60, python: 40 },
      byEvent: { deprecated: 70, "end-of-life": 30 },
      bySeverity: { high: 80, medium: 20 },
      withReplacements: 90,
      withUsage: 50,
      withMigration: 95,
    },
    ecosystems: {
      total: 2,
      supported: 1,
      experimental: 1,
      byMaturity: { stable: 1, beta: 0, experimental: 1 },
      ecosystems: [
        { id: "npm", status: "supported", maturity: "stable", detectorIds: ["npm"] },
        { id: "python", status: "experimental", maturity: "experimental", detectorIds: ["python"] },
      ],
    },
    corpus: {
      totalRepositories: 50,
      totalExpectedFindings: 200,
      byEcosystem: {
        npm: { repositories: 30, expectedFindings: 120 },
        python: { repositories: 20, expectedFindings: 80 },
      },
      bySelection: { targeted: 25, blind: 25 },
    },
    contributors: {
      totalCommits: 150,
      monthCommits: 30,
      totalContributors: 2,
      monthContributors: 2,
      contributors: ["Alice Smith", "Bob Jones"],
      monthContributorsList: ["Alice Smith", "Bob Jones"],
    },
  };

  const report = generateMonthlyReport(mockData);

  assert.match(report, /^# Evergreen Monthly Progress Report: 2026-10$/m);
  assert.match(report, /^Generated on 2026-10-28 · Evergreen `0.7.1`$/m);
  assert.match(report, /^## Momentum highlights$/m);
  assert.match(report, /\| Lifecycle rules \| 100 rules \| 50 reviewed across 2 ecosystems \|/);
  assert.match(report, /\| Supported ecosystems \| 2 ecosystems \| 1 supported, 1 experimental \|/);
  assert.match(report, /\| Validation corpus \| 50 repositories \| 200 expected findings across 2 ecosystems \|/);
  assert.match(report, /\| Contributors \| 2 contributors \| 30 commits in 2026-10 \|/);
  assert.match(report, /^## Lifecycle rules$/m);
  assert.match(report, /\*\*Total rules:\*\* 100/);
  assert.match(report, /\*\*Rules with replacements:\*\* 90 \(90\.0%\)/);
  assert.match(report, /^## Ecosystem coverage$/m);
  assert.match(report, /\| npm \| supported \| stable \| `npm` \|/);
  assert.match(report, /^## Validation corpus$/m);
  assert.match(report, /\*\*Total repositories:\*\* 50/);
  assert.match(report, /^## Contributors$/m);
  assert.match(report, /- Alice Smith/);
  assert.match(report, /- Bob Jones/);
});

test("collectReportData gathers real repository data cleanly", async () => {
  const data = await collectReportData({ date: "2026-10-28" });
  assert.equal(data.month, "2026-10");
  assert.equal(data.asOfDate, "2026-10-28");
  assert.ok(data.rules.total > 400);
  assert.ok(data.ecosystems.total >= 20);
  assert.ok(data.corpus.totalRepositories > 300);
  assert.ok(data.contributors.totalCommits > 100);
  assert.ok(data.contributors.totalContributors > 0);
});

test("CLI execution runs and writes to stdout or file", async () => {
  const stdoutResult = spawnSync(
    process.execPath,
    [resolve("dist/tools/monthly-report.js"), "--date", "2026-10"],
    { encoding: "utf8" },
  );
  assert.equal(stdoutResult.status, 0, stdoutResult.stderr);
  assert.match(stdoutResult.stdout, /^# Evergreen Monthly Progress Report: 2026-10$/m);

  const tempDir = await mkdtemp(join(tmpdir(), "evergreen-test-report-cli-"));
  const outFile = join(tempDir, "report.md");
  try {
    const fileResult = spawnSync(
      process.execPath,
      [resolve("dist/tools/monthly-report.js"), "--date", "2026-10", "--out", outFile],
      { encoding: "utf8" },
    );
    assert.equal(fileResult.status, 0, fileResult.stderr);
    assert.match(fileResult.stdout, /Wrote monthly report to /);

    const writtenContent = await readFile(outFile, "utf8");
    assert.match(writtenContent, /^# Evergreen Monthly Progress Report: 2026-10$/m);
    assert.match(writtenContent, /^## Momentum highlights$/m);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

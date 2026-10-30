import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  FIRST_REVIEW_TARGET_WORKING_DAYS,
  collectAdoptionMetrics,
  collectCorpusMetrics,
  collectContributorMetrics,
  collectEcosystemMetrics,
  collectReportData,
  collectRuleMetrics,
  createGitRunner,
  formatContributorName,
  isInternalContributor,
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
  assert.deepEqual(metrics.byEcosystem, {});
});

test("collectEcosystemMetrics returns ecosystems from capability manifest", () => {
  const metrics = collectEcosystemMetrics();
  assert.ok(typeof metrics.total === "number" && metrics.total >= 0);
  assert.equal(metrics.total, metrics.supported + metrics.experimental);
  assert.ok(Array.isArray(metrics.ecosystems));
  if (metrics.ecosystems.length > 0) {
    const sample = metrics.ecosystems[0]!;
    assert.ok(sample.id);
    assert.ok(sample.status);
    assert.ok(sample.maturity);
    assert.ok(Array.isArray(sample.detectorIds));
  }
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
  assert.deepEqual(metrics.byEcosystem, {});
});

test("formatContributorName extracts name and trims correctly", () => {
  assert.equal(formatContributorName("Alice Smith <alice@example.com>"), "Alice Smith");
  assert.equal(formatContributorName("  <bob@example.com>  "), "bob@example.com");
  assert.equal(formatContributorName("Charlie"), "Charlie");
});

test("collectContributorMetrics counts authors and co-authors in a temporary git repository", async () => {
  const tempRepo = await mkdtemp(join(tmpdir(), "evergreen-test-git-repo-"));
  try {
    const git = (...args: string[]) => execFileSync(
      "git",
      ["-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args],
      { cwd: tempRepo, encoding: "utf8" },
    );
    git("init", "-q");
    git("-c", "user.name=Alice", "-c", "user.email=alice@example.com", "commit", "-q", "--allow-empty", "-m", "initial commit");
    git("-c", "user.name=Bob", "-c", "user.email=bob@example.com", "commit", "-q", "--allow-empty", "-m", "second commit\n\nCo-authored-by: Carol <carol@example.com>");
    git("-c", "user.name=Alice", "-c", "user.email=alice@example.com", "commit", "-q", "--allow-empty", "-m", "third commit");

    const runner = createGitRunner(tempRepo);
    const metrics = collectContributorMetrics(runner);
    assert.equal(metrics.totalCommits, 3);
    assert.equal(metrics.totalContributors, 3);
    assert.deepEqual(metrics.contributors, ["Alice", "Bob", "Carol"]);
    assert.deepEqual(metrics.externalContributors, ["Alice", "Bob", "Carol"]);
    assert.equal(metrics.isShallow, false);

    const withMaintainer = collectContributorMetrics(runner, undefined, ["alice"]);
    assert.deepEqual(withMaintainer.externalContributors, ["Bob", "Carol"]);
    assert.equal(withMaintainer.totalExternalContributors, 2);
  } finally {
    await rm(tempRepo, { recursive: true, force: true });
  }
});

test("collectContributorMetrics degrades gracefully in a shallow repository", async () => {
  const sourceRepo = await mkdtemp(join(tmpdir(), "evergreen-shallow-source-"));
  const shallowClone = await mkdtemp(join(tmpdir(), "evergreen-shallow-clone-"));
  try {
    const git = (...args: string[]) => execFileSync(
      "git",
      ["-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args],
      { cwd: sourceRepo, encoding: "utf8" },
    );
    git("init", "-q");
    git("-c", "user.name=Alice", "-c", "user.email=alice@example.com", "commit", "-q", "--allow-empty", "-m", "commit 1");
    git("-c", "user.name=Bob", "-c", "user.email=bob@example.com", "commit", "-q", "--allow-empty", "-m", "commit 2");

    execFileSync("git", ["clone", "--depth", "1", `file://${sourceRepo}`, shallowClone], { encoding: "utf8" });

    const runner = createGitRunner(shallowClone);
    const metrics = collectContributorMetrics(runner);
    assert.equal(metrics.isShallow, true);
    assert.equal(metrics.totalCommits, 1);
    assert.equal(metrics.totalContributors, 1);
    assert.deepEqual(metrics.contributors, ["Bob"]);

    const mockData: MonthlyReportData = {
      month: "2026-10",
      asOfDate: "2026-10-28",
      version: "0.7.1",
      rules: {
        total: 1,
        reviewedInMonth: 1,
        byEcosystem: { npm: 1 },
        byEvent: { deprecated: 1 },
        bySeverity: { high: 1 },
        withReplacements: 1,
        withUsage: 1,
        withMigration: 1,
      },
      ecosystems: {
        total: 1,
        supported: 1,
        experimental: 0,
        byMaturity: { stable: 1, beta: 0, experimental: 0 },
        ecosystems: [{ id: "npm", status: "supported", maturity: "stable", detectorIds: ["npm"] }],
      },
      corpus: {
        totalRepositories: 1,
        totalExpectedFindings: 1,
        byEcosystem: { npm: { repositories: 1, expectedFindings: 1 } },
        bySelection: { targeted: 1 },
      },
      contributors: metrics,
      adoption: {
        snapshotDate: null,
        githubStars: "unavailable",
        previousStars: null,
        channels: [],
      },
    };

    const report = generateMonthlyReport(mockData);
    assert.match(report, /Contributor counts are partial because the history is shallow\./);
  } finally {
    await rm(sourceRepo, { recursive: true, force: true });
    await rm(shallowClone, { recursive: true, force: true });
  }
});

test("collectContributorMetrics handles git runner failures gracefully", () => {
  const failingGitRunner = () => {
    throw new Error("Git unavailable");
  };
  const metrics = collectContributorMetrics(failingGitRunner);
  assert.equal(metrics.totalCommits, 0);
  assert.equal(metrics.totalContributors, 0);
  assert.deepEqual(metrics.contributors, []);
  assert.equal(metrics.isShallow, false);
});

function sampleReportData(): MonthlyReportData {
  return {
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
      externalContributors: ["Alice Smith", "Bob Jones"],
      monthExternalContributorsList: ["Alice Smith"],
      totalExternalContributors: 2,
      monthExternalContributors: 1,
      isShallow: false,
    },
    adoption: {
      snapshotDate: "2026-10-28",
      githubStars: 10,
      previousStars: 8,
      channels: [
        { label: "GitHub Action repositories", value: 5, previous: 4, note: "2 recurring" },
        { label: "Pre-commit hook repositories", value: 1, previous: 1 },
        { label: "GitLab component repositories", value: 0, previous: 2 },
        { label: "npm weekly downloads", value: 500, previous: 380 },
        { label: "skills.sh installs", value: 20, previous: null },
        { label: "Docs page views", value: 250, previous: 100 },
      ],
    },
  };
}

test("generateMonthlyReport creates a complete markdown document with all sections", () => {
  const mockData = sampleReportData();

  const report = generateMonthlyReport(mockData);

  assert.match(report, /^# Evergreen Monthly Progress Report: 2026-10$/m);
  assert.match(report, /^Generated on 2026-10-28 · Evergreen `0.7.1`$/m);
  assert.match(report, /^## Momentum highlights$/m);
  assert.match(report, /\| Lifecycle rules \| 100 rules \| 50 reviewed across 2 ecosystems \|/);
  assert.match(report, /\| Supported ecosystems \| 2 ecosystems \| 1 supported, 1 experimental \|/);
  assert.match(report, /\| Validation corpus \| 50 repositories \| 200 expected findings across 2 ecosystems \|/);
  assert.match(report, /\| Contributors \| 2 contributors, 2 external \| 30 commits in 2026-10; 1 external contributors \|/);
  assert.match(report, /\| Adoption \| 10 GitHub stars \| 10 stars \(\+2 vs last month\) \|/);
  assert.doesNotMatch(report, /total across channels/);
  assert.match(report, /^## Lifecycle rules$/m);
  assert.match(report, /\*\*Total rules:\*\* 100/);
  assert.match(report, /\*\*Rules with replacements:\*\* 90 \(90\.0%\)/);
  assert.match(report, /^## Ecosystem coverage$/m);
  assert.match(report, /\| npm \| supported \| stable \| `npm` \|/);
  assert.match(report, /^## Validation corpus$/m);
  assert.match(report, /\*\*Total repositories:\*\* 50/);
  assert.match(report, /^## Adoption$/m);
  assert.match(report, /\*Snapshot: 2026-10-28\*/);
  assert.match(report, /### North-star trend/);
  assert.match(report, /\*\*GitHub stars:\*\* 10 \(\+2 vs previous month\)/);
  assert.match(report, /### Channel breakdown/);
  assert.match(report, /The change compares the newest snapshot of this month with the newest snapshot of the previous month\./);
  assert.match(report, /\| Channel \| Count \| Change vs last month \|/);
  assert.match(report, /\| GitHub Action repositories \| 5 \(2 recurring\) \| \+1 \|/);
  assert.match(report, /\| Pre-commit hook repositories \| 1 \| 0 \|/);
  assert.match(report, /\| GitLab component repositories \| 0 \| -2 \|/);
  assert.match(report, /\| npm weekly downloads \| 500 \| \+120 \|/);
  assert.match(report, /\| skills.sh installs \| 20 \| — \|/);
  assert.match(report, /\| Docs page views \| 250 \| \+150 \|/);
  assert.match(report, /\[docs\/ADOPTION\.md\]\(docs\/ADOPTION\.md\)/);
  assert.match(report, /\[`metrics\/adoption\/2026-10-28\.json`\]\(metrics\/adoption\/2026-10-28\.json\)/);
  assert.match(report, /^## Review responsiveness$/m);
  assert.match(report, /\*\*2 working days\*\* of a first-time contributor opening a pull request/);
  assert.match(report, /\[CONTRIBUTING\.md\]\(CONTRIBUTING\.md#review-expectations\)/);
  assert.match(report, /\| First review of a first-time contributor's pull request \| not measured \| 2 working days \|/);
  assert.match(report, /does not print a number it cannot reproduce/);
  assert.match(report, /^## Contributors$/m);
  assert.match(report, /- Alice Smith/);
  assert.match(report, /- Bob Jones/);

  const noTrendReport = generateMonthlyReport({
    ...mockData,
    adoption: {
      ...mockData.adoption,
      previousStars: null,
    },
  });
  assert.match(noTrendReport, /\| Adoption \| 10 GitHub stars \| snapshot 2026-10-28 \|/);
});

test("collectAdoptionMetrics reads current and previous month snapshots", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "evergreen-test-adoption-"));
  try {
    const prevSnapshot = {
      schemaVersion: "evergreen.adoption-snapshot.v1",
      date: "2026-09-20",
      metrics: {
        githubStars: { status: "ok", value: 15, source: "https://api.github.com/repos/test" },
        githubActionRepositories: { status: "ok", value: 3, source: "https://github.com/search" },
        npmWeeklyDownloads: { status: "ok", value: 100, source: "npm" },
        skillsShInstalls: { status: "ok", value: 5, source: "skills" },
        docsPageViews: { status: "ok", value: 50, source: "https://test.goatcounter.com/counter/TOTAL.json" },
      },
    };
    const currSnapshot = {
      schemaVersion: "evergreen.adoption-snapshot.v1",
      date: "2026-10-15",
      metrics: {
        githubStars: { status: "ok", value: 25, source: "https://api.github.com/repos/test" },
        githubActionRepositories: { status: "ok", value: 4, source: "https://github.com/search" },
        repeatActionRepositories: { status: "ok", value: 2, source: "https://github.com/search" },
        preCommitRepositories: { status: "ok", value: 1, source: "https://github.com/search" },
        gitlabComponentRepositories: { status: "unavailable", reason: "none", source: "gitlab" },
        npmWeeklyDownloads: { status: "ok", value: 120, source: "npm" },
        skillsShInstalls: { status: "ok", value: 10, source: "skills" },
        docsPageViews: { status: "ok", value: 80, source: "https://test.goatcounter.com/counter/TOTAL.json" },
      },
    };
    await writeFile(join(tempDir, "2026-09-20.json"), JSON.stringify(prevSnapshot));
    await writeFile(join(tempDir, "2026-10-15.json"), JSON.stringify(currSnapshot));

    const metrics = await collectAdoptionMetrics({ adoptionDir: tempDir, month: "2026-10" });
    assert.equal(metrics.snapshotDate, "2026-10-15");
    assert.equal(metrics.githubStars, 25);
    assert.equal(metrics.previousStars, 15);

    const actionChannel = metrics.channels.find((c) => c.label === "GitHub Action repositories");
    assert.equal(actionChannel?.value, 4);
    assert.equal(actionChannel?.previous, 3);
    assert.equal(actionChannel?.note, "2 recurring");

    const gitlabChannel = metrics.channels.find((c) => c.label === "GitLab component repositories");
    assert.equal(gitlabChannel?.value, "unavailable");
    assert.equal(gitlabChannel?.previous, null);

    const docsChannel = metrics.channels.find((c) => c.label === "Docs page views");
    assert.equal(docsChannel?.value, 80);
    assert.equal(docsChannel?.previous, 50);
    assert.equal(metrics.channels.find((c) => c.label === "npm weekly downloads")?.previous, 100);
    assert.equal(metrics.channels.find((c) => c.label === "skills.sh installs")?.previous, 5);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("collectAdoptionMetrics handles missing adoption directories gracefully", async () => {
  const metrics = await collectAdoptionMetrics({ adoptionDir: "non-existent-metrics-dir-12345", month: "2026-10" });
  assert.equal(metrics.snapshotDate, null);
  assert.equal(metrics.githubStars, "unavailable");
  assert.equal(metrics.previousStars, null);
  assert.ok(metrics.channels.length > 0);
  for (const c of metrics.channels) {
    assert.equal(c.value, "unavailable");
  }
});

test("collectReportData returns well-formed data structure without hardcoded repository size thresholds", async () => {
  const data = await collectReportData({ date: "2026-10-28" });
  assert.equal(data.month, "2026-10");
  assert.equal(data.asOfDate, "2026-10-28");
  assert.ok(typeof data.version === "string" && data.version.length > 0);
  assert.ok(typeof data.rules.total === "number" && data.rules.total >= 0);
  assert.ok(typeof data.rules.byEcosystem === "object" && data.rules.byEcosystem !== null);
  assert.ok(typeof data.ecosystems.total === "number" && data.ecosystems.total >= 0);
  assert.ok(Array.isArray(data.ecosystems.ecosystems));
  assert.ok(typeof data.corpus.totalRepositories === "number" && data.corpus.totalRepositories >= 0);
  assert.ok(typeof data.corpus.totalExpectedFindings === "number" && data.corpus.totalExpectedFindings >= 0);
  assert.ok(typeof data.contributors.totalCommits === "number" && data.contributors.totalCommits >= 0);
  assert.ok(typeof data.contributors.totalContributors === "number" && data.contributors.totalContributors >= 0);
  assert.ok(Array.isArray(data.contributors.contributors));
  assert.ok(typeof data.contributors.isShallow === "boolean");
  assert.ok(typeof data.adoption === "object" && data.adoption !== null);
  assert.ok(Array.isArray(data.adoption.channels));
});

test("the review target in the report matches the one published in CONTRIBUTING.md", async () => {
  const contributing = await readFile("CONTRIBUTING.md", "utf8");
  assert.match(contributing, /^## Review expectations$/m);
  assert.match(contributing, /first review within \*\*two working days\*\*/i);
  assert.equal(FIRST_REVIEW_TARGET_WORKING_DAYS, 2);
});

test("CLI execution runs and exits successfully", async () => {
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
    const writtenContent = await readFile(outFile, "utf8");
    assert.match(writtenContent, /^# Evergreen Monthly Progress Report: 2026-10$/m);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("isInternalContributor treats maintainers and bots as internal", () => {
  assert.equal(isInternalContributor("Armin Azimi"), true);
  assert.equal(isInternalContributor("dependabot[bot]"), true);
  assert.equal(isInternalContributor("Hsn"), false);
});

test("the report separates external contributors and states the source", () => {
  const report = generateMonthlyReport(sampleReportData());
  assert.match(report, /### External contributors/);
  assert.match(report, /2 external contributors in total, 1 in 2026-10/);
  assert.match(report, /- Alice Smith \(active in 2026-10\)/);
  assert.match(report, /- Bob Jones\n/);
  assert.match(report, /Source: `git log`/);
});

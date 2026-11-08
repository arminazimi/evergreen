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
import type { QualityMetrics } from "../tools/quality-metrics.js";

test("collectRuleMetrics aggregates rules from registry JSON files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "evergreen-test-registry-"));
  try {
    const mockRegistry = {
      schemaVersion: "ebb.registry.v2",
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
  try {
    const nodeDir = join(tempDir, "benchmarks", "public-repositories", "node");
    const pythonDir = join(tempDir, "benchmarks", "public-repositories", "python");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(nodeDir, { recursive: true });
    await mkdir(pythonDir, { recursive: true });
    await writeFile(
      join(nodeDir, "0000--org--repo-a.json"),
      `${JSON.stringify(
        {
          repository: "org/repo-a",
          commit: "a".repeat(40),
          ecosystem: "node",
          selection: "targeted",
          expected: [
            {
              ruleId: "r1",
              path: "package.json",
              groundTruthSource: { kind: "maintainer-review", note: "package.json" },
            },
            {
              ruleId: "r2",
              path: "package.json",
              groundTruthSource: { kind: "maintainer-review", note: "package.json" },
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      join(pythonDir, "0001--org--repo-b.json"),
      `${JSON.stringify(
        {
          repository: "org/repo-b",
          commit: "b".repeat(40),
          ecosystem: "python",
          selection: "blind",
          expected: [
            {
              ruleId: "r3",
              path: "pyproject.toml",
              groundTruthSource: { kind: "maintainer-review", note: "pyproject.toml" },
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const metrics = await collectCorpusMetrics(tempDir);
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
  const metrics = await collectCorpusMetrics("invalid-corpus-path");
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
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], {
        cwd: tempRepo,
        encoding: "utf8",
      });
    git("init", "-q");
    git(
      "-c",
      "user.name=Alice",
      "-c",
      "user.email=alice@example.com",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "initial commit",
    );
    git(
      "-c",
      "user.name=Bob",
      "-c",
      "user.email=bob@example.com",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "second commit\n\nCo-authored-by: Carol <carol@example.com>",
    );
    git(
      "-c",
      "user.name=Alice",
      "-c",
      "user.email=alice@example.com",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "third commit",
    );

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
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], {
        cwd: sourceRepo,
        encoding: "utf8",
      });
    git("init", "-q");
    git(
      "-c",
      "user.name=Alice",
      "-c",
      "user.email=alice@example.com",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "commit 1",
    );
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
        landingPages: [],
      },
      quality: { snapshotDate: null, rows: [] },
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
      landingPages: [
        { page: "https://arminazimi.github.io/evergreen/RULES.html", clicks: 42, impressions: 530 },
        { page: "https://arminazimi.github.io/evergreen/eol/", clicks: 18, impressions: 410 },
      ],
    },
    quality: sampleQualityMetrics(),
  };
}

function sampleQualityMetrics(): QualityMetrics {
  return {
    snapshotDate: "2026-11-03",
    rows: [
      {
        criterion: "File size",
        target: "median ≤300; none over 800 without an entry",
        current: "1 file over 800",
        value: 1,
        previous: 2,
      },
      {
        criterion: "Complexity",
        target: "≤15 per function",
        current: "187 functions over 15",
        value: 187,
        previous: 191,
      },
      {
        criterion: "Type safety",
        target: "0 any; 0 @ts-ignore; as unknown as and non-null may not grow",
        current: "0 any; 4 as unknown as in 3 files; 573 non-null",
        value: 573,
        previous: 589,
      },
      {
        criterion: "Boundaries",
        target: "zero violations without an entry",
        current: "0 violations",
        value: 0,
        previous: 1,
      },
      {
        criterion: "Coverage",
        target: "lines ≥93; branches ≥87; functions ≥93",
        current: "94.7 / 87.1 / 94.7",
        value: 94.7,
        previous: 94.7,
      },
      {
        criterion: "Mutation score",
        target: "break at 60; high at 80",
        current: "not measured",
        value: null,
        previous: null,
      },
      {
        criterion: "Docs",
        target: "generated checks gate; links and accessibility clean",
        current: "partial (links report-only)",
        value: null,
        previous: null,
      },
      {
        criterion: "Security",
        target: "no high/critical; Scorecard ≥6",
        current: "5 allowlisted advisories; Scorecard 3.1",
        value: 3.1,
        previous: null,
      },
      {
        criterion: "Remaining debt",
        target: "allowlist ceilings equal measured values; expire by 2027-01-26",
        current: "187 over complexity; 573 non-null",
        value: 760,
        previous: 780,
      },
    ],
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
  assert.match(
    report,
    /\| Contributors \| 2 contributors, 2 external \| 30 commits in 2026-10; 1 external contributors \|/,
  );
  assert.match(report, /\| Adoption \| 10 GitHub stars \| 10 stars \(\+2 vs last month\) \|/);
  assert.match(report, /\| Reference quality \| 187 over complexity; 573 non-null \|/);
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
  assert.match(
    report,
    /The change compares the newest snapshot of this month with the newest snapshot of the previous month\./,
  );
  assert.match(report, /\| Channel \| Count \| Change vs last month \|/);
  assert.match(report, /\| GitHub Action repositories \| 5 \(2 recurring\) \| \+1 \|/);
  assert.match(report, /\| Pre-commit hook repositories \| 1 \| 0 \|/);
  assert.match(report, /\| GitLab component repositories \| 0 \| -2 \|/);
  assert.match(report, /\| npm weekly downloads \| 500 \| \+120 \|/);
  assert.match(report, /\| skills.sh installs \| 20 \| — \|/);
  assert.match(report, /\| Docs page views \| 250 \| \+150 \|/);
  assert.match(report, /^### Top landing pages$/m);
  assert.match(report, /Entered by the maintainer from Search Console's Performance report for 2026-10/);
  assert.match(report, /\| Landing page \| Clicks \| Impressions \|/);
  assert.match(report, /\| https:\/\/arminazimi\.github\.io\/evergreen\/RULES\.html \| 42 \| 530 \|/);
  assert.match(report, /\| https:\/\/arminazimi\.github\.io\/evergreen\/eol\/ \| 18 \| 410 \|/);
  assert.match(report, /\[docs\/ADOPTION\.md\]\(docs\/ADOPTION\.md\)/);
  assert.match(report, /\[`metrics\/adoption\/2026-10-28\.json`\]\(metrics\/adoption\/2026-10-28\.json\)/);
  assert.match(report, /^## Reference quality$/m);
  assert.match(report, /\| Criterion \| Target \| Current \| Change vs last month \|/);
  assert.match(report, /\| File size \| .* \| 1 file over 800 \| -1 \|/);
  assert.match(report, /\| Complexity \| .* \| 187 functions over 15 \| -4 \|/);
  assert.match(report, /\| Remaining debt \| .* \| 187 over complexity; 573 non-null \| -20 \|/);
  assert.match(report, /\[docs\/QUALITY\.md\]\(docs\/QUALITY\.md\)/);
  assert.match(report, /\[`metrics\/quality\/2026-11-03\.json`\]\(metrics\/quality\/2026-11-03\.json\)/);
  assert.match(report, /^## Review responsiveness$/m);
  assert.match(report, /\*\*2 working days\*\* of a first-time contributor opening a pull request/);
  assert.match(report, /\[CONTRIBUTING\.md\]\(CONTRIBUTING\.md#review-expectations\)/);
  assert.match(
    report,
    /\| First review of a first-time contributor's pull request \| not measured \| 2 working days \|/,
  );
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

test("generateMonthlyReport says when no landing pages were entered", () => {
  const mockData = sampleReportData();
  const report = generateMonthlyReport({
    ...mockData,
    adoption: { ...mockData.adoption, landingPages: [] },
  });
  assert.match(report, /^### Top landing pages$/m);
  assert.match(report, /No Search Console landing pages were entered for 2026-10\./);
  assert.doesNotMatch(report, /\| Landing page \| Clicks \| Impressions \|/);
});

test("generateMonthlyReport escapes pipes in landing-page URLs", () => {
  const mockData = sampleReportData();
  const report = generateMonthlyReport({
    ...mockData,
    adoption: {
      ...mockData.adoption,
      landingPages: [{ page: "https://example.test/a|b", clicks: 1, impressions: 2 }],
    },
  });
  assert.match(report, /\| https:\/\/example\.test\/a\\\|b \| 1 \| 2 \|/);
});

test("landing-page cells cannot split the report through backslashes or line breaks", () => {
  const data = sampleReportData();
  const report = generateMonthlyReport({
    ...data,
    adoption: { ...data.adoption, landingPages: [{ page: "a\\|b\r\nc\nd\re", clicks: 1, impressions: 2 }] },
  });
  assert.ok(report.includes(String.raw`| a\\\|b c d e | 1 | 2 |`));
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
        searchConsoleLandingPages: {
          status: "ok",
          value: 2,
          pages: [
            { page: "https://arminazimi.github.io/evergreen/RULES.html", clicks: 42, impressions: 530 },
            { page: "https://arminazimi.github.io/evergreen/", clicks: 18, impressions: 410 },
          ],
          source: "https://search.google.com/search-console/performance/search-analytics",
        },
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
    assert.deepEqual(metrics.landingPages, [
      { page: "https://arminazimi.github.io/evergreen/RULES.html", clicks: 42, impressions: 530 },
      { page: "https://arminazimi.github.io/evergreen/", clicks: 18, impressions: 410 },
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("collectAdoptionMetrics keeps the month's landing pages when a newer snapshot lacks them", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "evergreen-test-landing-"));
  try {
    await writeFile(
      join(tempDir, "2026-10-05.json"),
      JSON.stringify({
        schemaVersion: "evergreen.adoption-snapshot.v1",
        date: "2026-10-05",
        metrics: {
          searchConsoleLandingPages: {
            status: "ok",
            value: 1,
            pages: [{ page: "/RULES.html", clicks: 3, impressions: 4 }],
            source: "https://search.google.com/search-console/performance/search-analytics",
          },
        },
      }),
    );
    await writeFile(
      join(tempDir, "2026-10-25.json"),
      JSON.stringify({
        schemaVersion: "evergreen.adoption-snapshot.v1",
        date: "2026-10-25",
        metrics: {
          searchConsoleLandingPages: {
            status: "unavailable",
            reason: "The maintainer has not entered this month's Search Console landing pages.",
            source: "https://search.google.com/search-console/performance/search-analytics",
          },
        },
      }),
    );

    const metrics = await collectAdoptionMetrics({ adoptionDir: tempDir, month: "2026-10" });
    assert.equal(metrics.snapshotDate, "2026-10-25");
    assert.deepEqual(metrics.landingPages, [{ page: "/RULES.html", clicks: 3, impressions: 4 }]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("collectAdoptionMetrics handles missing adoption directories gracefully", async () => {
  const metrics = await collectAdoptionMetrics({ adoptionDir: "non-existent-metrics-dir-12345", month: "2026-10" });
  assert.equal(metrics.snapshotDate, null);
  assert.equal(metrics.githubStars, "unavailable");
  assert.equal(metrics.previousStars, null);
  assert.deepEqual(metrics.landingPages, []);
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
  assert.ok(typeof data.quality === "object" && data.quality !== null);
  assert.ok(Array.isArray(data.quality.rows));
  assert.equal(data.quality.rows.length, 9);
});

test("the review target in the report matches the one published in CONTRIBUTING.md", async () => {
  const contributing = await readFile("CONTRIBUTING.md", "utf8");
  assert.match(contributing, /^## Review expectations$/m);
  assert.match(contributing, /first review within \*\*two working days\*\*/i);
  assert.equal(FIRST_REVIEW_TARGET_WORKING_DAYS, 2);
});

test("CLI execution runs and exits successfully", async () => {
  const stdoutResult = spawnSync(process.execPath, [resolve("dist/tools/monthly-report.js"), "--date", "2026-10"], {
    encoding: "utf8",
  });
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

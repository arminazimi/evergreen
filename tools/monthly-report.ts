// Generates a monthly progress report showing momentum across rules, ecosystems,
// corpus, and contributors from repository data.
//
//   npm run report:monthly                         # prints the report to stdout
//   node dist/tools/monthly-report.js              # prints the report to stdout
//   node dist/tools/monthly-report.js --out docs/reports/monthly-2026-10.md
//   node dist/tools/monthly-report.js --date 2026-10
//
// Reads local repository files and git log only; never uses the network. Pull-request review
// timestamps are in neither input, so the report publishes the first-review target from
// CONTRIBUTING.md ("Review expectations") without a measured value.

import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

import type { LandingPage, Snapshot } from "./adoption-metrics.js";
import { FIRST_REVIEW_TARGET_WORKING_DAYS, generateMonthlyReport } from "./monthly-report-format.js";
import { collectQualityMetrics } from "./quality-metrics.js";
import type { QualityMetrics } from "./quality-metrics.js";

import { loadPublicCorpus } from "../benchmarks/public-corpus.js";
import { getCapabilityManifest } from "../src/capabilities.js";
import { REGISTRY_V2_SCHEMA_VERSION } from "@velella/ebb/registry";
import type { RegistryV2 } from "@velella/ebb/registry";
import { VERSION } from "../src/version.js";

export { FIRST_REVIEW_TARGET_WORKING_DAYS, generateMonthlyReport };

export interface RuleMetrics {
  total: number;
  reviewedInMonth: number;
  byEcosystem: Record<string, number>;
  byEvent: Record<string, number>;
  bySeverity: Record<string, number>;
  withReplacements: number;
  withUsage: number;
  withMigration: number;
}

export interface EcosystemMetric {
  id: string;
  status: "supported" | "experimental" | "unsupported";
  maturity: "experimental" | "beta" | "stable";
  detectorIds: readonly string[];
}

export interface EcosystemMetrics {
  total: number;
  supported: number;
  experimental: number;
  byMaturity: {
    stable: number;
    beta: number;
    experimental: number;
  };
  ecosystems: EcosystemMetric[];
}

export interface CorpusMetrics {
  totalRepositories: number;
  totalExpectedFindings: number;
  byEcosystem: Record<string, { repositories: number; expectedFindings: number }>;
  bySelection: Record<string, number>;
}

export interface ContributorMetrics {
  totalCommits: number;
  monthCommits: number;
  totalContributors: number;
  monthContributors: number;
  contributors: string[];
  monthContributorsList: string[];
  /** Contributors who are neither a maintainer (see MAINTAINERS.md) nor a bot. */
  externalContributors: string[];
  monthExternalContributorsList: string[];
  totalExternalContributors: number;
  monthExternalContributors: number;
  isShallow: boolean;
}

export interface AdoptionChannel {
  label: string;
  value: number | "unavailable";
  /** The channel's value in the newest snapshot of the previous month; null when that is unavailable. */
  previous: number | null;
  note?: string | undefined;
}

export interface AdoptionMetrics {
  /** The most recent snapshot date found in metrics/adoption/ for the report month. */
  snapshotDate: string | null;
  /** GitHub stars (north-star). */
  githubStars: number | "unavailable";
  /** Previous-month GitHub stars for trend comparison (null when unavailable). */
  previousStars: number | null;
  /** Per-channel breakdown rows. */
  channels: AdoptionChannel[];
  /** Top landing pages the maintainer entered from Search Console for the report month; empty when none. */
  landingPages: LandingPage[];
}

export interface MonthlyReportData {
  month: string;
  asOfDate: string;
  version: string;
  rules: RuleMetrics;
  ecosystems: EcosystemMetrics;
  corpus: CorpusMetrics;
  contributors: ContributorMetrics;
  adoption: AdoptionMetrics;
  quality: QualityMetrics;
}

export type GitRunner = (args: readonly string[]) => string;

export const createGitRunner =
  (cwd: string): GitRunner =>
  (args) => {
    return execFileSync("git", [...args], { cwd, encoding: "utf8" });
  };

const defaultGitRunner: GitRunner = (args) => {
  return execFileSync("git", [...args], { encoding: "utf8" });
};

/** Collects rule metrics from registry/*.json. */
export async function collectRuleMetrics(
  registryDir = "node_modules/@velella/ebb/registry",
  month?: string,
): Promise<RuleMetrics> {
  const byEcosystem: Record<string, number> = {};
  const byEvent: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let total = 0;
  let reviewedInMonth = 0;
  let withReplacements = 0;
  let withUsage = 0;
  let withMigration = 0;

  const entries = await readdir(registryDir).catch(() => [] as string[]);
  for (const name of entries.filter((file) => file.endsWith(".json")).sort()) {
    try {
      const content = JSON.parse(await readFile(join(registryDir, name), "utf8")) as RegistryV2;
      if (content.schemaVersion === REGISTRY_V2_SCHEMA_VERSION && Array.isArray(content.rules)) {
        for (const rule of content.rules) {
          total++;
          byEcosystem[rule.ecosystem] = (byEcosystem[rule.ecosystem] ?? 0) + 1;
          byEvent[rule.event] = (byEvent[rule.event] ?? 0) + 1;
          bySeverity[rule.severity] = (bySeverity[rule.severity] ?? 0) + 1;
          if (rule.replacement) withReplacements++;
          if (rule.usage && rule.usage.length > 0) withUsage++;
          if (rule.migration) withMigration++;

          if (month && rule.provenance?.reviewedAt?.startsWith(month)) {
            reviewedInMonth++;
          }
        }
      }
    } catch {
      // Ignore unparseable or non-registry files
    }
  }

  return {
    total,
    reviewedInMonth,
    byEcosystem,
    byEvent,
    bySeverity,
    withReplacements,
    withUsage,
    withMigration,
  };
}

/** Collects ecosystem coverage metrics from the capability manifest. */
export function collectEcosystemMetrics(): EcosystemMetrics {
  const manifest = getCapabilityManifest();
  const ecosystems = manifest.ecosystems.map((eco) => ({
    id: eco.id,
    status: eco.status,
    maturity: eco.maturity ?? "experimental",
    detectorIds: eco.detectorIds,
  }));

  const byMaturity = {
    stable: 0,
    beta: 0,
    experimental: 0,
  };

  let supported = 0;
  let experimental = 0;

  for (const eco of ecosystems) {
    if (eco.status === "supported") supported++;
    if (eco.status === "experimental") experimental++;
    if (eco.maturity === "stable") byMaturity.stable++;
    else if (eco.maturity === "beta") byMaturity.beta++;
    else byMaturity.experimental++;
  }

  return {
    total: ecosystems.length,
    supported,
    experimental,
    byMaturity,
    ecosystems,
  };
}

/** Collects public benchmark corpus metrics from benchmarks/public-repositories/. */
export async function collectCorpusMetrics(root = "."): Promise<CorpusMetrics> {
  const byEcosystem: Record<string, { repositories: number; expectedFindings: number }> = {};
  const bySelection: Record<string, number> = {};
  let totalRepositories = 0;
  let totalExpectedFindings = 0;

  try {
    const raw = await loadPublicCorpus(root);

    if (Array.isArray(raw.repositories)) {
      for (const repo of raw.repositories) {
        totalRepositories++;
        const findingsCount = Array.isArray(repo.expected) ? repo.expected.length : 0;
        totalExpectedFindings += findingsCount;

        const eco = repo.ecosystem ?? "unknown";
        const current = byEcosystem[eco] ?? { repositories: 0, expectedFindings: 0 };
        current.repositories++;
        current.expectedFindings += findingsCount;
        byEcosystem[eco] = current;

        const sel = repo.selection ?? "unknown";
        bySelection[sel] = (bySelection[sel] ?? 0) + 1;
      }
    }
  } catch {
    // If corpus file is missing or invalid, return zeros
  }

  return {
    totalRepositories,
    totalExpectedFindings,
    byEcosystem,
    bySelection,
  };
}

/** Formats a contributor string into a human-readable display name. */
export function formatContributorName(raw: string): string {
  const emailIndex = raw.indexOf("<");
  if (emailIndex >= 0) {
    const name = raw.slice(0, emailIndex).trim();
    if (name) return name;
    const email = raw.slice(emailIndex + 1, raw.indexOf(">")).trim();
    return email;
  }
  return raw.trim();
}

/** Names and handles the maintainer commits under, lowercase. Keep in step with MAINTAINERS.md. */
export const MAINTAINER_ALIASES: readonly string[] = ["armin azimi", "a.azimi", "arminazimi"];

/** True for a contributor who is a maintainer or a bot, so is not counted as external. */
export function isInternalContributor(name: string, maintainers: readonly string[] = MAINTAINER_ALIASES): boolean {
  const lower = name.trim().toLowerCase();
  return lower.endsWith("[bot]") || lower === "github-actions" || maintainers.includes(lower);
}

/** Collects contributor metrics from git log. */
export function collectContributorMetrics(
  gitRunner: GitRunner = defaultGitRunner,
  month?: string,
  maintainers: readonly string[] = MAINTAINER_ALIASES,
): ContributorMetrics {
  let isShallow = false;
  try {
    const shallowOutput = gitRunner(["rev-parse", "--is-shallow-repository"]).trim();
    isShallow = shallowOutput === "true";
  } catch {
    // If command fails or git is not available, ignore
  }

  try {
    const commitCountStr = gitRunner(["rev-list", "--count", "HEAD"]).trim();
    const totalCommits = parseInt(commitCountStr, 10) || 0;

    const allAuthors = gitRunner(["log", "--use-mailmap", "--format=%aN"]).split("\n");
    const allBodies = gitRunner(["log", "--format=%b"]);

    const allContributorsSet = new Set<string>();
    for (const author of allAuthors) {
      const trimmed = author.trim();
      if (trimmed) allContributorsSet.add(trimmed);
    }

    const coAuthorRegex = /^Co-authored-by:\s*(.+?)\s*<[^>]+>/gim;
    let match: RegExpExecArray | null;
    while ((match = coAuthorRegex.exec(allBodies)) !== null) {
      const name = match[1]?.trim();
      if (name) allContributorsSet.add(name);
    }

    let monthCommits = totalCommits;
    const monthContributorsSet = new Set<string>();

    if (month) {
      const year = parseInt(month.slice(0, 4), 10);
      const m = parseInt(month.slice(5, 7), 10);
      const lastDay = new Date(Date.UTC(year, m, 0)).toISOString().slice(8, 10);
      const since = `${month}-01T00:00:00`;
      const until = `${month}-${lastDay}T23:59:59`;

      try {
        const monthCommitList = gitRunner(["log", `--since=${since}`, `--until=${until}`, "--format=%h"])
          .split("\n")
          .filter(Boolean);
        monthCommits = monthCommitList.length;

        const monthAuthors = gitRunner([
          "log",
          "--use-mailmap",
          `--since=${since}`,
          `--until=${until}`,
          "--format=%aN",
        ]).split("\n");
        for (const author of monthAuthors) {
          const trimmed = author.trim();
          if (trimmed) monthContributorsSet.add(trimmed);
        }

        const monthBodies = gitRunner(["log", `--since=${since}`, `--until=${until}`, "--format=%b"]);
        while ((match = coAuthorRegex.exec(monthBodies)) !== null) {
          const name = match[1]?.trim();
          if (name) monthContributorsSet.add(name);
        }
      } catch {
        // Fall back to all contributors if date-range log fails
      }
    }

    const contributors = [...allContributorsSet].sort((a, b) => a.localeCompare(b));
    const monthContributorsList =
      monthContributorsSet.size > 0 ? [...monthContributorsSet].sort((a, b) => a.localeCompare(b)) : contributors;

    const externalContributors = contributors.filter((name) => !isInternalContributor(name, maintainers));
    const monthExternalContributorsList = monthContributorsList.filter(
      (name) => !isInternalContributor(name, maintainers),
    );

    return {
      totalCommits,
      monthCommits,
      totalContributors: contributors.length,
      monthContributors: monthContributorsList.length,
      contributors,
      monthContributorsList,
      externalContributors,
      monthExternalContributorsList,
      totalExternalContributors: externalContributors.length,
      monthExternalContributors: monthExternalContributorsList.length,
      isShallow,
    };
  } catch {
    return {
      totalCommits: 0,
      monthCommits: 0,
      totalContributors: 0,
      monthContributors: 0,
      contributors: [],
      monthContributorsList: [],
      externalContributors: [],
      monthExternalContributorsList: [],
      totalExternalContributors: 0,
      monthExternalContributors: 0,
      isShallow,
    };
  }
}

export interface CollectAdoptionOptions {
  /** Directory containing adoption snapshots (default: metrics/adoption). */
  adoptionDir?: string | undefined;
  /** The current report month (YYYY-MM). */
  month?: string | undefined;
}

/**
 * Reads the most-recent adoption snapshot for the given month and the previous month from
 * metrics/adoption/<date>.json files. Never uses the network.
 */
export async function collectAdoptionMetrics(options: CollectAdoptionOptions = {}): Promise<AdoptionMetrics> {
  const adoptionDir = options.adoptionDir ?? resolve("metrics/adoption");
  const month = options.month ?? new Date().toISOString().slice(0, 7);

  const [yearStr, monthStr] = month.split("-");
  let prevYear = Number(yearStr);
  let prevMonth = Number(monthStr) - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const previousMonth = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

  /** Returns the newest snapshot file for a given month prefix, or null. */
  async function newestSnapshotForMonth(prefix: string): Promise<Snapshot | null> {
    let entries: string[] = [];
    try {
      entries = await readdir(adoptionDir);
    } catch {
      return null;
    }
    const matches = entries
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
      .sort()
      .reverse();
    if (matches.length === 0) return null;
    try {
      return JSON.parse(await readFile(join(adoptionDir, matches[0]!), "utf8")) as Snapshot;
    } catch {
      return null;
    }
  }

  /** Landing pages recorded by the newest snapshot of a month that has them, or an empty list. */
  async function landingPagesForMonth(prefix: string): Promise<LandingPage[]> {
    let entries: string[] = [];
    try {
      entries = await readdir(adoptionDir);
    } catch {
      return [];
    }
    const matches = entries
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
      .sort()
      .reverse();
    for (const name of matches) {
      try {
        const snapshot = JSON.parse(await readFile(join(adoptionDir, name), "utf8")) as Snapshot;
        const metric = snapshot.metrics?.searchConsoleLandingPages;
        if (metric?.status === "ok" && Array.isArray(metric.pages)) return metric.pages;
      } catch {
        // Skip an unreadable snapshot and look at the next one.
      }
    }
    return [];
  }

  /** Reads a numeric ok-metric value from a snapshot. */
  function metricValue(snapshot: Snapshot | null, key: string): number | "unavailable" {
    if (!snapshot) return "unavailable";
    const m = snapshot.metrics?.[key];
    if (!m || m.status !== "ok" || typeof m.value !== "number") return "unavailable";
    return m.value;
  }

  const current = await newestSnapshotForMonth(month);
  const previous = await newestSnapshotForMonth(previousMonth);
  const landingPages = await landingPagesForMonth(month);

  const stars = metricValue(current, "githubStars");
  const prevStars = metricValue(previous, "githubStars");

  const repeatRaw = metricValue(current, "repeatActionRepositories");
  const repeatNote =
    repeatRaw !== "unavailable" && typeof repeatRaw === "number" ? `${repeatRaw} recurring` : undefined;

  const channel = (label: string, key: string, note?: string): AdoptionChannel => {
    const previousValue = metricValue(previous, key);
    return {
      label,
      value: metricValue(current, key),
      previous: typeof previousValue === "number" ? previousValue : null,
      ...(note ? { note } : {}),
    };
  };

  const channels: AdoptionChannel[] = [
    channel("GitHub Action repositories", "githubActionRepositories", repeatNote),
    channel("Pre-commit hook repositories", "preCommitRepositories"),
    channel("GitLab component repositories", "gitlabComponentRepositories"),
    channel("npm weekly downloads", "npmWeeklyDownloads"),
    channel("skills.sh installs", "skillsShInstalls"),
    channel("Docs page views", "docsPageViews"),
  ];

  return {
    snapshotDate: current?.date ?? null,
    githubStars: stars,
    previousStars: prevStars !== "unavailable" ? prevStars : null,
    channels,
    landingPages,
  };
}

export interface CollectReportOptions {
  date?: string | undefined;
  rootDir?: string | undefined;
  gitRunner?: GitRunner | undefined;
}

/** Gathers all repository data for the monthly report. */
export async function collectReportData(options: CollectReportOptions = {}): Promise<MonthlyReportData> {
  const root = options.rootDir ?? ".";
  const dateInput = options.date ?? new Date().toISOString().slice(0, 10);
  const month = dateInput.slice(0, 7);
  const asOfDate = dateInput.length >= 10 ? dateInput.slice(0, 10) : `${month}-01`;

  const [rules, ecosystems, corpus, adoption, quality] = await Promise.all([
    collectRuleMetrics(join(root, "node_modules/@velella/ebb/registry"), month),
    Promise.resolve(collectEcosystemMetrics()),
    collectCorpusMetrics(root),
    collectAdoptionMetrics({ adoptionDir: join(root, "metrics", "adoption"), month }),
    collectQualityMetrics({
      qualityDir: join(root, "metrics", "quality"),
      allowlistPath: join(root, "benchmarks", "quality-allowlist.json"),
      adoptionDir: join(root, "metrics", "adoption"),
      month,
      live: true,
      date: asOfDate,
    }),
  ]);

  const gitRunner = options.gitRunner ?? createGitRunner(root);
  const contributors = collectContributorMetrics(gitRunner, month);

  return {
    month,
    asOfDate,
    version: VERSION,
    rules,
    ecosystems,
    corpus,
    contributors,
    adoption,
    quality,
  };
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function main(): Promise<void> {
  const dateOpt = option("--date");
  const outOpt = option("--out");

  const reportData = await collectReportData({ date: dateOpt });
  const markdown = generateMonthlyReport(reportData);

  if (outOpt) {
    const outPath = resolve(outOpt);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, markdown, "utf8");
    process.stdout.write(`Wrote monthly report to ${outPath}\n`);
  } else {
    process.stdout.write(markdown);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

// Generates a monthly progress report showing momentum across rules, ecosystems,
// corpus, and contributors from repository data.
//
//   npm run report:monthly                         # prints the report to stdout
//   node dist/tools/monthly-report.js              # prints the report to stdout
//   node dist/tools/monthly-report.js --out docs/reports/monthly-2026-10.md
//   node dist/tools/monthly-report.js --date 2026-10
//
// Reads local repository files and git log only; never uses the network.

import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

import type { Snapshot } from "./adoption-metrics.js";

import { getCapabilityManifest } from "../src/capabilities.js";
import { REGISTRY_V2_SCHEMA_VERSION } from "../src/registry.js";
import type { RegistryV2, RegistryV2Rule } from "../src/registry.js";
import { VERSION } from "../src/version.js";

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
}

export type GitRunner = (args: readonly string[]) => string;

export const createGitRunner = (cwd: string): GitRunner => (args) => {
  return execFileSync("git", [...args], { cwd, encoding: "utf8" });
};

const defaultGitRunner: GitRunner = (args) => {
  return execFileSync("git", [...args], { encoding: "utf8" });
};

/** Collects rule metrics from registry/*.json. */
export async function collectRuleMetrics(registryDir = "registry", month?: string): Promise<RuleMetrics> {
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

/** Collects public benchmark corpus metrics from benchmarks/public-repositories.json. */
export async function collectCorpusMetrics(corpusPath = "benchmarks/public-repositories.json"): Promise<CorpusMetrics> {
  const byEcosystem: Record<string, { repositories: number; expectedFindings: number }> = {};
  const bySelection: Record<string, number> = {};
  let totalRepositories = 0;
  let totalExpectedFindings = 0;

  try {
    const raw = JSON.parse(await readFile(corpusPath, "utf8")) as {
      repositories?: Array<{
        ecosystem?: string;
        selection?: string;
        expected?: unknown[];
      }>;
    };

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

/** Collects contributor metrics from git log. */
export function collectContributorMetrics(
  gitRunner: GitRunner = defaultGitRunner,
  month?: string,
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

        const monthAuthors = gitRunner(["log", "--use-mailmap", `--since=${since}`, `--until=${until}`, "--format=%aN"])
          .split("\n");
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
    const monthContributorsList = monthContributorsSet.size > 0
      ? [...monthContributorsSet].sort((a, b) => a.localeCompare(b))
      : contributors;

    return {
      totalCommits,
      monthCommits,
      totalContributors: contributors.length,
      monthContributors: monthContributorsList.length,
      contributors,
      monthContributorsList,
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

  /** Reads a numeric ok-metric value from a snapshot. */
  function metricValue(snapshot: Snapshot | null, key: string): number | "unavailable" {
    if (!snapshot) return "unavailable";
    const m = snapshot.metrics?.[key];
    if (!m || m.status !== "ok" || typeof m.value !== "number") return "unavailable";
    return m.value;
  }

  const current = await newestSnapshotForMonth(month);
  const previous = await newestSnapshotForMonth(previousMonth);

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

  const [rules, ecosystems, corpus, adoption] = await Promise.all([
    collectRuleMetrics(join(root, "registry"), month),
    Promise.resolve(collectEcosystemMetrics()),
    collectCorpusMetrics(join(root, "benchmarks", "public-repositories.json")),
    collectAdoptionMetrics({ adoptionDir: join(root, "metrics", "adoption"), month }),
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
  };
}

/** Formats integer numbers with standard comma separators. */
function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

/** Signed change against the previous month, never treating a missing value as zero. */
function formatChange(value: number | "unavailable", previous: number | null): string {
  if (value === "unavailable") return "unavailable";
  if (previous === null) return "—";
  const diff = value - previous;
  if (diff === 0) return "0";
  return `${diff > 0 ? "+" : "-"}${formatNumber(Math.abs(diff))}`;
}

/** Generates the Markdown monthly progress report. */
export function generateMonthlyReport(data: MonthlyReportData): string {
  const lines: string[] = [];

  lines.push(`# Evergreen Monthly Progress Report: ${data.month}`);
  lines.push("");
  lines.push(`Generated on ${data.asOfDate} · Evergreen \`${data.version}\``);
  lines.push("Repository: `arminazimi/evergreen`");
  lines.push("");

  // Momentum highlights
  lines.push("## Momentum highlights");
  lines.push("");
  lines.push("| Area | Current total | Momentum |");
  lines.push("| --- | --- | --- |");
  lines.push(`| Lifecycle rules | ${formatNumber(data.rules.total)} rules | ${formatNumber(data.rules.reviewedInMonth || data.rules.total)} reviewed across ${Object.keys(data.rules.byEcosystem).length} ecosystems |`);
  lines.push(`| Supported ecosystems | ${data.ecosystems.total} ecosystems | ${data.ecosystems.supported} supported, ${data.ecosystems.experimental} experimental |`);
  lines.push(`| Validation corpus | ${formatNumber(data.corpus.totalRepositories)} repositories | ${formatNumber(data.corpus.totalExpectedFindings)} expected findings across ${Object.keys(data.corpus.byEcosystem).length} ecosystems |`);
  const contributorHighlight = data.contributors.isShallow
    ? `${data.contributors.totalContributors} contributors (partial: shallow history)`
    : `${data.contributors.totalContributors} contributors`;
  lines.push(`| Contributors | ${contributorHighlight} | ${formatNumber(data.contributors.monthCommits)} commits in ${data.month} |`);
  const starsCell =
    data.adoption.githubStars !== "unavailable" ? `${formatNumber(data.adoption.githubStars)} GitHub stars` : "unavailable";
  const adoptionMomentum = (() => {
    if (
      data.adoption.githubStars !== "unavailable" &&
      data.adoption.previousStars !== null &&
      data.adoption.previousStars !== data.adoption.githubStars
    ) {
      const diff = data.adoption.githubStars - data.adoption.previousStars;
      const sign = diff > 0 ? "+" : "";
      return `${formatNumber(data.adoption.githubStars)} stars (${sign}${diff} vs last month)`;
    }
    if (data.adoption.snapshotDate) {
      return `snapshot ${data.adoption.snapshotDate}`;
    }
    if (data.adoption.githubStars !== "unavailable") {
      return `${formatNumber(data.adoption.githubStars)} stars`;
    }
    return "unavailable";
  })();
  lines.push(`| Adoption | ${starsCell} | ${adoptionMomentum} |`);
  lines.push("");

  // Lifecycle rules section
  lines.push("## Lifecycle rules");
  lines.push("");
  lines.push(`Evergreen tracks evidence-backed lifecycle events across ${Object.keys(data.rules.byEcosystem).length} ecosystems. Every rule links to an authoritative, versioned public source.`);
  lines.push("");
  lines.push(`- **Total rules:** ${formatNumber(data.rules.total)}`);
  const replacementPct = data.rules.total > 0 ? ((data.rules.withReplacements / data.rules.total) * 100).toFixed(1) : "0.0";
  lines.push(`- **Rules with replacements:** ${formatNumber(data.rules.withReplacements)} (${replacementPct}%)`);
  const migrationPct = data.rules.total > 0 ? ((data.rules.withMigration / data.rules.total) * 100).toFixed(1) : "0.0";
  lines.push(`- **Rules with migration guidance:** ${formatNumber(data.rules.withMigration)} (${migrationPct}%)`);
  const usagePct = data.rules.total > 0 ? ((data.rules.withUsage / data.rules.total) * 100).toFixed(1) : "0.0";
  lines.push(`- **Rules with AST / code usage matchers:** ${formatNumber(data.rules.withUsage)} (${usagePct}%)`);
  lines.push("");

  lines.push("### Rules by event");
  lines.push("");
  lines.push("| Event | Rules |");
  lines.push("| --- | --- |");
  const eventEntries = Object.entries(data.rules.byEvent).sort((a, b) => b[1] - a[1]);
  for (const [event, count] of eventEntries) {
    lines.push(`| ${event} | ${formatNumber(count)} |`);
  }
  lines.push("");

  lines.push("### Rules by severity");
  lines.push("");
  lines.push("| Severity | Rules |");
  lines.push("| --- | --- |");
  const severityOrder = ["critical", "high", "medium", "low", "info"];
  for (const sev of severityOrder) {
    if (data.rules.bySeverity[sev] !== undefined) {
      lines.push(`| ${sev} | ${formatNumber(data.rules.bySeverity[sev]!)} |`);
    }
  }
  lines.push("");

  lines.push("### Rules by ecosystem");
  lines.push("");
  lines.push("| Ecosystem | Rules |");
  lines.push("| --- | --- |");
  const ecoEntries = Object.entries(data.rules.byEcosystem).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [eco, count] of ecoEntries) {
    lines.push(`| ${eco} | ${formatNumber(count)} |`);
  }
  lines.push("");

  // Ecosystem coverage section
  lines.push("## Ecosystem coverage");
  lines.push("");
  lines.push("Evergreen provides lifecycle detectors across languages, package managers, and configuration files.");
  lines.push("");
  lines.push("| Ecosystem | Status | Maturity | Detectors |");
  lines.push("| --- | --- | --- | --- |");
  const sortedEcosystems = [...data.ecosystems.ecosystems].sort((a, b) => a.id.localeCompare(b.id));
  for (const eco of sortedEcosystems) {
    lines.push(`| ${eco.id} | ${eco.status} | ${eco.maturity} | \`${eco.detectorIds.join("`, `")}\` |`);
  }
  lines.push("");

  // Validation corpus section
  lines.push("## Validation corpus");
  lines.push("");
  lines.push("To ensure accuracy and guard against regressions, Evergreen validates all detectors against a pinned benchmark corpus.");
  lines.push("");
  lines.push(`- **Total repositories:** ${formatNumber(data.corpus.totalRepositories)}`);
  const targeted = data.corpus.bySelection.targeted ?? 0;
  const blind = data.corpus.bySelection.blind ?? 0;
  lines.push(`- **Targeted repositories:** ${formatNumber(targeted)}`);
  lines.push(`- **Blind / held-out repositories:** ${formatNumber(blind)}`);
  lines.push(`- **Total expected findings:** ${formatNumber(data.corpus.totalExpectedFindings)}`);
  lines.push("");

  lines.push("| Ecosystem | Repositories | Expected findings |");
  lines.push("| --- | --- | --- |");
  const corpusEcoEntries = Object.entries(data.corpus.byEcosystem).sort(
    (a, b) => b[1].repositories - a[1].repositories || a[0].localeCompare(b[0]),
  );
  for (const [eco, metrics] of corpusEcoEntries) {
    lines.push(`| ${eco} | ${formatNumber(metrics.repositories)} | ${formatNumber(metrics.expectedFindings)} |`);
  }
  lines.push("");

  // Adoption section
  lines.push("## Adoption");
  lines.push("");
  lines.push("Public signals from open sources only. Evergreen has no telemetry.");
  lines.push("");
  if (data.adoption.snapshotDate) {
    lines.push(`*Snapshot: ${data.adoption.snapshotDate}*`);
    lines.push("");
  }
  lines.push("### North-star trend");
  lines.push("");
  if (data.adoption.githubStars !== "unavailable") {
    const trend =
      data.adoption.previousStars !== null
        ? ` (${data.adoption.githubStars >= data.adoption.previousStars ? "+" : ""}${data.adoption.githubStars - data.adoption.previousStars} vs previous month)`
        : "";
    lines.push(`**GitHub stars:** ${formatNumber(data.adoption.githubStars)}${trend}`);
  } else {
    lines.push("**GitHub stars:** unavailable");
  }
  lines.push("");
  lines.push("### Channel breakdown");
  lines.push("");
  lines.push("The change compares the newest snapshot of this month with the newest snapshot of the previous month.");
  lines.push("");
  lines.push("| Channel | Count | Change vs last month |");
  lines.push("| --- | --- | --- |");
  for (const channel of data.adoption.channels) {
    const countCell =
      channel.value === "unavailable"
        ? "unavailable"
        : channel.note
          ? `${formatNumber(channel.value)} (${channel.note})`
          : formatNumber(channel.value);
    lines.push(`| ${channel.label} | ${countCell} | ${formatChange(channel.value, channel.previous)} |`);
  }
  lines.push("");
  if (data.adoption.snapshotDate) {
    lines.push(`Methodology and sources: [docs/ADOPTION.md](docs/ADOPTION.md) · Snapshot: [\`metrics/adoption/${data.adoption.snapshotDate}.json\`](metrics/adoption/${data.adoption.snapshotDate}.json)`);
  } else {
    lines.push("Methodology and sources: [docs/ADOPTION.md](docs/ADOPTION.md)");
  }
  lines.push("");

  // Contributors section
  lines.push("## Contributors");
  lines.push("");
  if (data.contributors.isShallow) {
    lines.push("*Note: Contributor counts are partial because the history is shallow.*");
    lines.push("");
  }
  lines.push(`Evergreen is built with contributions from ${data.contributors.totalContributors} authors and co-authors across ${formatNumber(data.contributors.totalCommits)} commits:`);
  lines.push("");
  for (const contributor of data.contributors.contributors) {
    lines.push(`- ${contributor}`);
  }
  lines.push("");

  return lines.join("\n");
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

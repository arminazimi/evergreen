// Maintainer-run quality snapshot for the monthly report. Reads local files only; never uses the network.
//
//   npm run metrics:quality                       # writes metrics/quality/<today>.json
//   node dist/tools/quality-metrics.js --out file.json [--date YYYY-MM-DD]
//
// Numbers come from benchmarks/quality-allowlist.json (debt ceilings the checker keeps equal to the
// measured values), optional lcov.info and artifacts/mutation-report.json, and the Scorecard score
// already recorded in metrics/adoption/. Nothing is collected from users.

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseLcovTotals } from "./coverage-thresholds.js";
import type { Allowlist } from "./check-quality.js";
import { ALLOWLIST_PATH, TARGETS } from "./check-quality.js";
import { escapeTableCell } from "./markdown.js";

export const SCHEMA_VERSION = "evergreen.quality-snapshot.v1";

/** Floors and ceilings published in docs/QUALITY.md / tools/check-quality.ts. */
export const QUALITY_TARGETS = {
  medianLines: TARGETS.medianLines,
  warnLines: TARGETS.warnLines,
  ceilingLines: TARGETS.ceilingLines,
  complexity: TARGETS.complexity,
  coverageLines: 93,
  coverageBranches: 87,
  coverageFunctions: 93,
  mutationBreak: 60,
  mutationHigh: 80,
  scorecardFloor: 6.0,
  explicitAny: 0,
  tsDirectives: 0,
} as const;

export type DocsStatus = "pass" | "partial" | "unavailable";

/** Numeric and status fields one monthly snapshot records for trend comparison. */
export interface QualityCounts {
  filesOverWarn: number;
  functionsOverComplexity: number;
  asUnknownAsFiles: number;
  asUnknownAsCount: number;
  nonNullAssertions: number;
  boundaryViolations: number;
  auditAdvisories: number;
  coverageLines: number | null;
  coverageBranches: number | null;
  coverageFunctions: number | null;
  mutationScore: number | null;
  scorecardScore: number | null;
  docsStatus: DocsStatus;
}

export interface QualitySnapshot {
  schemaVersion: typeof SCHEMA_VERSION;
  date: string;
  targets: typeof QUALITY_TARGETS;
  counts: QualityCounts;
  /** Where each count came from; kept for humans reading the JSON. */
  sources: {
    allowlist: string;
    coverage: string | null;
    mutation: string | null;
    scorecard: string | null;
    docs: string;
  };
}

/** One QUALITY.md criterion as shown in the monthly report. */
export interface QualityTargetRow {
  criterion: string;
  target: string;
  current: string;
  /** Previous-month primary number for trend; null when unavailable. */
  previous: number | null;
  /** Current primary number for trend; null when the row is qualitative or unavailable. */
  value: number | null;
}

export interface QualityMetrics {
  snapshotDate: string | null;
  rows: QualityTargetRow[];
}

export interface CollectQualityOptions {
  qualityDir?: string | undefined;
  allowlistPath?: string | undefined;
  adoptionDir?: string | undefined;
  lcovPath?: string | undefined;
  mutationPath?: string | undefined;
  month?: string | undefined;
  /** When set, build the current month from live local files instead of a snapshot. */
  live?: boolean | undefined;
  date?: string | undefined;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Debt counts from the allowlist; the checker keeps each ceiling equal to the measured value. */
export function countsFromAllowlist(
  allowlist: Allowlist,
): Pick<
  QualityCounts,
  | "filesOverWarn"
  | "functionsOverComplexity"
  | "asUnknownAsFiles"
  | "asUnknownAsCount"
  | "nonNullAssertions"
  | "boundaryViolations"
  | "auditAdvisories"
> {
  return {
    filesOverWarn: allowlist.fileSize.length,
    functionsOverComplexity: allowlist.complexity.length,
    asUnknownAsFiles: allowlist.asUnknownAs.length,
    asUnknownAsCount: sum(allowlist.asUnknownAs.map((entry) => entry.count)),
    nonNullAssertions: sum(allowlist.nonNull.map((entry) => entry.count)),
    boundaryViolations: sum(allowlist.boundaries.map((entry) => entry.count)),
    auditAdvisories: allowlist.audit.length,
  };
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function newestSnapshotForMonth(dir: string, prefix: string): Promise<QualitySnapshot | null> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  const matches = entries
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .sort()
    .reverse();
  for (const name of matches) {
    const snapshot = await readJsonFile<QualitySnapshot>(join(dir, name));
    if (snapshot?.schemaVersion === SCHEMA_VERSION && snapshot.counts) return snapshot;
  }
  return null;
}

async function scorecardFromAdoption(adoptionDir: string): Promise<{ score: number | null; source: string | null }> {
  let entries: string[] = [];
  try {
    entries = await readdir(adoptionDir);
  } catch {
    return { score: null, source: null };
  }
  const matches = entries
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse();
  for (const name of matches) {
    const snapshot = await readJsonFile<{
      metrics?: { scorecardScore?: { status?: string; value?: unknown } };
    }>(join(adoptionDir, name));
    const metric = snapshot?.metrics?.scorecardScore;
    if (metric?.status === "ok" && typeof metric.value === "number") {
      return { score: metric.value, source: join(adoptionDir, name) };
    }
  }
  return { score: null, source: null };
}

async function coverageFromLcov(lcovPath: string): Promise<{
  lines: number | null;
  branches: number | null;
  functions: number | null;
  source: string | null;
}> {
  try {
    const totals = parseLcovTotals(await readFile(lcovPath, "utf8"));
    return {
      lines: round1(totals.lines.percent),
      branches: round1(totals.branches.percent),
      functions: round1(totals.functions.percent),
      source: lcovPath,
    };
  } catch {
    return { lines: null, branches: null, functions: null, source: null };
  }
}

async function mutationFromReport(path: string): Promise<{ score: number | null; source: string | null }> {
  const report = await readJsonFile<{ mutationScore?: unknown; score?: unknown }>(path);
  const raw = report?.mutationScore ?? report?.score;
  return typeof raw === "number" ? { score: raw, source: path } : { score: null, source: null };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Builds a snapshot from local allowlist, optional coverage/mutation files, and adoption Scorecard. */
export async function buildQualitySnapshot(options: {
  date?: string | undefined;
  allowlistPath?: string | undefined;
  adoptionDir?: string | undefined;
  lcovPath?: string | undefined;
  mutationPath?: string | undefined;
}): Promise<QualitySnapshot> {
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const allowlistPath = options.allowlistPath ?? ALLOWLIST_PATH;
  const allowlist = (await readJsonFile<Allowlist>(allowlistPath)) ?? {
    schemaVersion: "evergreen.quality-allowlist.v2",
    fileSize: [],
    functionLength: [],
    complexity: [],
    asUnknownAs: [],
    nonNull: [],
    boundaries: [],
    audit: [],
  };
  const debt = countsFromAllowlist(allowlist);
  const coverage = await coverageFromLcov(options.lcovPath ?? "lcov.info");
  const mutation = await mutationFromReport(options.mutationPath ?? "artifacts/mutation-report.json");
  const scorecard = await scorecardFromAdoption(options.adoptionDir ?? join("metrics", "adoption"));

  return {
    schemaVersion: SCHEMA_VERSION,
    date,
    targets: QUALITY_TARGETS,
    counts: {
      ...debt,
      coverageLines: coverage.lines,
      coverageBranches: coverage.branches,
      coverageFunctions: coverage.functions,
      mutationScore: mutation.score,
      scorecardScore: scorecard.score,
      // Generated docs checks gate CI; site links and accessibility stay report-only (docs/QUALITY.md).
      docsStatus: "partial",
    },
    sources: {
      allowlist: allowlistPath,
      coverage: coverage.source,
      mutation: mutation.source,
      scorecard: scorecard.source,
      docs: "docs/QUALITY.md §8",
    },
  };
}

function formatChange(value: number | null, previous: number | null): string {
  if (value === null || previous === null) return "—";
  const diff = value - previous;
  if (diff === 0) return "0";
  const abs = Math.abs(diff);
  const rendered = Number.isInteger(abs) ? String(abs) : String(round1(abs));
  return `${diff > 0 ? "+" : "-"}${rendered}`;
}

function unavailable(criterion: string, target: string): QualityTargetRow {
  return { criterion, target, current: "unavailable", previous: null, value: null };
}

/** Turns two snapshots into the QUALITY.md target rows for the monthly report. */
export function rowsFromSnapshots(
  current: QualitySnapshot | null,
  previous: QualitySnapshot | null,
): QualityTargetRow[] {
  if (!current) {
    return [
      unavailable(
        "File size",
        `median ≤${QUALITY_TARGETS.medianLines}; none over ${QUALITY_TARGETS.warnLines} without an entry`,
      ),
      unavailable("Complexity", `≤${QUALITY_TARGETS.complexity} per function`),
      unavailable("Type safety", `0 any; 0 @ts-ignore; as unknown as and non-null may not grow`),
      unavailable("Boundaries", "zero violations without an entry"),
      unavailable(
        "Coverage",
        `lines ≥${QUALITY_TARGETS.coverageLines}; branches ≥${QUALITY_TARGETS.coverageBranches}; functions ≥${QUALITY_TARGETS.coverageFunctions}`,
      ),
      unavailable(
        "Mutation score",
        `break at ${QUALITY_TARGETS.mutationBreak}; high at ${QUALITY_TARGETS.mutationHigh}`,
      ),
      unavailable("Docs", "generated checks gate; links and accessibility clean"),
      unavailable("Security", `no high/critical; Scorecard ≥${QUALITY_TARGETS.scorecardFloor}`),
      unavailable("Remaining debt", "allowlist ceilings equal measured values; expire by 2027-01-26"),
    ];
  }

  const c = current.counts;
  const p = previous?.counts;
  const coverageCurrent =
    c.coverageLines !== null && c.coverageBranches !== null && c.coverageFunctions !== null
      ? `${c.coverageLines} / ${c.coverageBranches} / ${c.coverageFunctions}`
      : "unavailable";

  return [
    {
      criterion: "File size",
      target: `median ≤${current.targets.medianLines}; none over ${current.targets.warnLines} without an entry`,
      current: `${c.filesOverWarn} file${c.filesOverWarn === 1 ? "" : "s"} over ${current.targets.warnLines}`,
      value: c.filesOverWarn,
      previous: p?.filesOverWarn ?? null,
    },
    {
      criterion: "Complexity",
      target: `≤${current.targets.complexity} per function`,
      current: `${c.functionsOverComplexity} functions over ${current.targets.complexity}`,
      value: c.functionsOverComplexity,
      previous: p?.functionsOverComplexity ?? null,
    },
    {
      criterion: "Type safety",
      target: "0 any; 0 @ts-ignore; as unknown as and non-null may not grow",
      current: `0 any; ${c.asUnknownAsCount} as unknown as in ${c.asUnknownAsFiles} files; ${c.nonNullAssertions} non-null`,
      value: c.nonNullAssertions,
      previous: p?.nonNullAssertions ?? null,
    },
    {
      criterion: "Boundaries",
      target: "zero violations without an entry",
      current: `${c.boundaryViolations} violation${c.boundaryViolations === 1 ? "" : "s"}`,
      value: c.boundaryViolations,
      previous: p?.boundaryViolations ?? null,
    },
    {
      criterion: "Coverage",
      target: `lines ≥${current.targets.coverageLines}; branches ≥${current.targets.coverageBranches}; functions ≥${current.targets.coverageFunctions}`,
      current: coverageCurrent,
      value: c.coverageLines,
      previous: p?.coverageLines ?? null,
    },
    {
      criterion: "Mutation score",
      target: `break at ${current.targets.mutationBreak}; high at ${current.targets.mutationHigh}`,
      current: c.mutationScore === null ? "not measured" : String(c.mutationScore),
      value: c.mutationScore,
      previous: p?.mutationScore ?? null,
    },
    {
      criterion: "Docs",
      target: "generated checks gate; links and accessibility clean",
      current:
        c.docsStatus === "pass" ? "pass" : c.docsStatus === "partial" ? "partial (links report-only)" : "unavailable",
      value: null,
      previous: null,
    },
    {
      criterion: "Security",
      target: `no high/critical; Scorecard ≥${current.targets.scorecardFloor}`,
      current:
        c.scorecardScore === null
          ? `${c.auditAdvisories} allowlisted advisories; Scorecard unavailable`
          : `${c.auditAdvisories} allowlisted advisories; Scorecard ${c.scorecardScore}`,
      value: c.scorecardScore,
      previous: p?.scorecardScore ?? null,
    },
    {
      criterion: "Remaining debt",
      target: "allowlist ceilings equal measured values; expire by 2027-01-26",
      current: `${c.functionsOverComplexity} over complexity; ${c.nonNullAssertions} non-null`,
      value: c.functionsOverComplexity + c.nonNullAssertions,
      previous: p === undefined ? null : p.functionsOverComplexity + p.nonNullAssertions,
    },
  ];
}

/** Change cell for a row; never treats a missing previous value as zero. */
export function formatQualityChange(row: QualityTargetRow): string {
  return formatChange(row.value, row.previous);
}

/** Markdown lines for the monthly report's Reference quality section. */
export function renderQualitySection(metrics: QualityMetrics): string[] {
  const lines: string[] = [];
  lines.push("## Reference quality");
  lines.push("");
  lines.push(
    "Each row is a target from [docs/QUALITY.md](docs/QUALITY.md). The change compares the newest snapshot of this month with the newest snapshot of the previous month; a dash means one side is unavailable, which is never treated as zero. Lower debt and higher coverage or Scorecard are improvements.",
  );
  lines.push("");
  if (metrics.snapshotDate) {
    lines.push(`*Snapshot: ${metrics.snapshotDate}*`);
    lines.push("");
  }
  lines.push("| Criterion | Target | Current | Change vs last month |");
  lines.push("| --- | --- | --- | --- |");
  for (const row of metrics.rows) {
    lines.push(
      `| ${escapeTableCell(row.criterion)} | ${escapeTableCell(row.target)} | ${escapeTableCell(row.current)} | ${formatQualityChange(row)} |`,
    );
  }
  lines.push("");
  if (metrics.snapshotDate) {
    lines.push(
      `Methodology and targets: [docs/QUALITY.md](docs/QUALITY.md) · Snapshot: [\`metrics/quality/${metrics.snapshotDate}.json\`](metrics/quality/${metrics.snapshotDate}.json)`,
    );
  } else {
    lines.push("Methodology and targets: [docs/QUALITY.md](docs/QUALITY.md)");
  }
  lines.push("");
  return lines;
}

/** Collects quality target rows for the monthly report from metrics/quality snapshots. */
export async function collectQualityMetrics(options: CollectQualityOptions = {}): Promise<QualityMetrics> {
  const qualityDir = options.qualityDir ?? join("metrics", "quality");
  const month = (options.month ?? new Date().toISOString().slice(0, 7)).slice(0, 7);
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const prevMonth = monthNum === 1 ? 12 : monthNum - 1;
  const prevYear = monthNum === 1 ? year - 1 : year;
  const previousMonth = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

  let current = await newestSnapshotForMonth(qualityDir, month);
  if (!current && options.live) {
    current = await buildQualitySnapshot({
      date: options.date ?? `${month}-01`,
      allowlistPath: options.allowlistPath,
      adoptionDir: options.adoptionDir,
      lcovPath: options.lcovPath,
      mutationPath: options.mutationPath,
    });
  }
  const previous = await newestSnapshotForMonth(qualityDir, previousMonth);

  return {
    snapshotDate: current?.date ?? null,
    rows: rowsFromSnapshots(current, previous),
  };
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function main(): Promise<void> {
  const dateOpt = option("--date");
  const outOpt = option("--out");
  const date = dateOpt ?? new Date().toISOString().slice(0, 10);
  const snapshot = await buildQualitySnapshot({ date });
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  const outPath = resolve(outOpt ?? join("metrics", "quality", `${date}.json`));
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, json, "utf8");
  process.stdout.write(`Wrote quality snapshot to ${outPath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

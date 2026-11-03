// Maintainer-run tool. It reads public data from the GitHub API and is never part of a scan or
// `npm run check`.
//
//   node dist/tools/ci-health-report.js [--summary summary.md] [--out metrics/ci/health-<date>.json] [--weeks 4]
//
// It needs the network and a GitHub token (GITHUB_TOKEN, GH_TOKEN, or --token). It reads the last
// 100 completed runs of a workflow, buckets them by ISO week (UTC, by completion time), and
// publishes per week: run count, median and p90 duration, failure rate, cancellation rate, and the
// rerun count — the workflow-level flake signal that complements the per-test flaky list from
// `tools/run-tests.mjs --list-weekly-flaky`. It writes metrics/ci/health-<date>.json and appends a
// Markdown summary; the weekly job in `.github/workflows/ci-health.yml` runs it every Monday.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  durationSeconds,
  durationStats,
  formatDuration,
  type DurationStats,
  type Fetcher,
} from "./ci-duration.js";

// Re-exported so tests and callers can name the shapes this report consumes.
export type { DurationStats, Fetcher } from "./ci-duration.js";

export const SCHEMA_VERSION = "evergreen.ci-health-report.v1";
export const DEFAULT_WORKFLOW = "ci.yml";
export const RUN_LIMIT = 100;
export const DEFAULT_WEEKS = 4;

const USER_AGENT = "evergreen-ci-health-report (+https://github.com/arminazimi/evergreen)";
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** One completed workflow run, trimmed to the fields this report reads. */
export interface HealthRun {
  id: number;
  event: string;
  conclusion: string | null;
  /** True when the run was started more than once (`run_attempt > 1`): the flake signal. */
  attempted: boolean;
  startedAt: string | null;
  endedAt: string | null;
}

/** One ISO week (UTC) of CI history; `week` is the `YYYY-Www` label. */
export interface WeekHealth {
  week: string;
  runs: number;
  duration: DurationStats;
  failures: number;
  cancelled: number;
  reruns: number;
  /** Shares of `runs` between 0 and 1, rounded to four decimals; 0 to 1, never null. */
  failureRate: number;
  cancellationRate: number;
}

export interface CiHealthReport {
  schemaVersion: typeof SCHEMA_VERSION;
  date: string;
  workflow: string;
  /** Completed runs the tool parsed, including any outside the reported weeks. */
  fetched: number;
  weeks: WeekHealth[];
}

export interface SummarizeInput {
  date: string;
  workflow: string;
  runs: readonly HealthRun[];
  /** Keep at most this many of the most recent weeks in the report. */
  limit: number;
}

export interface CollectOptions {
  repo: string;
  workflow: string;
  fetcher: Fetcher;
  token?: string | undefined;
  limit?: number;
}

export interface CommandLineOptions {
  workflow: string;
  repo: string;
  token?: string | undefined;
  summaryPath?: string | undefined;
  outPath: string;
  date: string;
  weeks: number;
}

const defaultFetcher: Fetcher = async (url, headers = {}) => {
  const response = await fetch(url, { headers });
  return { status: response.status, text: await response.text() };
};

function healthHeaders(token: string | undefined): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toHealthRun(value: unknown): HealthRun | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record["id"] !== "number") return undefined;
  const started = optionalString(record["run_started_at"]);
  return {
    id: record["id"],
    event: optionalString(record["event"]) ?? "unknown",
    conclusion: optionalString(record["conclusion"]),
    attempted: typeof record["run_attempt"] === "number" && record["run_attempt"] > 1,
    startedAt: started ?? optionalString(record["created_at"]),
    endedAt: optionalString(record["updated_at"]),
  };
}

export function parseHealthRuns(text: string): HealthRun[] {
  const parsed = JSON.parse(text) as { workflow_runs?: unknown };
  if (!Array.isArray(parsed.workflow_runs)) {
    throw new Error("GitHub response has no workflow_runs array.");
  }
  const runs: HealthRun[] = [];
  for (const entry of parsed.workflow_runs) {
    const run = toHealthRun(entry);
    if (run !== undefined) runs.push(run);
  }
  return runs;
}

/**
 * ISO 8601 week label (`YYYY-Www`, UTC) for a timestamp, or null when it is missing or invalid.
 * The Thursday of a week fixes both its ISO year and its number, so years with 53 weeks and week 1
 * starting in the previous December fall out of the same rule.
 */
export function isoWeekKey(timestamp: string | null): string | null {
  if (timestamp === null) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  date.setUTCHours(0, 0, 0, 0);
  // Move to the Monday of the week, then forward to its Thursday.
  const dayFromMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayFromMonday + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 1));
  const firstDayFromMonday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayFromMonday + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / WEEK_MS);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function roundRate(count: number, total: number): number {
  return Math.round((count / total) * 10000) / 10000;
}

/** Aggregate one week's completed runs into the published numbers. */
export function weekHealth(week: string, runs: readonly HealthRun[]): WeekHealth {
  const durations: number[] = [];
  let failures = 0;
  let cancelled = 0;
  let reruns = 0;
  for (const run of runs) {
    const duration = durationSeconds(run.startedAt, run.endedAt);
    if (duration !== null) durations.push(duration);
    if (run.conclusion === "failure") failures += 1;
    if (run.conclusion === "cancelled") cancelled += 1;
    if (run.attempted) reruns += 1;
  }
  return {
    week,
    runs: runs.length,
    duration: durationStats(durations),
    failures,
    cancelled,
    reruns,
    failureRate: roundRate(failures, runs.length),
    cancellationRate: roundRate(cancelled, runs.length),
  };
}

/** Bucket completed runs by ISO week of their completion time and keep the most recent weeks. */
export function summarizeHealth(input: SummarizeInput): CiHealthReport {
  const byWeek = new Map<string, HealthRun[]>();
  for (const run of input.runs) {
    const week = isoWeekKey(run.endedAt);
    if (week === null) continue;
    const bucket = byWeek.get(week);
    if (bucket !== undefined) {
      bucket.push(run);
    } else {
      byWeek.set(week, [run]);
    }
  }
  // Plain comparison, not localeCompare: the JSON must sort the same way on every host.
  const entries = [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const keep = Math.max(1, Math.floor(input.limit));
  const recent = entries.slice(Math.max(0, entries.length - keep));
  return {
    schemaVersion: SCHEMA_VERSION,
    date: input.date,
    workflow: input.workflow,
    fetched: input.runs.length,
    weeks: recent.map(([week, bucket]) => weekHealth(week, bucket)),
  };
}

/** Rates as one-decimal percentages; JSON keeps the 0-to-1 share for machines. */
export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function renderHealthSummary(report: CiHealthReport): string {
  const lines = [
    "### CI health by week",
    "",
    `Bucketed the last ${report.fetched} completed runs of \`${report.workflow}\` by ISO week (UTC, completion time).`,
    "",
    "Reruns are runs started more than once — the workflow-level flake signal. The per-test view",
    "stays in the weekly flaky list from `tools/run-tests.mjs --list-weekly-flaky`.",
    "",
    "| Week | Runs | p50 | p90 | Failure rate | Cancellation rate | Reruns |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const week of report.weeks) {
    lines.push(
      `| ${week.week} | ${week.runs} | ${formatDuration(week.duration.p50Seconds)} | ` +
        `${formatDuration(week.duration.p90Seconds)} | ${formatRate(week.failureRate)} | ` +
        `${formatRate(week.cancellationRate)} | ${week.reruns} |`,
    );
  }
  if (report.weeks.length === 0) lines.push("| — | 0 | — | — | 0.0% | 0.0% | 0 |");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

/** Reads the newest completed runs of one workflow (no per-run job requests; this report needs none). */
export async function collectCompletedRuns(options: CollectOptions): Promise<HealthRun[]> {
  const limit = options.limit ?? RUN_LIMIT;
  const headers = healthHeaders(options.token);
  const url =
    `https://api.github.com/repos/${options.repo}/actions/workflows/` +
    `${encodeURIComponent(options.workflow)}/runs?status=completed&per_page=${limit}`;
  const response = await options.fetcher(url, headers);
  if (response.status !== 200) {
    throw new Error(`GitHub returned HTTP ${response.status} for ${url}.`);
  }
  return parseHealthRuns(response.text).slice(0, limit);
}

const KNOWN_OPTIONS = new Set(["--workflow", "--repo", "--token", "--summary", "--out", "--date", "--weeks"]);

export function parseArguments(argv: readonly string[], now: Date = new Date()): CommandLineOptions {
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (!arg.startsWith("--") || !KNOWN_OPTIONS.has(arg)) throw new Error(`Unexpected argument "${arg}".`);
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value.`);
    options.set(arg, value);
  }
  const date = options.get("--date") ?? now.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must be YYYY-MM-DD.");
  const weeksRaw = options.get("--weeks");
  if (weeksRaw !== undefined && (!/^\d+$/.test(weeksRaw) || Number(weeksRaw) < 1)) {
    throw new Error("--weeks must be a positive integer.");
  }
  const weeks = weeksRaw === undefined ? DEFAULT_WEEKS : Number(weeksRaw);
  return {
    workflow: options.get("--workflow") ?? DEFAULT_WORKFLOW,
    repo: options.get("--repo") ?? process.env.GITHUB_REPOSITORY ?? "arminazimi/evergreen",
    token: options.get("--token") ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
    summaryPath: options.get("--summary"),
    outPath: resolve(options.get("--out") ?? `metrics/ci/health-${date}.json`),
    date,
    weeks,
  };
}

export async function main(
  argv: string[],
  deps: { fetcher?: Fetcher; now?: Date } = {},
): Promise<number> {
  const options = parseArguments(argv, deps.now);
  const runs = await collectCompletedRuns({
    repo: options.repo,
    workflow: options.workflow,
    fetcher: deps.fetcher ?? defaultFetcher,
    token: options.token,
  });
  const report = summarizeHealth({
    date: options.date,
    workflow: options.workflow,
    runs,
    limit: options.weeks,
  });

  const summary = renderHealthSummary(report);
  if (options.summaryPath) {
    await writeFile(options.summaryPath, summary, { flag: "a" });
  } else {
    process.stdout.write(summary);
  }

  await mkdir(dirname(options.outPath), { recursive: true });
  await writeFile(options.outPath, `${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}

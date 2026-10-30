// Maintainer-run tool. It reads public data from the GitHub API and is never part of a scan or
// `npm run check`.
//
//   node dist/tools/ci-duration.js [--summary summary.md] [--out metrics/ci/<date>.json] [--open-issue]
//
// It needs the network and a GitHub token (GITHUB_TOKEN, GH_TOKEN, or --token). It reads the last
// 50 completed runs of ci.yml, computes p50 and p90 per event and per job, writes
// metrics/ci/<date>.json, and appends a Markdown summary. With --open-issue it opens or updates one
// issue labelled `area: devops` when the pull request p50 is over five minutes.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SCHEMA_VERSION = "evergreen.ci-duration.v1";
export const DEFAULT_WORKFLOW = "ci.yml";
export const RUN_LIMIT = 50;
export const PULL_REQUEST_TARGET_SECONDS = 5 * 60;
export const ISSUE_MARKER = "<!-- evergreen-ci-duration-slow -->";
export const ISSUE_TITLE = "CI pull request p50 is over five minutes";
export const ISSUE_LABEL = "area: devops";

const USER_AGENT = "evergreen-ci-duration (+https://github.com/arminazimi/evergreen)";

export interface WorkflowRun {
  id: number;
  event: string;
  status?: string | null;
  conclusion?: string | null;
  run_started_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WorkflowJob {
  name: string;
  status?: string | null;
  conclusion?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface DurationStats {
  samples: number;
  p50Seconds: number | null;
  p90Seconds: number | null;
}

export interface CiDurationReport {
  schemaVersion: typeof SCHEMA_VERSION;
  date: string;
  workflow: string;
  runs: number;
  pullRequestP50Seconds: number | null;
  slowPullRequests: boolean;
  overall: DurationStats;
  events: Record<string, DurationStats>;
  jobs: Record<string, DurationStats>;
}

export interface FetchResult {
  status: number;
  text: string;
}

export type Fetcher = (url: string, headers?: Record<string, string>) => Promise<FetchResult>;

export interface IssueRecord {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  html_url?: string;
}

export interface IssueClient {
  listOpenIssues(repo: string): Promise<IssueRecord[]>;
  createIssue(repo: string, title: string, body: string, labels: string[]): Promise<IssueRecord>;
  updateIssue(repo: string, number: number, body: string): Promise<IssueRecord>;
}

const defaultFetcher: Fetcher = async (url, headers = {}) => {
  const response = await fetch(url, { headers });
  return { status: response.status, text: await response.text() };
};

function githubHeaders(token: string | undefined): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Percentile with linear interpolation between the nearest ranks. Returns null for no samples,
 * so a missing measurement is never reported as zero.
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  if (!(p >= 0 && p <= 100)) throw new Error("percentile must be between 0 and 100.");
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const low = sorted[lower]!;
  const high = sorted[upper]!;
  return low + (high - low) * (rank - lower);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function durationStats(values: readonly number[]): DurationStats {
  const p50 = percentile(values, 50);
  const p90 = percentile(values, 90);
  return {
    samples: values.length,
    p50Seconds: p50 === null ? null : round1(p50),
    p90Seconds: p90 === null ? null : round1(p90),
  };
}

/** Seconds between two ISO timestamps; null when either is missing, invalid, or out of order. */
export function durationSeconds(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return (to - from) / 1000;
}

export function runDurationSeconds(run: WorkflowRun): number | null {
  return durationSeconds(run.run_started_at ?? run.created_at, run.updated_at);
}

export function jobDurationSeconds(job: WorkflowJob): number | null {
  return durationSeconds(job.started_at, job.completed_at);
}

export function parseRunsResponse(text: string): WorkflowRun[] {
  const parsed = JSON.parse(text) as { workflow_runs?: unknown };
  if (!Array.isArray(parsed.workflow_runs)) {
    throw new Error("GitHub response has no workflow_runs array.");
  }
  return parsed.workflow_runs as WorkflowRun[];
}

export function parseJobsResponse(text: string): WorkflowJob[] {
  const parsed = JSON.parse(text) as { jobs?: unknown };
  if (!Array.isArray(parsed.jobs)) {
    throw new Error("GitHub response has no jobs array.");
  }
  return parsed.jobs as WorkflowJob[];
}

export interface SummarizeInput {
  date: string;
  workflow: string;
  runs: readonly WorkflowRun[];
  jobsByRun: ReadonlyMap<number, readonly WorkflowJob[]>;
}

function sortedStats(values: Map<string, number[]>): Record<string, DurationStats> {
  const result: Record<string, DurationStats> = {};
  // Plain comparison, not localeCompare: the JSON must sort the same way on every host.
  const entries = [...values.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [name, samples] of entries) {
    result[name] = durationStats(samples);
  }
  return result;
}

/** p50/p90 of run durations per event and of job durations per job name. */
export function summarizeWorkflow(input: SummarizeInput): CiDurationReport {
  const runValues: number[] = [];
  const eventValues = new Map<string, number[]>();
  const jobValues = new Map<string, number[]>();

  for (const run of input.runs) {
    const duration = runDurationSeconds(run);
    if (duration === null) continue;
    runValues.push(duration);

    const event = run.event || "unknown";
    const eventSamples = eventValues.get(event) ?? [];
    eventSamples.push(duration);
    eventValues.set(event, eventSamples);

    for (const job of input.jobsByRun.get(run.id) ?? []) {
      if (job.status !== "completed") continue;
      const jobDuration = jobDurationSeconds(job);
      if (jobDuration === null) continue;
      const jobSamples = jobValues.get(job.name) ?? [];
      jobSamples.push(jobDuration);
      jobValues.set(job.name, jobSamples);
    }
  }

  const overall = durationStats(runValues);
  const pullRequestSamples = eventValues.get("pull_request");
  const pullRequestP50 = pullRequestSamples ? percentile(pullRequestSamples, 50) : null;
  return {
    schemaVersion: SCHEMA_VERSION,
    date: input.date,
    workflow: input.workflow,
    runs: overall.samples,
    pullRequestP50Seconds: pullRequestP50 === null ? null : round1(pullRequestP50),
    slowPullRequests: pullRequestP50 !== null && pullRequestP50 > PULL_REQUEST_TARGET_SECONDS,
    overall,
    events: sortedStats(eventValues),
    jobs: sortedStats(jobValues),
  };
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded}s`;
  return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}

function statsRow(scope: string, stats: DurationStats): string {
  return `| ${escapeMarkdownCell(scope)} | ${stats.samples} | ${formatDuration(stats.p50Seconds)} | ${formatDuration(stats.p90Seconds)} |`;
}

export function renderSummary(report: CiDurationReport): string {
  const lines = [
    "### CI duration",
    "",
    `Measured the last ${report.runs} completed run${report.runs === 1 ? "" : "s"} of \`${report.workflow}\`.`,
    "",
    "| Scope | Runs | p50 | p90 |",
    "| --- | ---: | ---: | ---: |",
    statsRow("All runs", report.overall),
    "",
    "#### By event",
    "",
    "| Event | Runs | p50 | p90 |",
    "| --- | ---: | ---: | ---: |",
  ];
  for (const [event, stats] of Object.entries(report.events)) lines.push(statsRow(event, stats));
  if (Object.keys(report.events).length === 0) lines.push("| — | 0 | — | — |");

  lines.push("", "#### By job", "", "| Job | Runs | p50 | p90 |", "| --- | ---: | ---: | ---: |");
  for (const [job, stats] of Object.entries(report.jobs)) lines.push(statsRow(job, stats));
  if (Object.keys(report.jobs).length === 0) lines.push("| — | 0 | — | — |");

  lines.push("");
  if (report.pullRequestP50Seconds === null) {
    lines.push("No completed pull request runs were included.");
  } else if (report.slowPullRequests) {
    lines.push(
      `**The pull request p50 is over the five-minute target: ${formatDuration(report.pullRequestP50Seconds)}.**`,
    );
  } else {
    lines.push(
      `The pull request p50 is within the five-minute target: ${formatDuration(report.pullRequestP50Seconds)}.`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function renderIssueBody(report: CiDurationReport): string {
  const lines = [
    ISSUE_MARKER,
    "",
    `The weekly CI duration check measured the pull request p50 at **${formatDuration(report.pullRequestP50Seconds)}** over the last ${report.runs} completed runs of \`${report.workflow}\`, above the five-minute target.`,
    "",
    "| Scope | Runs | p50 | p90 |",
    "| --- | ---: | ---: | ---: |",
    statsRow("Pull requests", report.events.pull_request ?? report.overall),
    statsRow("All runs", report.overall),
    "",
    "#### Slowest jobs by p90",
    "",
    "| Job | Runs | p50 | p90 |",
    "| --- | ---: | ---: | ---: |",
  ];
  const jobs = Object.entries(report.jobs)
    .sort(([, a], [, b]) => (b.p90Seconds ?? 0) - (a.p90Seconds ?? 0))
    .slice(0, 10);
  for (const [job, stats] of jobs) lines.push(statsRow(job, stats));
  if (jobs.length === 0) lines.push("| — | 0 | — | — |");
  lines.push(
    "",
    "The metric is tracked by [`.github/workflows/ci-health.yml`](.github/workflows/ci-health.yml) and [`tools/ci-duration.ts`](tools/ci-duration.ts).",
    "",
    "_Opened by `tools/ci-duration.ts`._",
    "",
  );
  return lines.join("\n");
}

export function findOpenSlowIssue(issues: readonly IssueRecord[]): IssueRecord | undefined {
  return issues.find(
    (issue) =>
      issue.state === "open" &&
      (issue.title === ISSUE_TITLE || (issue.body ?? "").includes(ISSUE_MARKER)),
  );
}

export async function ensureSlowIssue(
  report: CiDurationReport,
  repo: string,
  client: IssueClient,
): Promise<{ action: "created" | "updated" | "none"; issue?: IssueRecord }> {
  if (!report.slowPullRequests) return { action: "none" };
  const body = renderIssueBody(report);
  const existing = findOpenSlowIssue(await client.listOpenIssues(repo));
  if (existing) {
    return { action: "updated", issue: await client.updateIssue(repo, existing.number, body) };
  }
  return { action: "created", issue: await client.createIssue(repo, ISSUE_TITLE, body, [ISSUE_LABEL]) };
}

export function createGitHubIssueClient(token: string, fetcher: typeof fetch = fetch): IssueClient {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  return {
    async listOpenIssues(repo) {
      const response = await fetcher(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100`, { headers });
      if (!response.ok) throw new Error(`Failed to list issues: HTTP ${response.status}`);
      const issues = (await response.json()) as Array<IssueRecord & { pull_request?: unknown }>;
      return issues.filter((issue) => !issue.pull_request);
    },
    async createIssue(repo, title, body, labels) {
      const response = await fetcher(`https://api.github.com/repos/${repo}/issues`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, labels }),
      });
      if (!response.ok) throw new Error(`Failed to create issue: HTTP ${response.status} ${await response.text()}`);
      return (await response.json()) as IssueRecord;
    },
    async updateIssue(repo, number, body) {
      const response = await fetcher(`https://api.github.com/repos/${repo}/issues/${number}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) throw new Error(`Failed to update issue #${number}: HTTP ${response.status} ${await response.text()}`);
      return (await response.json()) as IssueRecord;
    },
  };
}

export interface CollectOptions {
  repo: string;
  workflow: string;
  fetcher: Fetcher;
  token?: string | undefined;
  limit?: number;
}

export interface CollectedRuns {
  runs: WorkflowRun[];
  jobsByRun: Map<number, WorkflowJob[]>;
}

/** Reads the newest completed runs and the jobs of each run. */
export async function collectRuns(options: CollectOptions): Promise<CollectedRuns> {
  const limit = options.limit ?? RUN_LIMIT;
  const headers = githubHeaders(options.token);
  const runsUrl = `https://api.github.com/repos/${options.repo}/actions/workflows/${encodeURIComponent(options.workflow)}/runs?status=completed&per_page=${limit}`;
  const runsResponse = await options.fetcher(runsUrl, headers);
  if (runsResponse.status !== 200) {
    throw new Error(`GitHub returned HTTP ${runsResponse.status} for ${runsUrl}.`);
  }
  const runs = parseRunsResponse(runsResponse.text).slice(0, limit);
  const jobsByRun = new Map<number, WorkflowJob[]>();
  for (const run of runs) {
    const jobsUrl = `https://api.github.com/repos/${options.repo}/actions/runs/${run.id}/jobs?per_page=100`;
    const jobsResponse = await options.fetcher(jobsUrl, headers);
    if (jobsResponse.status !== 200) {
      throw new Error(`GitHub returned HTTP ${jobsResponse.status} for ${jobsUrl}.`);
    }
    jobsByRun.set(run.id, parseJobsResponse(jobsResponse.text));
  }
  return { runs, jobsByRun };
}

export async function measureCiDuration(options: CollectOptions & { date: string }): Promise<CiDurationReport> {
  const collected = await collectRuns(options);
  return summarizeWorkflow({
    date: options.date,
    workflow: options.workflow,
    runs: collected.runs,
    jobsByRun: collected.jobsByRun,
  });
}

export interface CommandLineOptions {
  workflow: string;
  repo: string;
  token?: string | undefined;
  summaryPath?: string | undefined;
  outPath: string;
  date: string;
  openIssue: boolean;
}

const KNOWN_OPTIONS = new Set(["--workflow", "--repo", "--token", "--summary", "--out", "--date"]);
const KNOWN_FLAGS = new Set(["--open-issue"]);

export function parseArguments(argv: readonly string[], now: Date = new Date()): CommandLineOptions {
  const options = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument "${arg}".`);
    if (KNOWN_FLAGS.has(arg)) {
      flags.add(arg);
      continue;
    }
    if (!KNOWN_OPTIONS.has(arg)) throw new Error(`Unexpected argument "${arg}".`);
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value.`);
    options.set(arg, value);
  }
  const date = options.get("--date") ?? now.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must be YYYY-MM-DD.");
  return {
    workflow: options.get("--workflow") ?? DEFAULT_WORKFLOW,
    repo: options.get("--repo") ?? process.env.GITHUB_REPOSITORY ?? "arminazimi/evergreen",
    token: options.get("--token") ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
    summaryPath: options.get("--summary"),
    outPath: resolve(options.get("--out") ?? `metrics/ci/${date}.json`),
    date,
    openIssue: flags.has("--open-issue"),
  };
}

export async function main(
  argv: string[],
  deps: {
    fetcher?: Fetcher;
    issueClient?: IssueClient;
    now?: Date;
  } = {},
): Promise<number> {
  const options = parseArguments(argv, deps.now);
  const report = await measureCiDuration({
    repo: options.repo,
    workflow: options.workflow,
    date: options.date,
    fetcher: deps.fetcher ?? defaultFetcher,
    token: options.token,
  });

  const summary = renderSummary(report);
  if (options.summaryPath) {
    await writeFile(options.summaryPath, summary, { flag: "a" });
  } else {
    process.stdout.write(summary);
  }

  await mkdir(dirname(options.outPath), { recursive: true });
  await writeFile(options.outPath, `${JSON.stringify(report, null, 2)}\n`);

  if (options.openIssue) {
    if (!options.token && !deps.issueClient) {
      throw new Error("--open-issue needs GITHUB_TOKEN, GH_TOKEN, or --token.");
    }
    const client = deps.issueClient ?? createGitHubIssueClient(options.token!);
    const result = await ensureSlowIssue(report, options.repo, client);
    if (result.action === "created") {
      process.stdout.write(`Opened issue #${result.issue?.number}: ${result.issue?.html_url ?? ""}\n`);
    } else if (result.action === "updated") {
      process.stdout.write(`Updated issue #${result.issue?.number}: ${result.issue?.html_url ?? ""}\n`);
    } else {
      process.stdout.write("Pull request p50 is within the target; no issue opened.\n");
    }
  }

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

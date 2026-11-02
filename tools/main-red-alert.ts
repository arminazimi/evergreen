// Maintainer-run tool. It is never part of a scan or of `npm run check`; it runs from
// `.github/workflows/ci-health.yml` after a `ci.yml` run on `main` completes.
//
//   node dist/tools/main-red-alert.js [--event payload.json] [--repo owner/name] [--token token]
//                                     [--summary summary.md] [--dry-run]
//
// While `main` is red it keeps exactly one open issue: the first failing run opens it, later failing
// runs comment on it, and the first successful run comments with the recovering run and closes it.
// The triggering run's code is never checked out or executed: the workflow starts this tool from
// the default branch and reads only the run's metadata through the API (`actions: read`).
//
// It needs a GitHub token with `actions: read` and `issues: write` (GITHUB_TOKEN, GH_TOKEN, or
// --token). `--dry-run` still reads the open issues to make the same decision, then prints the plan
// instead of writing.

import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const ISSUE_MARKER = "<!-- evergreen-main-red-alert -->";
export const ISSUE_TITLE = "main is red: CI is failing";
export const ISSUE_LABEL = "area: devops";
export const TRACKED_BRANCH = "main";
export const RECOVERY_CONCLUSION = "success";
export const FAILURE_CONCLUSIONS: readonly string[] = ["failure", "timed_out", "startup_failure"];

const USER_AGENT = "evergreen-main-red-alert (+https://github.com/arminazimi/evergreen)";
const API_ROOT = "https://api.github.com";

export interface AlertRun {
  id: number;
  url: string;
  headBranch: string;
  headSha: string;
  event: string;
  conclusion: string;
  attempt: number;
  runNumber: number | null;
  commitMessage: string | null;
}

export type AlertKind = "failure" | "recovery" | "ignore";

export interface FailingJob {
  name: string;
  conclusion: string;
}

export interface WorkflowRunPayload {
  id?: unknown;
  html_url?: unknown;
  head_branch?: unknown;
  head_sha?: unknown;
  event?: unknown;
  conclusion?: unknown;
  run_attempt?: unknown;
  run_number?: unknown;
  head_commit?: { message?: unknown } | null;
}

function stringField(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`The workflow_run payload has no ${field}; pass a completed workflow_run event.`);
  }
  return value;
}

/** Reads the `workflow_run` object of a workflow_run event payload. */
export function parseWorkflowRunEvent(text: string): AlertRun {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The event payload is not valid JSON.");
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("The event payload is not a JSON object.");
  }
  const run = (parsed as { workflow_run?: WorkflowRunPayload }).workflow_run;
  if (run === null || typeof run !== "object") {
    throw new Error("The event payload has no workflow_run object; pass a workflow_run event.");
  }
  if (typeof run.id !== "number" || !Number.isInteger(run.id)) {
    throw new Error("The workflow_run payload has no numeric id.");
  }
  const commit = run.head_commit;
  const message = commit && typeof commit === "object" ? commit.message : undefined;
  return {
    id: run.id,
    url: stringField(run.html_url, "html_url"),
    headBranch: stringField(run.head_branch, "head_branch"),
    headSha: stringField(run.head_sha, "head_sha"),
    event: stringField(run.event, "event"),
    conclusion: stringField(run.conclusion, "conclusion"),
    attempt: typeof run.run_attempt === "number" && run.run_attempt > 0 ? run.run_attempt : 1,
    runNumber: typeof run.run_number === "number" ? run.run_number : null,
    commitMessage: typeof message === "string" ? message : null,
  };
}

export function classifyConclusion(conclusion: string): AlertKind {
  if (FAILURE_CONCLUSIONS.includes(conclusion)) return "failure";
  if (conclusion === RECOVERY_CONCLUSION) return "recovery";
  return "ignore";
}

/** Only a push to the tracked branch describes the branch's own health. */
export function isTrackedRun(run: AlertRun): boolean {
  return run.event === "push" && run.headBranch === TRACKED_BRANCH;
}

export function shouldReconcile(run: AlertRun): boolean {
  return isTrackedRun(run) && classifyConclusion(run.conclusion) !== "ignore";
}

function code(value: string): string {
  return `\`${value.replaceAll("`", "'")}\``;
}

function prose(value: string): string {
  return value.replaceAll("`", "'").replaceAll("\n", " ").trim();
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function runLabel(run: AlertRun): string {
  return `CI run #${run.runNumber ?? run.id}`;
}

function failedJobLines(jobs: readonly FailingJob[], jobsError: string | undefined): string[] {
  if (jobs.length > 0) {
    return jobs.map((job) => `- ${code(job.name)} (${job.conclusion})`);
  }
  if (jobsError) {
    return [`Failing job names are unavailable: ${prose(jobsError)}`];
  }
  return ["No failed job was reported; the workflow may have failed before a job started."];
}

export function renderFailureBody(
  run: AlertRun,
  jobs: readonly FailingJob[],
  jobsError?: string,
): string {
  const lines = [
    ISSUE_MARKER,
    "",
    `\`${TRACKED_BRANCH}\` is red: [${runLabel(run)}](${run.url}) concluded \`${run.conclusion}\` at ${code(shortSha(run.headSha))}.`,
    "",
    "#### Failed jobs",
    "",
    ...failedJobLines(jobs, jobsError),
    "",
  ];
  const message = run.commitMessage?.split("\n")[0]?.trim();
  if (message) lines.push(`- Commit: ${prose(message)}`);
  if (run.attempt > 1) lines.push(`- Attempt: ${run.attempt}`);
  if (message || run.attempt > 1) lines.push("");
  lines.push(
    "_Kept by [`tools/main-red-alert.ts`](tools/main-red-alert.ts) from a completed `ci.yml` run on `main`. It comments on this issue for each failing run and closes it when `main` is green again._",
    "",
  );
  return lines.join("\n");
}

export function renderStillRedComment(
  run: AlertRun,
  jobs: readonly FailingJob[],
  jobsError?: string,
): string {
  const lines = [
    `**\`${TRACKED_BRANCH}\` is still red.** [${runLabel(run)}](${run.url}) concluded \`${run.conclusion}\` at ${code(shortSha(run.headSha))}.`,
    "",
    ...failedJobLines(jobs, jobsError),
    "",
  ];
  return lines.join("\n");
}

export function renderRecoveryComment(run: AlertRun): string {
  return [
    `**\`${TRACKED_BRANCH}\` recovered.** [${runLabel(run)}](${run.url}) succeeded at ${code(shortSha(run.headSha))}. Closing this issue.`,
    "",
  ].join("\n");
}

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
  commentOnIssue(repo: string, number: number, body: string): Promise<void>;
  closeIssue(repo: string, number: number): Promise<IssueRecord>;
}

export interface Fetcher {
  (url: string, headers?: Record<string, string>): Promise<{ status: number; text: string }>;
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

export function parseJobsResponse(text: string): FailingJob[] {
  const parsed = JSON.parse(text) as { jobs?: unknown };
  if (!Array.isArray(parsed.jobs)) {
    throw new Error("GitHub response has no jobs array.");
  }
  const jobs = parsed.jobs as Array<{ name?: unknown; conclusion?: unknown }>;
  return jobs
    .filter(
      (job) =>
        typeof job.name === "string" &&
        typeof job.conclusion === "string" &&
        FAILURE_CONCLUSIONS.includes(job.conclusion),
    )
    .map((job) => ({ name: job.name as string, conclusion: job.conclusion as string }));
}

/** The failed jobs of the run's latest attempt, so a retried run names the current failure. */
export async function fetchFailingJobs(
  repo: string,
  runId: number,
  fetcher: Fetcher,
  token?: string,
): Promise<FailingJob[]> {
  const url = `${API_ROOT}/repos/${repo}/actions/runs/${runId}/jobs?filter=latest&per_page=100`;
  const response = await fetcher(url, githubHeaders(token));
  if (response.status !== 200) {
    throw new Error(`GitHub returned HTTP ${response.status} for the run's jobs.`);
  }
  return parseJobsResponse(response.text);
}

export function findOpenAlertIssue(issues: readonly IssueRecord[]): IssueRecord | undefined {
  return issues.find(
    (issue) =>
      issue.state === "open" &&
      (issue.title === ISSUE_TITLE || (issue.body ?? "").includes(ISSUE_MARKER)),
  );
}

export type ReconcileAction =
  | "created"
  | "commented"
  | "closed"
  | "none"
  | "would-create"
  | "would-comment"
  | "would-close";

export interface ReconcileResult {
  action: ReconcileAction;
  issue?: IssueRecord;
  reason?: string;
}

export interface ReconcileInput {
  run: AlertRun;
  jobs?: readonly FailingJob[];
  jobsError?: string;
  dryRun?: boolean;
}

/** Opens, updates, or closes the one alert issue that describes the current state of `main`. */
export async function reconcile(
  input: ReconcileInput,
  repo: string,
  client: IssueClient,
): Promise<ReconcileResult> {
  const kind = classifyConclusion(input.run.conclusion);
  if (!isTrackedRun(input.run)) {
    return {
      action: "none",
      reason: `ignored: the run is ${input.run.event} on \`${input.run.headBranch}\`, not a push to \`${TRACKED_BRANCH}\`.`,
    };
  }
  if (kind === "ignore") {
    return { action: "none", reason: `ignored: conclusion \`${input.run.conclusion}\` is neither a failure nor a recovery.` };
  }

  const jobs = input.jobs ?? [];
  const existing = findOpenAlertIssue(await client.listOpenIssues(repo));

  if (kind === "failure") {
    if (!existing) {
      const body = renderFailureBody(input.run, jobs, input.jobsError);
      if (input.dryRun) return { action: "would-create" };
      const issue = await client.createIssue(repo, ISSUE_TITLE, body, [ISSUE_LABEL]);
      return { action: "created", issue };
    }
    if (input.dryRun) return { action: "would-comment", issue: existing };
    await client.commentOnIssue(repo, existing.number, renderStillRedComment(input.run, jobs, input.jobsError));
    return { action: "commented", issue: existing };
  }

  if (!existing) {
    return { action: "none", reason: "main is green and no alert issue is open." };
  }
  if (input.dryRun) return { action: "would-close", issue: existing };
  await client.commentOnIssue(repo, existing.number, renderRecoveryComment(input.run));
  return { action: "closed", issue: await client.closeIssue(repo, existing.number) };
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
      const response = await fetcher(`${API_ROOT}/repos/${repo}/issues?state=open&per_page=100`, { headers });
      if (!response.ok) throw new Error(`Failed to list issues: HTTP ${response.status}`);
      const issues = (await response.json()) as Array<IssueRecord & { pull_request?: unknown }>;
      return issues.filter((issue) => !issue.pull_request);
    },
    async createIssue(repo, title, body, labels) {
      const response = await fetcher(`${API_ROOT}/repos/${repo}/issues`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, labels }),
      });
      if (!response.ok) {
        throw new Error(`Failed to create issue: HTTP ${response.status} ${await response.text()}`);
      }
      return (await response.json()) as IssueRecord;
    },
    async commentOnIssue(repo, number, body) {
      const response = await fetcher(`${API_ROOT}/repos/${repo}/issues/${number}/comments`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        throw new Error(`Failed to comment on issue #${number}: HTTP ${response.status} ${await response.text()}`);
      }
    },
    async closeIssue(repo, number) {
      const response = await fetcher(`${API_ROOT}/repos/${repo}/issues/${number}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ state: "closed", state_reason: "completed" }),
      });
      if (!response.ok) {
        throw new Error(`Failed to close issue #${number}: HTTP ${response.status} ${await response.text()}`);
      }
      return (await response.json()) as IssueRecord;
    },
  };
}

export interface CommandLineOptions {
  eventPath: string;
  repo: string;
  token?: string;
  summaryPath?: string;
  dryRun: boolean;
}

const KNOWN_OPTIONS = new Set(["--event", "--repo", "--token", "--summary"]);
const KNOWN_FLAGS = new Set(["--dry-run"]);

export function parseArguments(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
): CommandLineOptions {
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

  const eventPath = options.get("--event") ?? env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("--event or GITHUB_EVENT_PATH is required.");
  const token = options.get("--token") ?? env.GITHUB_TOKEN ?? env.GH_TOKEN;
  return {
    eventPath,
    repo: options.get("--repo") ?? env.GITHUB_REPOSITORY ?? "arminazimi/evergreen",
    ...(token ? { token } : {}),
    ...(options.get("--summary") ? { summaryPath: options.get("--summary")! } : {}),
    dryRun: flags.has("--dry-run"),
  };
}

export function renderSummary(run: AlertRun, result: ReconcileResult): string {
  const lines = ["### Main CI alert", ""];
  lines.push(
    `\`${run.event}\` run on \`${run.headBranch}\`: [${runLabel(run)}](${run.url}) concluded \`${run.conclusion}\`.`,
  );
  switch (result.action) {
    case "created":
      lines.push(`Opened issue #${result.issue?.number}: ${result.issue?.html_url ?? ""}`);
      break;
    case "commented":
      lines.push(`Commented on the open issue #${result.issue?.number}.`);
      break;
    case "closed":
      lines.push(`Commented with the recovering run and closed issue #${result.issue?.number}.`);
      break;
    case "would-create":
      lines.push("Dry run: would open the alert issue.");
      break;
    case "would-comment":
      lines.push(`Dry run: would comment on the open issue #${result.issue?.number}.`);
      break;
    case "would-close":
      lines.push(`Dry run: would comment with the recovering run and close issue #${result.issue?.number}.`);
      break;
    case "none":
      lines.push(`No action: ${result.reason ?? "nothing to do."}`);
      break;
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export interface MainDependencies {
  fetcher?: Fetcher;
  issueClient?: IssueClient;
  readTextFile?: (path: string) => Promise<string>;
}

export async function main(argv: string[], deps: MainDependencies = {}): Promise<number> {
  const options = parseArguments(argv);
  const readTextFile = deps.readTextFile ?? ((path: string) => readFile(path, "utf8"));
  const run = parseWorkflowRunEvent(await readTextFile(options.eventPath));

  if (!shouldReconcile(run)) {
    const result: ReconcileResult = {
      action: "none",
      reason: isTrackedRun(run)
        ? `ignored: conclusion \`${run.conclusion}\` is neither a failure nor a recovery.`
        : `ignored: the run is ${run.event} on \`${run.headBranch}\`, not a push to \`${TRACKED_BRANCH}\`.`,
    };
    const summary = renderSummary(run, result);
    process.stdout.write(summary);
    if (options.summaryPath) await appendFile(options.summaryPath, summary);
    return 0;
  }

  if (!options.token && !deps.issueClient) {
    throw new Error("GITHUB_TOKEN, GH_TOKEN, or --token is required to reconcile the issue.");
  }
  const client = deps.issueClient ?? createGitHubIssueClient(options.token!);

  let jobs: FailingJob[] = [];
  let jobsError: string | undefined;
  if (classifyConclusion(run.conclusion) === "failure") {
    try {
      jobs = await fetchFailingJobs(options.repo, run.id, deps.fetcher ?? defaultFetcher, options.token);
    } catch (error) {
      jobsError = error instanceof Error ? error.message : String(error);
    }
  }

  const result = await reconcile(
    { run, jobs, ...(jobsError ? { jobsError } : {}), ...(options.dryRun ? { dryRun: true } : {}) },
    options.repo,
    client,
  );
  const summary = renderSummary(run, result);
  process.stdout.write(summary);
  if (options.summaryPath) await appendFile(options.summaryPath, summary);
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

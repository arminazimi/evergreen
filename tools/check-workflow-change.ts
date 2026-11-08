// Gates changes to GitHub Actions workflows.
//
// A pull request that changes a workflow under `.github/workflows/` must say why in its body and
// how the change moves the pull-request runner-minute budget (`.github/pull_request_template.md`).
// Independently, the worst case a pull request can consume - per job, `timeout-minutes` times the
// number of matrix jobs, summed over every workflow triggered by `pull_request` - must stay within
// the budget documented in `docs/CI.md`.
//
// Offline: it reads git history, workflow YAML, and the event payload file Actions already writes
// to `GITHUB_EVENT_PATH`. It never calls the network and never runs repository code.
//
//   node dist/tools/check-workflow-change.js [--base origin/main]

import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";

import { changedFiles, type ChangedFile, repositoryRoot, resolveMergeBase } from "./check-decisions.js";

export const DEFAULT_BASE = "origin/main";
export const WORKFLOWS_DIR = ".github/workflows/";
export const TEMPLATE_PATH = ".github/pull_request_template.md";
export const NOTE_HEADING = "## Workflow changes";
export const REASON_LABEL = "Reason:";
export const BUDGET_LABEL = "Budget effect:";
/** A job without `timeout-minutes` is charged the pull-request lane's wall-clock budget. */
export const DEFAULT_JOB_TIMEOUT_MINUTES = 25;
/** Worst-case runner minutes a pull request may consume across every workflow it triggers. */
export const PULL_REQUEST_RUNNER_MINUTE_BUDGET = 350;

export interface WorkflowSource {
  /** Repository-relative path with forward slashes. */
  path: string;
  text: string;
}

export interface JobCost {
  workflow: string;
  job: string;
  /** Matrix jobs the definition expands to. */
  count: number;
  minutesPerJob: number;
  minutes: number;
}

export interface RunnerMinuteReport {
  jobs: JobCost[];
  totalMinutes: number;
  budgetMinutes: number;
  withinBudget: boolean;
}

export interface WorkflowChangeNote {
  /** Whether the body has the "Workflow changes" heading at all. */
  section: boolean;
  reason?: string;
  budgetEffect?: string;
  budgetEffectMinutes?: number;
}

export interface NoteCheck {
  note: WorkflowChangeNote;
  problems: string[];
}

export interface EventContext {
  name: string;
  body?: string;
}

export interface CommandLineOptions {
  base: string;
  /** An explicit `--base` that cannot be resolved is an error, not a local convenience skip. */
  baseExplicit: boolean;
}

export interface Evaluation {
  after: RunnerMinuteReport;
  changedWorkflows: string[];
  beforeMinutes?: number;
  deltaMinutes?: number;
  note?: WorkflowChangeNote;
  noteProblems: string[];
  budgetProblems: string[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- the parsed YAML and event payload are untrusted objects
  return value as Record<string, unknown>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isWorkflowPath(path: string): boolean {
  return path.startsWith(WORKFLOWS_DIR) && (path.endsWith(".yml") || path.endsWith(".yaml"));
}

/** Whether the workflow's top-level `on` includes a pull request event. */
export function triggersOnPullRequest(document: unknown): boolean {
  const on = asRecord(document)?.["on"];
  const events = typeof on === "string" ? [on] : Array.isArray(on) ? on : Object.keys(asRecord(on) ?? {});
  return events.some((event) => event === "pull_request" || event === "pull_request_target");
}

/**
 * Whether a job can run for a pull request. Job-level `if` expressions are read heuristically:
 * an `event_name != 'pull_request'` on its own excludes the job, while `merge_group`/`push`-only
 * conditions do too. Anything else counts, so the total stays an upper bound rather than a guess.
 */
export function jobMayRunOnPullRequest(value: unknown): boolean {
  const condition = asRecord(value)?.["if"];
  if (typeof condition !== "string") return true;
  const compact = condition.replace(/\s+/g, " ").trim();
  if (/event_name\s*==\s*['"]pull_request['"]/.test(compact)) return true;
  if (/event_name\s*!=\s*['"]pull_request['"]/.test(compact) && !compact.includes("||")) return false;
  const nonPullRequestEvent = /event_name\s*==\s*['"](merge_group|push|schedule|workflow_dispatch|workflow_run)['"]/;
  return !(nonPullRequestEvent.test(compact) && !compact.includes("pull_request"));
}

/** Matrix jobs a job definition expands to; dynamic expressions count as one, as do include/exclude. */
export function matrixJobCount(job: Record<string, unknown>): number {
  const matrix = asRecord(asRecord(job["strategy"])?.["matrix"]);
  if (matrix === undefined) return 1;
  let count = 1;
  for (const [key, value] of Object.entries(matrix)) {
    if (key === "include" || key === "exclude") continue;
    if (Array.isArray(value) && value.length > 0) count *= value.length;
  }
  return count;
}

/** `timeout-minutes` for a job, or the pull-request lane budget when it declares none. */
export function jobTimeoutMinutes(job: Record<string, unknown>): number {
  const timeout = job["timeout-minutes"];
  return typeof timeout === "number" && Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_JOB_TIMEOUT_MINUTES;
}

/** The cost of every job one workflow definition can start for a pull request. */
export function workflowJobCosts(source: WorkflowSource): JobCost[] {
  const document: unknown = parseYaml(source.text);
  if (!triggersOnPullRequest(document)) return [];
  const jobs = asRecord(asRecord(document)?.["jobs"]);
  if (jobs === undefined) return [];
  const costs: JobCost[] = [];
  for (const [job, definition] of Object.entries(jobs)) {
    if (!jobMayRunOnPullRequest(definition)) continue;
    const record = asRecord(definition);
    if (record === undefined) continue;
    const count = matrixJobCount(record);
    const minutesPerJob = jobTimeoutMinutes(record);
    costs.push({ workflow: source.path, job, count, minutesPerJob, minutes: count * minutesPerJob });
  }
  return costs;
}

/** Sum of the worst-case runner minutes a pull request can consume. */
export function summarizeRunnerMinutes(
  sources: readonly WorkflowSource[],
  budget = PULL_REQUEST_RUNNER_MINUTE_BUDGET,
): RunnerMinuteReport {
  const jobs = sources
    .flatMap(workflowJobCosts)
    .sort(
      (left, right) =>
        left.workflow.localeCompare(right.workflow) || left.job.localeCompare(right.job) || left.count - right.count,
    );
  const totalMinutes = jobs.reduce((sum, job) => sum + job.minutes, 0);
  return { jobs, totalMinutes, budgetMinutes: budget, withinBudget: totalMinutes <= budget };
}

function workflowFilePath(name: string): string {
  return `${WORKFLOWS_DIR}${name}`;
}

/** Every workflow in the working tree, which is the revision this run is judging. */
export async function readWorkflowsFromDirectory(root: string): Promise<WorkflowSource[]> {
  const directory = join(root, WORKFLOWS_DIR);
  const names = (await readdir(directory).catch(() => [] as string[]))
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
  const sources: WorkflowSource[] = [];
  for (const name of names) {
    sources.push({ path: workflowFilePath(name), text: await readFile(join(directory, name), "utf8") });
  }
  return sources;
}

function gitText(args: readonly string[], root: string): string {
  return execFileSync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Every workflow at the base revision, so the budget effect of the change can be measured. */
export function readWorkflowsFromGit(base: string, root: string): WorkflowSource[] {
  const listed = gitText(["ls-tree", "-r", "--name-only", base, "--", WORKFLOWS_DIR], root)
    .split("\n")
    .filter((path) => path !== "")
    .filter(isWorkflowPath)
    .sort();
  return listed.map((path) => ({ path, text: gitText(["show", `${base}:${path}`], root) }));
}

/** Workflow paths touched by the diff, counting both sides of a rename or copy. */
export function changedWorkflows(files: readonly ChangedFile[]): string[] {
  const paths = new Set<string>();
  for (const file of files) {
    for (const path of file.previousPath === undefined ? [file.path] : [file.previousPath, file.path]) {
      if (isWorkflowPath(path)) paths.add(path);
    }
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
}

/** The `## Workflow changes` section, without the heading line or the next heading. */
export function extractSection(body: string, heading: string): string | undefined {
  const target = heading.trim().toLowerCase();
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === target);
  if (start === -1) return undefined;
  const section: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line.trim())) break;
    section.push(line);
  }
  return section.join("\n").trimEnd();
}

/** The text after a `- Label:` line, ignoring surrounding whitespace. */
export function labeledValue(text: string, label: string): string | undefined {
  const target = label.toLowerCase();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^[-*+]\s+/, "");
    if (!trimmed.toLowerCase().startsWith(target)) continue;
    return trimmed.slice(label.length).trim();
  }
  return undefined;
}

/** Runner minutes a note claims, from `+20`, `-5`, `0`, or `none`. */
export function parseBudgetMinutes(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const normalized = value.replace("−", "-").toLowerCase();
  if (/^(none|no change|unchanged|zero)$/.test(normalized)) return 0;
  const match = normalized.match(/[+-]?\d+(?:\.\d+)?/);
  if (match === null) return undefined;
  const minutes = Number(match[0]);
  return Number.isFinite(minutes) ? minutes : undefined;
}

function isPlaceholder(value: string | undefined): boolean {
  if (value === undefined) return true;
  const trimmed = value.trim();
  if (trimmed === "") return true;
  if (/^<.*>$/.test(trimmed)) return true;
  return /^(todo|tbd|n\/?a)$/i.test(trimmed);
}

export function parseWorkflowChangeNote(body: string): WorkflowChangeNote {
  const section = extractSection(body.replace(/<!--[\s\S]*?-->/g, " "), NOTE_HEADING);
  if (section === undefined) return { section: false };
  const reason = labeledValue(section, REASON_LABEL);
  const budgetEffect = labeledValue(section, BUDGET_LABEL);
  const budgetEffectMinutes = parseBudgetMinutes(budgetEffect);
  return {
    section: true,
    ...(reason === undefined ? {} : { reason }),
    ...(budgetEffect === undefined ? {} : { budgetEffect }),
    ...(budgetEffectMinutes === undefined ? {} : { budgetEffectMinutes }),
  };
}

function formatSigned(minutes: number): string {
  return minutes >= 0 ? `+${minutes}` : `${minutes}`;
}

/** Whether the note the pull request owes is present, filled in, and true. */
export function checkWorkflowNote(body: string | undefined, deltaMinutes: number | undefined): NoteCheck {
  if (body === undefined) {
    return { note: { section: false }, problems: ["the pull request has no body to carry the required note"] };
  }
  const note = parseWorkflowChangeNote(body);
  const problems: string[] = [];
  if (!note.section) {
    problems.push(
      `add a "${NOTE_HEADING}" section to the pull request body, with "Reason:" and "Budget effect:" lines (see ${TEMPLATE_PATH})`,
    );
  } else {
    if (isPlaceholder(note.reason)) {
      problems.push(`state why the workflow changed on the "${REASON_LABEL}" line`);
    }
    if (note.budgetEffectMinutes === undefined) {
      problems.push(
        `state the runner-minute effect on the "${BUDGET_LABEL}" line, for example "+20 runner minutes", "-5", or "none"`,
      );
    } else if (deltaMinutes !== undefined && note.budgetEffectMinutes !== deltaMinutes) {
      problems.push(
        `the note says ${formatSigned(note.budgetEffectMinutes)} runner minutes but the measured change is ${formatSigned(deltaMinutes)}`,
      );
    }
  }
  return { note, problems };
}

/** The event payload file Actions writes; no network, and absent outside Actions. */
export async function readEventContext(env: NodeJS.ProcessEnv = process.env): Promise<EventContext> {
  const name = env["GITHUB_EVENT_NAME"] ?? "";
  const path = env["GITHUB_EVENT_PATH"];
  if (path === undefined || path === "") return { name };
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    const body = asRecord(asRecord(parsed)?.["pull_request"])?.["body"];
    return typeof body === "string" ? { name, body } : { name };
  } catch {
    return { name };
  }
}

export function parseArguments(argv: readonly string[]): CommandLineOptions {
  let base = DEFAULT_BASE;
  let baseExplicit = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--base") throw new Error(`Unknown argument "${String(argument)}".`);
    const value = argv[index + 1];
    if (value === undefined || value === "" || value.startsWith("--")) throw new Error("--base needs a value.");
    base = value;
    baseExplicit = true;
    index += 1;
  }
  return { base, baseExplicit };
}

/** Measure both revisions and check the note; a missing base is reported, not guessed. */
export async function evaluate(options: CommandLineOptions, env: NodeJS.ProcessEnv = process.env): Promise<Evaluation> {
  const root = repositoryRoot();
  const after = summarizeRunnerMinutes(await readWorkflowsFromDirectory(root));
  const budgetProblems = after.withinBudget
    ? []
    : [
        `the pull-request lane can consume ${after.totalMinutes} runner minutes, above the ${after.budgetMinutes}-minute budget`,
      ];
  const event = await readEventContext(env);
  const evaluation: Evaluation = { after, changedWorkflows: [], noteProblems: [], budgetProblems };
  try {
    const mergeBase = resolveMergeBase(options.base, root);
    const files = changedFiles(mergeBase, root);
    const changed = changedWorkflows(files);
    const beforeMinutes = summarizeRunnerMinutes(readWorkflowsFromGit(mergeBase, root)).totalMinutes;
    evaluation.beforeMinutes = beforeMinutes;
    evaluation.changedWorkflows = changed;
    evaluation.deltaMinutes = after.totalMinutes - beforeMinutes;
    if (event.name === "pull_request" && changed.length > 0) {
      const checked = checkWorkflowNote(event.body, evaluation.deltaMinutes);
      evaluation.note = checked.note;
      evaluation.noteProblems = checked.problems;
    }
  } catch (error) {
    if (options.baseExplicit) throw error;
    process.stdout.write(`Skipped the workflow diff: ${errorMessage(error)}\n`);
  }
  return evaluation;
}

export function renderRunnerMinutes(report: RunnerMinuteReport): string {
  const status = report.withinBudget ? "PASS" : "FAIL";
  const lines = [
    `Pull-request runner minutes (worst case): ${report.totalMinutes} of ${report.budgetMinutes} (${status})`,
  ];
  const ordered = [...report.jobs].sort(
    (left, right) => right.minutes - left.minutes || left.job.localeCompare(right.job),
  );
  for (const job of ordered) {
    lines.push(`  ${job.workflow} ${job.job}: ${job.count} × ${job.minutesPerJob} = ${job.minutes}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderChangeSummary(evaluation: Evaluation): string {
  const lines: string[] = [];
  if (evaluation.changedWorkflows.length > 0) {
    lines.push(`Workflow files changed: ${evaluation.changedWorkflows.join(", ")}`);
  } else {
    lines.push("No workflow file changed.");
  }
  if (evaluation.beforeMinutes !== undefined && evaluation.deltaMinutes !== undefined) {
    lines.push(
      `Runner minutes before: ${evaluation.beforeMinutes}; after: ${evaluation.after.totalMinutes}; change: ${formatSigned(evaluation.deltaMinutes)}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export async function main(argv: readonly string[]): Promise<number> {
  const options = parseArguments(argv);
  const evaluation = await evaluate(options);
  process.stdout.write(`${renderRunnerMinutes(evaluation.after)}\n${renderChangeSummary(evaluation)}`);
  const problems = [...evaluation.budgetProblems, ...evaluation.noteProblems];
  for (const problem of problems) process.stdout.write(`::error::${problem}\n`);
  if (problems.length === 0) {
    process.stdout.write("Workflow changes and the runner-minute budget hold.\n");
  }
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${errorMessage(error)}\n`);
      process.exit(2);
    },
  );
}

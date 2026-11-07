import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { Detector } from "./sdk.js";
import type { Finding, Severity } from "./domain.js";
import { severityValues } from "./domain.js";
import { personalDirectory } from "./init-personal.js";
import { scanRepository } from "./engine/index.js";
import { TREEMAP_SEVERITY_WEIGHT } from "./treemap.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Per-project risk snapshot stored for board trends between runs. */
export interface WatchProjectSummary {
  score: number;
  bySeverity: Record<Severity, number>;
  nextDeadline?: string;
}

/** ▲ risk went up, ▼ risk went down, ● unchanged or no prior summary. */
export type WatchTrend = "worse" | "better" | "same";

interface WatchState {
  projects: string[];
  /** One key per finding in the last digest: project, finding ID, and deadline. A changed deadline is a new key. */
  seen: string[];
  /** When the last digest ran (ISO timestamp). */
  lastDigest?: string;
  /**
   * Severity-weighted summary per absolute project path from the last board (or digest) scan.
   * Absent on older state files; the board then shows ● for every project.
   */
  summaries?: Record<string, WatchProjectSummary>;
}

export interface WatchChange {
  project: string;
  finding: Finding;
}

export interface WatchDigest {
  schemaVersion: "evergreen.watch.v1";
  /** False when `weekly` was set and the last digest is less than a week old; nothing was scanned. */
  ran: boolean;
  projects: number;
  changes: WatchChange[];
  /** Registered projects that could not be scanned, with the reason. */
  failed: Array<{ project: string; reason: string }>;
}

export interface WatchOptions {
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

/** Projects and prior summaries the board needs; digest keys stay out of the board write path. */
export interface WatchBoardState {
  projects: string[];
  summaries: Record<string, WatchProjectSummary>;
}

export function watchStateFile(env: NodeJS.ProcessEnv = process.env): string {
  return join(personalDirectory(env), "watch.json");
}

function emptySeverities(): Record<Severity, number> {
  return { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseSeverityCounts(raw: unknown): Record<Severity, number> | undefined {
  if (!isRecord(raw)) return undefined;
  const bySeverity = emptySeverities();
  for (const severity of severityValues) {
    const value = raw[severity];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
    bySeverity[severity] = value;
  }
  return bySeverity;
}

function parseSummary(raw: unknown): WatchProjectSummary | undefined {
  if (!isRecord(raw)) return undefined;
  if (typeof raw.score !== "number" || !Number.isFinite(raw.score)) return undefined;
  const bySeverity = parseSeverityCounts(raw.bySeverity);
  if (bySeverity === undefined) return undefined;
  const nextDeadline = raw.nextDeadline;
  if (nextDeadline !== undefined && typeof nextDeadline !== "string") return undefined;
  return {
    score: raw.score,
    bySeverity,
    ...(nextDeadline === undefined ? {} : { nextDeadline }),
  };
}

function parseSummaries(raw: unknown): Record<string, WatchProjectSummary> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) return undefined;
  const out: Record<string, WatchProjectSummary> = {};
  for (const [project, value] of Object.entries(raw)) {
    const summary = parseSummary(value);
    if (summary !== undefined) out[project] = summary;
  }
  return out;
}

/** Severity-weighted score and next deadline for one project's findings. */
export function summarizeFindings(findings: readonly Finding[]): WatchProjectSummary {
  const bySeverity = emptySeverities();
  for (const finding of findings) bySeverity[finding.severity] += 1;
  let score = 0;
  for (const severity of severityValues) score += bySeverity[severity] * TREEMAP_SEVERITY_WEIGHT[severity];
  const nextDeadline = findings
    .map((finding) => finding.deadline)
    .filter((deadline): deadline is string => deadline !== undefined)
    .sort((left, right) => left.localeCompare(right))[0];
  return {
    score,
    bySeverity,
    ...(nextDeadline === undefined ? {} : { nextDeadline }),
  };
}

async function readState(env: NodeJS.ProcessEnv): Promise<WatchState> {
  try {
    const parsed = JSON.parse(await readFile(watchStateFile(env), "utf8")) as Partial<WatchState>;
    const summaries = parseSummaries(parsed.summaries);
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects.filter((entry) => typeof entry === "string") : [],
      seen: Array.isArray(parsed.seen) ? parsed.seen.filter((entry) => typeof entry === "string") : [],
      ...(typeof parsed.lastDigest === "string" ? { lastDigest: parsed.lastDigest } : {}),
      ...(summaries === undefined ? {} : { summaries }),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { projects: [], seen: [] };
    throw new Error(
      `${watchStateFile(env)} is not readable (${error instanceof Error ? error.message : String(error)}); fix or delete it.`,
    );
  }
}

async function writeState(env: NodeJS.ProcessEnv, state: WatchState): Promise<void> {
  const file = watchStateFile(env);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
}

/** The registered projects and any stored summaries; missing summaries become an empty map. */
export async function loadWatchBoardState(options: WatchOptions = {}): Promise<WatchBoardState> {
  const state = await readState(options.env ?? process.env);
  return { projects: state.projects, summaries: state.summaries ?? {} };
}

/** Persist board summaries without touching digest keys. */
export async function writeWatchSummaries(
  summaries: Record<string, WatchProjectSummary>,
  options: WatchOptions = {},
): Promise<void> {
  const env = options.env ?? process.env;
  const state = await readState(env);
  await writeState(env, { ...state, summaries });
}

/** The registered projects, sorted. */
export async function listWatched(options: WatchOptions = {}): Promise<string[]> {
  return (await readState(options.env ?? process.env)).projects;
}

/** Registers a project for the digest; returns false when it was already registered. */
export async function addWatched(path: string, options: WatchOptions = {}): Promise<boolean> {
  const env = options.env ?? process.env;
  const state = await readState(env);
  const project = resolve(path);
  if (state.projects.includes(project)) return false;
  await writeState(env, {
    ...state,
    projects: [...state.projects, project].sort((left, right) => left.localeCompare(right)),
  });
  return true;
}

/** Stops watching a project; returns false when it was not registered. */
export async function removeWatched(path: string, options: WatchOptions = {}): Promise<boolean> {
  const env = options.env ?? process.env;
  const state = await readState(env);
  const project = resolve(path);
  if (!state.projects.includes(project)) return false;
  const summaries = state.summaries === undefined ? undefined : { ...state.summaries };
  if (summaries !== undefined) delete summaries[project];
  await writeState(env, {
    ...state,
    projects: state.projects.filter((entry) => entry !== project),
    seen: state.seen.filter((key) => !key.startsWith(`${project}\n`)),
    ...(summaries === undefined ? {} : { summaries }),
  });
  return true;
}

function keyOf(project: string, finding: Finding): string {
  return [project, finding.id, finding.deadline ?? ""].join("\n");
}

/**
 * Re-scans every registered project and returns only the findings that were not in the previous digest, so a new
 * end-of-life date shows up once. With `weekly`, it does nothing until a week has passed since the last digest.
 */
export async function runWatch(
  detectors: readonly Detector[],
  options: WatchOptions & { weekly?: boolean } = {},
): Promise<WatchDigest> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const state = await readState(env);
  const base = { schemaVersion: "evergreen.watch.v1", projects: state.projects.length } as const;
  if (options.weekly && state.lastDigest && now.getTime() - Date.parse(state.lastDigest) < WEEK_MS) {
    return { ...base, ran: false, changes: [], failed: [] };
  }

  const known = new Set(state.seen);
  const changes: WatchChange[] = [];
  const failed: WatchDigest["failed"] = [];
  const current: string[] = [];
  const summaries: Record<string, WatchProjectSummary> = { ...(state.summaries ?? {}) };
  for (const project of state.projects) {
    try {
      const result = await scanRepository(project, detectors);
      summaries[project] = summarizeFindings(result.findings);
      for (const finding of result.findings) {
        const key = keyOf(project, finding);
        current.push(key);
        if (!known.has(key)) changes.push({ project, finding });
      }
    } catch (error) {
      failed.push({ project, reason: error instanceof Error ? error.message : String(error) });
      // Keep what was already reported for a project that could not be scanned, so it is not reported again later.
      current.push(...state.seen.filter((key) => key.startsWith(`${project}\n`)));
    }
  }
  await writeState(env, {
    ...state,
    seen: [...new Set(current)].sort(),
    lastDigest: now.toISOString(),
    summaries,
  });
  return { ...base, ran: true, changes, failed };
}

export function renderWatchText(digest: WatchDigest): string {
  if (!digest.ran) return "The last digest is less than a week old; nothing to report yet.";
  if (digest.projects === 0) return "No projects are watched. Add one with `evergreen watch add <path>`.";
  const lines: string[] = [];
  if (digest.changes.length === 0)
    lines.push(
      `No changes since the last digest (${digest.projects} ${digest.projects === 1 ? "project" : "projects"}).`,
    );
  else {
    lines.push(
      `${digest.changes.length} new ${digest.changes.length === 1 ? "finding" : "findings"} since the last digest:`,
    );
    for (const { project, finding } of digest.changes) {
      lines.push(
        `- ${project}: [${finding.severity}] ${finding.title}${finding.deadline ? ` (deadline ${finding.deadline})` : ""} at ${finding.location.path}`,
      );
    }
  }
  for (const entry of digest.failed) lines.push(`Could not scan ${entry.project}: ${entry.reason}`);
  return lines.join("\n");
}

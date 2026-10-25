import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { Detector } from "./sdk.js";
import type { Finding } from "./domain.js";
import { personalDirectory } from "./init-personal.js";
import { scanRepository } from "./engine.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface WatchState {
  projects: string[];
  /** One key per finding in the last digest: project, finding ID, and deadline. A changed deadline is a new key. */
  seen: string[];
  /** When the last digest ran (ISO timestamp). */
  lastDigest?: string;
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

export function watchStateFile(env: NodeJS.ProcessEnv = process.env): string {
  return join(personalDirectory(env), "watch.json");
}

async function readState(env: NodeJS.ProcessEnv): Promise<WatchState> {
  try {
    const parsed = JSON.parse(await readFile(watchStateFile(env), "utf8")) as Partial<WatchState>;
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects.filter((entry) => typeof entry === "string") : [],
      seen: Array.isArray(parsed.seen) ? parsed.seen.filter((entry) => typeof entry === "string") : [],
      ...(typeof parsed.lastDigest === "string" ? { lastDigest: parsed.lastDigest } : {}),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { projects: [], seen: [] };
    throw new Error(`${watchStateFile(env)} is not readable (${error instanceof Error ? error.message : String(error)}); fix or delete it.`);
  }
}

async function writeState(env: NodeJS.ProcessEnv, state: WatchState): Promise<void> {
  const file = watchStateFile(env);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
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
  await writeState(env, { ...state, projects: [...state.projects, project].sort((left, right) => left.localeCompare(right)) });
  return true;
}

/** Stops watching a project; returns false when it was not registered. */
export async function removeWatched(path: string, options: WatchOptions = {}): Promise<boolean> {
  const env = options.env ?? process.env;
  const state = await readState(env);
  const project = resolve(path);
  if (!state.projects.includes(project)) return false;
  await writeState(env, { ...state, projects: state.projects.filter((entry) => entry !== project), seen: state.seen.filter((key) => !key.startsWith(`${project}\n`)) });
  return true;
}

function keyOf(project: string, finding: Finding): string {
  return [project, finding.id, finding.deadline ?? ""].join("\n");
}

/**
 * Re-scans every registered project and returns only the findings that were not in the previous digest, so a new
 * end-of-life date shows up once. With `weekly`, it does nothing until a week has passed since the last digest.
 */
export async function runWatch(detectors: readonly Detector[], options: WatchOptions & { weekly?: boolean } = {}): Promise<WatchDigest> {
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
  for (const project of state.projects) {
    try {
      const result = await scanRepository(project, detectors);
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
  await writeState(env, { ...state, seen: [...new Set(current)].sort(), lastDigest: now.toISOString() });
  return { ...base, ran: true, changes, failed };
}

export function renderWatchText(digest: WatchDigest): string {
  if (!digest.ran) return "The last digest is less than a week old; nothing to report yet.";
  if (digest.projects === 0) return "No projects are watched. Add one with `evergreen watch add <path>`.";
  const lines: string[] = [];
  if (digest.changes.length === 0) lines.push(`No changes since the last digest (${digest.projects} ${digest.projects === 1 ? "project" : "projects"}).`);
  else {
    lines.push(`${digest.changes.length} new ${digest.changes.length === 1 ? "finding" : "findings"} since the last digest:`);
    for (const { project, finding } of digest.changes) {
      lines.push(`- ${project}: [${finding.severity}] ${finding.title}${finding.deadline ? ` (deadline ${finding.deadline})` : ""} at ${finding.location.path}`);
    }
  }
  for (const entry of digest.failed) lines.push(`Could not scan ${entry.project}: ${entry.reason}`);
  return lines.join("\n");
}

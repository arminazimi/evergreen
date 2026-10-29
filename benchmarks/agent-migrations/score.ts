/**
 * Objective success criteria for one agent migration attempt from the harness in `run.ts`.
 *
 * A condition succeeds only when all three hold:
 * 1. Finding resolved — the task's expected end-state checks passed.
 * 2. Verification passes — every verification command exited 0.
 * 3. No unrelated changes — every path in the agent's diff is in the allowed set.
 *
 * The allowed set is the finding path, every expected-end-state check path, any caller-supplied
 * `relatedPaths` (typically a migration packet's `affectedFiles`), and known companion lockfiles
 * that sit next to those manifests (Cargo.lock, go.sum, yarn.lock, and the rest below).
 *
 * Scoring is pure and offline: it never runs the agent, never scans, and never uses the network.
 */

import { posix } from "node:path";

import type { ConditionResult, MigrationCondition, MigrationTask } from "./run.js";

/** Lockfiles that update when the matching manifest in the same directory changes. */
const COMPANION_LOCKFILES: Readonly<Record<string, readonly string[]>> = {
  "Cargo.toml": ["Cargo.lock"],
  "go.mod": ["go.sum"],
  "package.json": [
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lock",
    "bun.lockb",
    "npm-shrinkwrap.json",
  ],
  "composer.json": ["composer.lock"],
  Gemfile: ["Gemfile.lock"],
};

export interface MigrationScoreInput {
  findingPath: string;
  /** Paths named by the task's expected end-state checks. */
  checkPaths: readonly string[];
  findingResolved: boolean;
  verificationPassed: boolean;
  changedFiles: readonly string[];
  /**
   * Extra paths the migration may touch (packet `affectedFiles`, usage sites, and so on).
   * Companion lockfiles for these paths are allowed automatically.
   */
  relatedPaths?: readonly string[];
}

export interface MigrationScore {
  findingResolved: boolean;
  verificationPassed: boolean;
  noUnrelatedChanges: boolean;
  /** Changed paths that fall outside the allowed set; empty when `noUnrelatedChanges` is true. */
  unrelatedFiles: string[];
  /** True only when all three criteria hold. */
  success: boolean;
}

export interface ScoredCondition {
  condition: MigrationCondition;
  score: MigrationScore;
}

export interface MigrationRunScore {
  taskId: string;
  conditions: ScoredCondition[];
}

export interface MigrationScoreRates {
  attempts: number;
  successes: number;
  successRate: number;
  findingResolved: number;
  verificationPassed: number;
  noUnrelatedChanges: number;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

/** Byte-wise path order so scores stay identical across locales. */
function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function companionLockfiles(manifestPath: string): string[] {
  const normalized = normalizePath(manifestPath);
  const companions = COMPANION_LOCKFILES[posix.basename(normalized)];
  if (companions === undefined) return [];
  const directory = posix.dirname(normalized);
  return companions.map((name) => (directory === "." ? name : posix.join(directory, name)));
}

/** Paths the agent may change without failing the unrelated-changes criterion. */
export function allowedChangePaths(input: {
  findingPath: string;
  checkPaths?: readonly string[];
  relatedPaths?: readonly string[];
}): string[] {
  const seeds = new Set<string>();
  for (const path of [input.findingPath, ...(input.checkPaths ?? []), ...(input.relatedPaths ?? [])]) {
    const normalized = normalizePath(path);
    if (normalized.length === 0) continue;
    seeds.add(normalized);
    for (const companion of companionLockfiles(normalized)) seeds.add(companion);
  }
  return [...seeds].sort(comparePaths);
}

/**
 * Score one migration attempt against the three objective criteria.
 * Rates and comparisons across agents belong in the published report (#245), not here.
 */
export function scoreMigration(input: MigrationScoreInput): MigrationScore {
  const allowed = new Set(
    allowedChangePaths({
      findingPath: input.findingPath,
      checkPaths: input.checkPaths,
      ...(input.relatedPaths === undefined ? {} : { relatedPaths: input.relatedPaths }),
    }),
  );
  const unrelatedFiles = [
    ...new Set(input.changedFiles.map(normalizePath).filter((path) => path.length > 0 && !allowed.has(path))),
  ].sort(comparePaths);
  const findingResolved = input.findingResolved;
  const verificationPassed = input.verificationPassed;
  const noUnrelatedChanges = unrelatedFiles.length === 0;
  return {
    findingResolved,
    verificationPassed,
    noUnrelatedChanges,
    unrelatedFiles,
    success: findingResolved && verificationPassed && noUnrelatedChanges,
  };
}

/** Score one harness condition using the task's finding and end-state paths. */
export function scoreCondition(
  task: Pick<MigrationTask, "finding" | "expectedEndState">,
  condition: Pick<ConditionResult, "expectedEndState" | "verification" | "diff">,
  options?: { relatedPaths?: readonly string[] },
): MigrationScore {
  return scoreMigration({
    findingPath: task.finding.path,
    checkPaths: task.expectedEndState.checks.map((check) => check.path),
    findingResolved: condition.expectedEndState.passed,
    verificationPassed: condition.verification.passed,
    changedFiles: condition.diff.changedFiles,
    ...(options?.relatedPaths === undefined ? {} : { relatedPaths: options.relatedPaths }),
  });
}

/** Score every condition in a harness run result. */
export function scoreMigrationRun(
  task: Pick<MigrationTask, "id" | "finding" | "expectedEndState">,
  result: {
    taskId: string;
    conditions: ReadonlyArray<
      Pick<ConditionResult, "condition" | "expectedEndState" | "verification" | "diff">
    >;
  },
  options?: { relatedPaths?: readonly string[] },
): MigrationRunScore {
  return {
    taskId: result.taskId || task.id,
    conditions: result.conditions.map((condition) => ({
      condition: condition.condition,
      score: scoreCondition(task, condition, options),
    })),
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

/** Aggregate rates over scored conditions (one arm, many tasks, or a mixed list). */
export function summarizeScores(scores: readonly MigrationScore[]): MigrationScoreRates {
  let successes = 0;
  let findingResolved = 0;
  let verificationPassed = 0;
  let noUnrelatedChanges = 0;
  for (const score of scores) {
    if (score.success) successes += 1;
    if (score.findingResolved) findingResolved += 1;
    if (score.verificationPassed) verificationPassed += 1;
    if (score.noUnrelatedChanges) noUnrelatedChanges += 1;
  }
  const attempts = scores.length;
  return {
    attempts,
    successes,
    successRate: ratio(successes, attempts),
    findingResolved,
    verificationPassed,
    noUnrelatedChanges,
  };
}

/** Success rate for one harness condition across many scored runs. */
export function rateByCondition(
  scored: ReadonlyArray<Pick<ScoredCondition, "condition" | "score">>,
): Record<MigrationCondition, MigrationScoreRates> {
  const groups: Record<MigrationCondition, MigrationScore[]> = { baseline: [], packet: [] };
  for (const entry of scored) {
    groups[entry.condition].push(entry.score);
  }
  return {
    baseline: summarizeScores(groups.baseline),
    packet: summarizeScores(groups.packet),
  };
}

// Maintainer-only network tool. It is intentionally not wired into npm scripts or scans.
//
//   npm run build --silent
//   node dist/benchmarks/mining/review.js [--reviewer NAME] [--refresh]
//
// Reviews every mined candidate that is not in benchmarks/mining/review-log.json yet, using the
// criteria in queries.md ("How a commit proves ground truth"), and records an accepted or rejected
// decision with the reasons. Every decision comes from checks on evidence fetched from GitHub, so a
// reader can see why a candidate was kept or dropped. Only GitHub Actions candidates are supported.

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { isIsoDate } from "../../src/registry.js";

const run = promisify(execFile);

export const REVIEW_LOG_SCHEMA = "evergreen.migration-review-log.v1" as const;

export interface Candidate {
  schemaVersion: "evergreen.migration-candidate.v1";
  id: string;
  repository: string;
  parentCommit: string;
  migrationCommit: string;
  ruleId: string;
  before: { ruleId: string; path: string; line?: number }[];
  after: { ruleId: string; path: string; line?: number }[];
  evidence: { kind: "migration-commit"; url: string; query: string };
}

/** What GitHub says about a migration commit and its repository. */
export interface Evidence {
  message: string | null;
  parents: string[];
  files: { filename: string; patch: string }[];
  repo: { private?: boolean; fork?: boolean; archived?: boolean };
  /** SPDX identifier from GitHub's license detection, or null when the repository has no license. */
  license: string | null;
}

export interface ActionHint {
  action: string;
  supportedFromMajor: number;
}

export interface Checks {
  parentReportsRule: boolean;
  migrationClearsRule: boolean;
  singleParent: boolean;
  directMigration: boolean;
  intentStated: boolean;
  licensed: boolean;
  publicAndActive: boolean;
}

export interface ReviewEntry {
  candidate: string;
  repository: string;
  parentCommit: string;
  migrationCommit: string;
  ruleId: string;
  decision: "accepted" | "rejected";
  reviewer: string;
  reviewedAt: string;
  license: string | null;
  checks: Checks;
  reasons: string[];
}

export interface ReviewLog {
  schemaVersion: typeof REVIEW_LOG_SCHEMA;
  method: string;
  entries: ReviewEntry[];
}

export const METHOD =
  "Evidence for each candidate (commit message and diff, repository visibility and license) was fetched from the GitHub API and checked against the criteria in queries.md by benchmarks/mining/review.ts. The decision is accepted only when every check holds; every rejection names the checks that failed.";

const REFERENCE = /uses:\s*["']?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s"'#]+)(?:\s*#\s*(\S+))?/;

function majorOf(reference: { ref: string; comment: string | undefined }): number | undefined {
  const match = /^v?(\d+)/.exec(reference.ref) ?? (reference.comment ? /^v?(\d+)/.exec(reference.comment) : null);
  return match ? Number(match[1]) : undefined;
}

function reference(line: string): { action: string; ref: string; comment: string | undefined } | undefined {
  const match = REFERENCE.exec(line);
  return match ? { action: match[1]!, ref: match[2]!, comment: match[3] } : undefined;
}

/**
 * Counts the places where the diff moves the action from a major the rule reports to one it accepts,
 * in a file the scan reported. A pin to a commit counts when its trailing comment names the new major.
 */
export function countMigrations(files: Evidence["files"], reported: Set<string>, hint: ActionHint): number {
  let moves = 0;
  for (const file of files) {
    if (!reported.has(file.filename)) continue;
    const lines = file.patch.split("\n").filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line));
    const added = lines.filter((line) => line.startsWith("+")).map(reference).filter((entry) => entry?.action === hint.action);
    const unused = [...added];
    for (const line of lines.filter((candidate) => candidate.startsWith("-"))) {
      const old = reference(line);
      const oldMajor = old?.action === hint.action ? majorOf(old) : undefined;
      if (oldMajor === undefined || oldMajor >= hint.supportedFromMajor) continue;
      const index = unused.findIndex((next) => (majorOf(next!) ?? 0) >= hint.supportedFromMajor);
      if (index >= 0) {
        unused.splice(index, 1);
        moves++;
      }
    }
  }
  return moves;
}

/** True when the message uses a bump verb and names the action, the Node.js runtime, or the new version. */
export function statesIntent(message: string | null, hint: ActionHint): boolean {
  if (!message) return false;
  const text = message.toLowerCase();
  const name = hint.action.split("/")[1]!.toLowerCase();
  return /\b(bump|upgrade|update|migrate|move)/.test(text) && (text.includes(name) || /node(\.js)?\s?(20|24)/.test(text) || /\bv?\d+\s*(to|→|->)\s*v?\d+/.test(text) || /\bto\s+v\d+\b/.test(text));
}

/** A license GitHub could identify; a repository with none, or text it cannot identify, is not usable. */
export const hasUsableLicense = (license: string | null) => license !== null && license !== "NOASSERTION" && license !== "NONE";

export function evaluate(candidate: Candidate, evidence: Evidence, hint: ActionHint): { checks: Checks; moves: number } {
  const reported = new Set(candidate.before.map((location) => location.path));
  const moves = countMigrations(evidence.files, reported, hint);
  const checks: Checks = {
    parentReportsRule: candidate.before.length > 0,
    migrationClearsRule: candidate.before.every((location) => !candidate.after.some((later) => later.path === location.path)),
    singleParent: evidence.parents.length === 1 && evidence.parents[0] === candidate.parentCommit,
    directMigration: moves > 0,
    intentStated: statesIntent(evidence.message, hint),
    licensed: hasUsableLicense(evidence.license),
    publicAndActive: evidence.repo.private !== true && evidence.repo.fork !== true && evidence.repo.archived !== true,
  };
  return { checks, moves };
}

const FAILURES: Record<keyof Checks, (license: string | null) => string> = {
  parentReportsRule: () => "The parent commit does not report the rule.",
  migrationClearsRule: () => "The migration commit still reports the rule at a reported location.",
  singleParent: () => "The commit is a merge or its parent does not match the candidate.",
  directMigration: () => "The diff does not move the action from an unsupported major to a supported one at a reported location.",
  intentStated: () => "The commit message does not state a version bump or lifecycle migration.",
  licensed: (license) => `The repository has no usable license (${license ?? "none"}).`,
  publicAndActive: () => "The repository is private, a fork, or archived.",
};

export function review(candidate: Candidate, evidence: Evidence, hint: ActionHint, reviewer: string, reviewedAt: string): ReviewEntry {
  const { checks, moves } = evaluate(candidate, evidence, hint);
  const failed = (Object.keys(checks) as (keyof Checks)[]).filter((name) => !checks[name]);
  const accepted = failed.length === 0;
  return {
    candidate: candidate.id,
    repository: candidate.repository,
    parentCommit: candidate.parentCommit,
    migrationCommit: candidate.migrationCommit,
    ruleId: candidate.ruleId,
    decision: accepted ? "accepted" : "rejected",
    reviewer,
    reviewedAt,
    license: evidence.license,
    checks,
    reasons: accepted
      ? [`${hint.action} moves to a supported major in ${moves} reported location${moves === 1 ? "" : "s"}; the commit message states the bump; license ${evidence.license}.`]
      : failed.map((name) => FAILURES[name](evidence.license)),
  };
}

async function gh<T>(endpoint: string): Promise<T | undefined> {
  try {
    const { stdout } = await run("gh", ["api", endpoint], { maxBuffer: 50 * 1024 * 1024, timeout: 60_000 });
    return JSON.parse(stdout) as T;
  } catch {
    return undefined;
  }
}

export async function fetchEvidence(candidate: Candidate): Promise<Evidence> {
  const commit = await gh<{ commit: { message: string }; parents: { sha: string }[]; files?: { filename: string; patch?: string }[] }>(`repos/${candidate.repository}/commits/${candidate.migrationCommit}`);
  const repo = await gh<{ private?: boolean; fork?: boolean; archived?: boolean }>(`repos/${candidate.repository}`);
  const license = await gh<{ license?: { spdx_id?: string } }>(`repos/${candidate.repository}/license`);
  if (!commit || !repo) throw new Error(`Could not read ${candidate.repository}@${candidate.migrationCommit} from GitHub.`);
  return {
    message: commit.commit.message,
    parents: commit.parents.map((parent) => parent.sha),
    files: (commit.files ?? []).map((file) => ({ filename: file.filename, patch: file.patch ?? "" })),
    repo,
    license: license?.license?.spdx_id ?? null,
  };
}

async function hints(): Promise<Map<string, ActionHint>> {
  const registry = JSON.parse(await readFile(resolve("registry/github-actions.json"), "utf8")) as { rules: { id: string; "x-github-actions"?: ActionHint }[] };
  return new Map(registry.rules.flatMap((rule) => (rule["x-github-actions"] ? [[rule.id, rule["x-github-actions"]] as const] : [])));
}

async function main(): Promise<void> {
  const option = (name: string, fallback: string) => {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
  };
  const reviewer = option("--reviewer", "arminazimi");
  const refresh = process.argv.includes("--refresh");
  const reviewedAt = new Date().toISOString().slice(0, 10);
  if (!isIsoDate(reviewedAt)) throw new Error("Could not determine today's date.");

  const directory = resolve("benchmarks/mining/candidates");
  const logPath = resolve("benchmarks/mining/review-log.json");
  const ruleHints = await hints();
  const existing: ReviewLog = await readFile(logPath, "utf8").then((text) => JSON.parse(text) as ReviewLog, () => ({ schemaVersion: REVIEW_LOG_SCHEMA, method: METHOD, entries: [] }));
  const entries = new Map(existing.entries.map((entry) => [entry.candidate, entry]));

  const files = JSON.parse(await readFile(resolve(directory, "index.json"), "utf8")) as string[];
  for (const file of files) {
    const candidate = JSON.parse(await readFile(resolve(directory, file), "utf8")) as Candidate;
    if (entries.has(candidate.id) && !refresh) continue;
    const hint = ruleHints.get(candidate.ruleId);
    if (!hint) throw new Error(`${candidate.id}: only GitHub Actions rules can be reviewed by this tool (${candidate.ruleId}); review it by hand.`);
    process.stderr.write(`review ${candidate.id}\n`);
    entries.set(candidate.id, review(candidate, await fetchEvidence(candidate), hint, reviewer, reviewedAt));
  }

  const log: ReviewLog = { schemaVersion: REVIEW_LOG_SCHEMA, method: METHOD, entries: [...entries.values()].sort((a, b) => a.candidate.localeCompare(b.candidate)) };
  await writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`);
  const accepted = log.entries.filter((entry) => entry.decision === "accepted").length;
  process.stdout.write(`${log.entries.length} reviewed: ${accepted} accepted, ${log.entries.length - accepted} rejected\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  });
}

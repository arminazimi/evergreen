// Flags a public-contract change that carries no decision record.
//
//   node dist/tools/check-decisions.js [--base origin/main]
//
// The diff is taken from the merge base of `--base` and HEAD, so a base branch that moved on
// after the pull request forked does not add its own commits to the diff. Renames are reported
// with both sides, so moving a contract file out of its contract directory still counts.
// Offline: it reads git history only.

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_BASE = "origin/main";
/** Records live here; `index.md` is the table of contents, not a record. */
export const DECISIONS_DIR = "docs/decisions/";
export const DECISIONS_INDEX = `${DECISIONS_DIR}index.md`;

export interface ContractPath {
  /** Repository-relative path, or a directory prefix when `directory` is true. */
  path: string;
  directory: boolean;
  /** The contract the path defines, used in the message. */
  contract: string;
}

/**
 * Public contracts, per `AGENTS.md` (Conventions). CLI JSON output is published through
 * `schemas/`, so a change to it needs a schema change and is caught there.
 */
export const CONTRACT_PATHS: readonly ContractPath[] = [
  { path: "schemas/", directory: true, contract: "published JSON Schema" },
  { path: "src/sdk.ts", directory: false, contract: "detector SDK" },
  { path: "src/mcp.ts", directory: false, contract: "MCP tool shapes" },
];

export type ChangeStatus = "A" | "M" | "D" | "R" | "C" | "T";

export interface ChangedFile {
  status: ChangeStatus;
  /** New path for adds, modifications, renames, and copies; the deleted path for deletes. */
  path: string;
  /** Source path of a rename or copy. */
  previousPath?: string;
}

export interface ContractChange {
  path: string;
  contract: string;
  status: ChangeStatus;
}

export interface DecisionCheckResult {
  base: string;
  mergeBase: string;
  contracts: ContractChange[];
  records: string[];
  passed: boolean;
}

export interface CommandLineOptions {
  base: string;
}

const STATUS_WORDS: Record<ChangeStatus, string> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type changed",
};

const STATUS_LETTERS = new Set<string>(Object.keys(STATUS_WORDS));

function runGit(args: readonly string[], cwd?: string): string {
  return execFileSync("git", [...args], {
    ...(cwd === undefined ? {} : { cwd }),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitFailure(error: unknown): string {
  const stderr = (error as { stderr?: string | Buffer }).stderr;
  const text = typeof stderr === "string" ? stderr : stderr?.toString("utf8");
  return (text ?? (error instanceof Error ? error.message : String(error))).trim();
}

/** Absolute path of the repository root, so changed paths are repository-relative. */
export function repositoryRoot(cwd = process.cwd()): string {
  try {
    return runGit(["rev-parse", "--show-toplevel"], cwd).trim();
  } catch (error) {
    throw new Error(`Not a git repository: ${gitFailure(error)}`);
  }
}

/** The fork point of `base` and HEAD; comparing to the base tip would include the base's later commits. */
export function resolveMergeBase(base: string, root: string): string {
  let output: string;
  try {
    output = runGit(["merge-base", base, "HEAD"], root).trim();
  } catch (error) {
    throw new Error(
      `Cannot compare against "${base}": ${gitFailure(error)}. ` +
        `Fetch it first (git fetch origin main) or pass --base <ref>.`,
    );
  }
  if (output === "") {
    throw new Error(`"${base}" and HEAD share no merge base, so there is no diff to check.`);
  }
  return output;
}

/** Parses `git diff --name-status -z` output, including the three-token rename and copy entries. */
export function parseNameStatus(output: string): ChangedFile[] {
  const tokens = output.split("\0");
  const files: ChangedFile[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const raw = tokens[index];
    if (raw === undefined || raw === "") continue;
    const letter = raw.slice(0, 1);
    if (!STATUS_LETTERS.has(letter)) throw new Error(`Unexpected git diff status "${raw}".`);
    const status = letter as ChangeStatus;
    const first = tokens[index + 1];
    if (first === undefined || first === "") throw new Error(`Git diff status "${raw}" has no path.`);
    if (status === "R" || status === "C") {
      const second = tokens[index + 2];
      if (second === undefined || second === "") throw new Error(`Git diff status "${raw}" has no rename target.`);
      files.push({ status, previousPath: first.replaceAll("\\", "/"), path: second.replaceAll("\\", "/") });
      index += 2;
    } else {
      files.push({ status, path: first.replaceAll("\\", "/") });
      index += 1;
    }
  }
  return files;
}

/** Files changed between the merge base and HEAD, with renames detected. */
export function changedFiles(mergeBase: string, root: string): ChangedFile[] {
  const output = runGit(
    ["diff", "--name-status", "-z", "--find-renames", "--diff-filter=ACMRDT", mergeBase, "HEAD", "--"],
    root,
  );
  return parseNameStatus(output);
}

/** The contract a path belongs to, or undefined when the path is not a public contract. */
export function contractFor(path: string): ContractPath | undefined {
  const normalized = path.replaceAll("\\", "/");
  return CONTRACT_PATHS.find((rule) => (rule.directory ? normalized.startsWith(rule.path) : normalized === rule.path));
}

/** Contract paths in the diff, counting both sides of a rename or copy. */
export function contractChanges(files: readonly ChangedFile[]): ContractChange[] {
  const changes = new Map<string, ContractChange>();
  for (const file of files) {
    const candidates = file.previousPath === undefined ? [file.path] : [file.previousPath, file.path];
    for (const path of candidates) {
      const rule = contractFor(path);
      if (rule !== undefined && !changes.has(path)) {
        changes.set(path, { path, contract: rule.contract, status: file.status });
      }
    }
  }
  return [...changes.values()].sort((left, right) => left.path.localeCompare(right.path));
}

/** New or changed records in the diff; a deleted record or the index alone does not count. */
export function decisionRecords(files: readonly ChangedFile[]): string[] {
  const records = new Set<string>();
  for (const file of files) {
    if (file.status === "D") continue;
    if (!file.path.startsWith(DECISIONS_DIR)) continue;
    if (file.path === DECISIONS_INDEX) continue;
    if (!file.path.endsWith(".md")) continue;
    records.add(file.path);
  }
  return [...records].sort((left, right) => left.localeCompare(right));
}

export function evaluate(options: {
  base: string;
  mergeBase: string;
  files: readonly ChangedFile[];
}): DecisionCheckResult {
  const contracts = contractChanges(options.files);
  const records = decisionRecords(options.files);
  return {
    base: options.base,
    mergeBase: options.mergeBase,
    contracts,
    records,
    passed: contracts.length === 0 || records.length > 0,
  };
}

export function renderDecisionCheck(result: DecisionCheckResult): string {
  if (result.contracts.length === 0) {
    return "No public contract changed; no decision record needed.";
  }
  const contractLines = result.contracts.map(
    (change) => `  - ${change.path} (${STATUS_WORDS[change.status]}) — ${change.contract}`,
  );
  if (result.passed) {
    return [
      "Public contract changed with a decision record:",
      ...contractLines,
      "",
      "Records in this diff:",
      ...result.records.map((record) => `  - ${record}`),
    ].join("\n");
  }
  return [
    "Public contract changed without a decision record:",
    ...contractLines,
    "",
    "Public contracts change only additively unless a decision record says otherwise (AGENTS.md, Conventions).",
    "Add a new or changed record under docs/decisions/ in this pull request, for example",
    "docs/decisions/0022-<slug>.md, and index it from docs/decisions/index.md.",
    "docs/decisions/index.md on its own is the index, not a record, so it does not count.",
  ].join("\n");
}

export function parseArguments(argv: readonly string[]): CommandLineOptions {
  let base = DEFAULT_BASE;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--base") throw new Error(`Unknown argument "${argument}".`);
    const value = argv[index + 1];
    if (value === undefined || value === "" || value.startsWith("--")) throw new Error("--base needs a value.");
    base = value;
    index += 1;
  }
  return { base };
}

export async function main(argv: readonly string[]): Promise<number> {
  const options = parseArguments(argv);
  const root = repositoryRoot();
  const mergeBase = resolveMergeBase(options.base, root);
  const result = evaluate({ base: options.base, mergeBase, files: changedFiles(mergeBase, root) });
  process.stdout.write(`${renderDecisionCheck(result)}\n`);
  if (!result.passed) {
    process.stderr.write(`Decision record required for: ${result.contracts.map((change) => change.path).join(", ")}\n`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exit(2);
    },
  );
}

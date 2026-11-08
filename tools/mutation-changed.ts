// Mutation testing on the lines a pull request changes (#2104).
//
//   node dist/tools/mutation-changed.js select --base origin/main
//   node dist/tools/mutation-changed.js check --report artifacts/mutation-report.json --threshold 60
//
// `select` reads `git diff` against the base and prints a Stryker `--mutate` value that holds one
// line range per changed hunk of a file inside the mutation scope of stryker.config.json. It prints
// nothing when the pull request touches no mutated file. `check` reads the Stryker JSON report of
// that run, fails when the score of the changed lines is under the threshold, and lists every
// surviving mutant with its file, line, and mutator so the weak test can be fixed.
//
// The nightly run (mutation.yml) still owns the per-file ratchet. This tool only judges new and
// changed lines, so an unrelated edit to a file with older debt is not blocked by that debt.
//
// It reads local files and the git object database only. It never uses the network and never runs
// repository code; Stryker, started by the workflow, runs the repository's own tests.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { mutationScore } from "./mutation-baseline.js";

export const DEFAULT_CONFIG = "stryker.config.json";
export const DEFAULT_REPORT = "artifacts/mutation-report.json";
/** The most survivors the Markdown summary lists; the JSON artifact holds the rest. */
export const SUMMARY_SURVIVOR_LIMIT = 100;

export interface LineRange {
  start: number;
  end: number;
}

export interface Survivor {
  file: string;
  line: number;
  mutator: string;
  replacement: string;
  status: string;
}

export interface ChangedCheck {
  passed: boolean;
  /** Null when the report holds no scored mutant, which passes: nothing testable changed. */
  score: number | null;
  detected: number;
  undetected: number;
  threshold: number;
  survivors: Survivor[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Converts a Stryker mutate glob (`*`, `**`) into an anchored expression. Other characters are literal. */
export function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob.charAt(index);
    if (char === "*" && glob.charAt(index + 1) === "*") {
      const slash = glob.charAt(index + 2) === "/";
      source += slash ? "(?:.*/)?" : ".*";
      index += slash ? 2 : 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

/** Reads the `mutate` globs of a Stryker config. */
export function parseMutateGlobs(raw: unknown): string[] {
  if (!isRecord(raw) || !Array.isArray(raw.mutate)) throw new Error("The Stryker config needs a mutate array.");
  const globs = raw.mutate.filter((entry): entry is string => typeof entry === "string" && entry !== "");
  if (globs.length === 0) throw new Error("The Stryker config mutate array is empty.");
  return globs;
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

function hunkRange(line: string): LineRange | null {
  const match = HUNK.exec(line);
  if (match === null) return null;
  const start = Number(match[1]);
  const count = match[2] === undefined ? 1 : Number(match[2]);
  // A count of zero is a pure deletion: no added line exists to mutate.
  return count === 0 ? null : { start, end: start + count - 1 };
}

/** Parses `git diff --unified=0` output into the added line ranges of each file, in diff order. */
export function parseChangedRanges(diff: string): Map<string, LineRange[]> {
  const ranges = new Map<string, LineRange[]>();
  let current: string | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      current = line.startsWith("+++ b/") ? line.slice("+++ b/".length) : null;
    } else if (current !== null && line.startsWith("@@")) {
      const range = hunkRange(line);
      if (range !== null) ranges.set(current, [...(ranges.get(current) ?? []), range]);
    }
  }
  return ranges;
}

/** Builds the Stryker `--mutate` entries (`file:start-end`) for the files inside the mutation scope. */
export function selectMutateSpecs(
  ranges: ReadonlyMap<string, readonly LineRange[]>,
  globs: readonly string[],
): string[] {
  const patterns = globs.map(globToRegExp);
  const specs: string[] = [];
  for (const [file, fileRanges] of [...ranges].sort(([left], [right]) => left.localeCompare(right))) {
    if (!patterns.some((pattern) => pattern.test(file))) continue;
    for (const range of fileRanges) specs.push(`${file}:${range.start}-${range.end}`);
  }
  return specs;
}

function survivorFrom(file: string, mutant: Record<string, unknown>): Survivor {
  const location = isRecord(mutant.location) && isRecord(mutant.location.start) ? mutant.location.start : {};
  return {
    file,
    line: typeof location.line === "number" ? location.line : 0,
    mutator: typeof mutant.mutatorName === "string" ? mutant.mutatorName : "unknown",
    replacement: typeof mutant.replacement === "string" ? mutant.replacement : "",
    status: typeof mutant.status === "string" ? mutant.status : "Survived",
  };
}

/** Scores every mutant in a Stryker report together and collects the ones the tests did not detect. */
export function checkChangedReport(raw: unknown, threshold: number): ChangedCheck {
  if (!isRecord(raw) || !isRecord(raw.files)) throw new Error("The mutation report needs a files object.");
  const mutants: Record<string, unknown>[] = [];
  const owners: string[] = [];
  for (const [file, value] of Object.entries(raw.files)) {
    if (!isRecord(value) || !Array.isArray(value.mutants)) throw new Error(`${file} needs a mutants array.`);
    for (const mutant of value.mutants) {
      if (!isRecord(mutant) || typeof mutant.status !== "string") {
        throw new Error(`${file} has a mutant without a string status.`);
      }
      mutants.push(mutant);
      owners.push(file);
    }
  }
  const result = mutationScore(mutants.map((mutant) => ({ status: String(mutant.status) })));
  const survivors = mutants
    .map((mutant, index) => survivorFrom(owners[index] ?? "", mutant))
    .filter((mutant) => mutant.status === "Survived" || mutant.status === "NoCoverage")
    .sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
  if (result === null) {
    return { passed: true, score: null, detected: 0, undetected: 0, threshold, survivors };
  }
  return {
    passed: result.score >= threshold,
    score: result.score,
    detected: result.detected,
    undetected: result.undetected,
    threshold,
    survivors,
  };
}

function describeSurvivor(survivor: Survivor): string {
  const change = survivor.replacement === "" ? "" : ` -> ${survivor.replacement.replace(/\s+/g, " ").slice(0, 80)}`;
  return `${survivor.file}:${survivor.line} ${survivor.mutator} (${survivor.status})${change}`;
}

/** Plain-text result for the job log. */
export function renderChangedText(result: ChangedCheck): string {
  if (result.score === null) return "No scored mutant in the changed lines; nothing to judge.\n";
  const lines = [
    `Mutation score of the changed lines: ${result.score.toFixed(2)}% (${result.detected} detected, ${result.undetected} not detected; threshold ${result.threshold}%).`,
  ];
  if (result.survivors.length > 0) {
    lines.push("Surviving mutants (no test failed when the code changed this way):");
    for (const survivor of result.survivors) lines.push(`  ${describeSurvivor(survivor)}`);
  }
  lines.push(
    result.passed
      ? "Passed."
      : `Failed: the tests do not pin the changed lines. Add or tighten tests until the score reaches ${result.threshold}%.`,
  );
  return `${lines.join("\n")}\n`;
}

/** Markdown for $GITHUB_STEP_SUMMARY. */
export function renderChangedSummary(result: ChangedCheck): string {
  const lines = ["### Mutation testing of changed lines", ""];
  if (result.score === null) return `${[...lines, "No scored mutant in the changed lines.", ""].join("\n")}`;
  lines.push(
    `Score **${result.score.toFixed(2)}%** against a threshold of ${result.threshold}% (${result.detected} detected, ${result.undetected} not detected).`,
    "",
  );
  if (result.survivors.length === 0) return `${[...lines, "No surviving mutants.", ""].join("\n")}`;
  lines.push("| File | Line | Mutator | Status |", "| --- | ---: | --- | --- |");
  for (const survivor of result.survivors.slice(0, SUMMARY_SURVIVOR_LIMIT)) {
    lines.push(`| \`${survivor.file}\` | ${survivor.line} | ${survivor.mutator} | ${survivor.status} |`);
  }
  if (result.survivors.length > SUMMARY_SURVIVOR_LIMIT) {
    lines.push("", `Showing the first ${SUMMARY_SURVIVOR_LIMIT} of ${result.survivors.length} survivors.`);
  }
  return `${[...lines, ""].join("\n")}`;
}

function readJson(path: string): unknown {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return raw;
}

function breakThreshold(config: unknown): number {
  if (isRecord(config) && isRecord(config.thresholds) && typeof config.thresholds.break === "number") {
    return config.thresholds.break;
  }
  return 60;
}

interface Options {
  command: string;
  base: string | null;
  config: string;
  report: string;
  threshold: number | null;
  summary: string | null;
}

function parseArguments(argv: readonly string[]): Options {
  const [command, ...rest] = argv;
  if (command !== "select" && command !== "check") throw new Error('The first argument must be "select" or "check".');
  const options: Options = {
    command,
    base: null,
    config: DEFAULT_CONFIG,
    report: DEFAULT_REPORT,
    threshold: null,
    summary: null,
  };
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (flag === undefined || value === undefined || value.startsWith("--")) {
      throw new Error(`${flag ?? "An argument"} needs a value.`);
    }
    if (flag === "--base") options.base = value;
    else if (flag === "--config") options.config = value;
    else if (flag === "--report") options.report = value;
    else if (flag === "--summary") options.summary = value;
    else if (flag === "--threshold") options.threshold = Number(value);
    else throw new Error(`Unknown argument "${flag}".`);
  }
  if (options.threshold !== null && !(options.threshold >= 0 && options.threshold <= 100)) {
    throw new Error("--threshold needs a number between 0 and 100.");
  }
  return options;
}

function runSelect(options: Options): number {
  if (options.base === null) throw new Error("select needs --base <ref>.");
  const diff = execFileSync(
    "git",
    ["diff", "--unified=0", "--no-color", "--no-ext-diff", "--diff-filter=ACMR", `${options.base}...HEAD`, "--", "src"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const specs = selectMutateSpecs(parseChangedRanges(diff), parseMutateGlobs(readJson(options.config)));
  process.stdout.write(specs.join(","));
  return 0;
}

function runCheck(options: Options): number {
  const threshold = options.threshold ?? breakThreshold(readJson(options.config));
  const result = checkChangedReport(readJson(options.report), threshold);
  process.stdout.write(renderChangedText(result));
  if (options.summary !== null) writeFileSync(options.summary, renderChangedSummary(result), { flag: "a" });
  for (const survivor of result.survivors) {
    process.stderr.write(
      `::${result.passed ? "warning" : "error"} file=${survivor.file},line=${survivor.line},title=Surviving mutant::${survivor.mutator}: no test failed\n`,
    );
  }
  return result.passed ? 0 : 1;
}

export function main(argv: readonly string[]): number {
  const options = parseArguments(argv);
  return options.command === "select" ? runSelect(options) : runCheck(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}

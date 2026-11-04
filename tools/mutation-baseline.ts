// Enforces the per-file mutation score baselines in benchmarks/mutation-baseline.json.
//
//   node dist/tools/mutation-baseline.js --report artifacts/mutation-report.json
//   node dist/tools/mutation-baseline.js --report artifacts/mutation-report.json --update --date 2026-11-04
//   node dist/tools/mutation-baseline.js --against origin/main
//
// The nightly mutation workflow merges the shard reports and runs the check: a file whose score
// fell below its baseline fails with the file and the difference. A new file must meet the 60%
// target, and a baseline entry whose file stops producing mutants is stale and fails until it is
// removed.
//
// `--against` is the pull-request guard. It compares the committed baseline with a git ref and
// fails when a score is lowered or an entry for a file that still exists is removed, so a change
// cannot loosen the ratchet to pass. `--update`, run by a maintainer after a complete nightly run,
// can only raise a score or add a file; it refuses to lower one.
//
// The tool reads local files and the git object database only. It never uses the network and never
// runs repository code.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MUTATION_BASELINE_SCHEMA = "evergreen.mutation-baseline.v1";
export const MUTATION_BASELINE_PATH = "benchmarks/mutation-baseline.json";
export const DEFAULT_MUTATION_REPORT = "artifacts/mutation-report.json";
/** The mutation target in docs/QUALITY.md. A file without a baseline entry must meet it. */
export const MUTATION_TARGET = 60;
/** A score may not fall below its baseline by more than this many points. */
export const SCORE_TOLERANCE = 0.5;
/** Written by the tool, so a manual `--update` cannot drop the file's guidance. */
export const MUTATION_BASELINE_NOTE =
  "Per-file mutation scores measured from the nightly mutation workflow on main. A score may rise or a file may be added; a score may never fall and a live file's entry may never be removed. Run the mutation baseline tool with --update after a complete run to record an improvement. See docs/QUALITY.md section 7.";

export interface MutantStatus {
  status: string;
}

export interface MutationScore {
  file: string;
  score: number;
  detected: number;
  undetected: number;
}

export interface MutationBaselineEntry {
  file: string;
  score: number;
}

export interface MutationBaseline {
  schemaVersion: string;
  note: string;
  measured: string;
  overall: number;
  files: MutationBaselineEntry[];
}

export interface ScoreDrop {
  file: string;
  baseline: number;
  score: number;
  drop: number;
}

export interface OverallDrop {
  baseline: number;
  score: number;
  drop: number;
}

export interface BaselineDrop {
  file: string;
  baseline: number;
  /** Null when the entry was removed while the file still exists. */
  score: number | null;
  drop: number;
}

export interface RatchetResult {
  passed: boolean;
  drops: ScoreDrop[];
  /** Report files below the target with no baseline entry. */
  unbaselined: MutationScore[];
  /** Baseline entries whose file produced no mutant in the report. */
  stale: string[];
  overall: OverallDrop | null;
}

export interface RatchetOptions {
  tolerance?: number;
  /** False compares one shard report and skips the overall and stale checks. */
  complete?: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function percent(detected: number, undetected: number): number {
  const total = detected + undetected;
  return total === 0 ? 0 : round2((100 * detected) / total);
}

/** Detected are killed or timed-out mutants; undetected are survivors and uncovered mutants. */
export function mutationScore(
  mutants: readonly MutantStatus[],
): { score: number; detected: number; undetected: number } | null {
  let detected = 0;
  let undetected = 0;
  for (const mutant of mutants) {
    if (mutant.status === "Killed" || mutant.status === "Timeout") detected += 1;
    else if (mutant.status === "Survived" || mutant.status === "NoCoverage") undetected += 1;
  }
  return detected + undetected === 0 ? null : { score: percent(detected, undetected), detected, undetected };
}

function parseMutant(value: unknown, file: string): MutantStatus {
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new Error(`${file} has a mutant without a string status.`);
  }
  return { status: value.status };
}

/** Parses a Stryker JSON report, one score per file that has at least one scored mutant. */
export function parseMutationReport(raw: unknown): MutationScore[] {
  if (!isRecord(raw) || !isRecord(raw.files)) {
    throw new Error("The mutation report needs a files object.");
  }
  const scores: MutationScore[] = [];
  for (const [file, value] of Object.entries(raw.files)) {
    if (!isRecord(value) || !Array.isArray(value.mutants)) {
      throw new Error(`${file} needs a mutants array.`);
    }
    const result = mutationScore(value.mutants.map((mutant) => parseMutant(mutant, file)));
    if (result !== null) scores.push({ file, ...result });
  }
  return scores.sort((left, right) => left.file.localeCompare(right.file));
}

function parseBaselineEntry(value: unknown, index: number): MutationBaselineEntry {
  if (!isRecord(value) || typeof value.file !== "string" || value.file === "") {
    throw new Error(`files[${index}] needs a file and a score between 0 and 100.`);
  }
  const score = value.score;
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error(`files[${index}] needs a file and a score between 0 and 100.`);
  }
  return { file: value.file, score };
}

function duplicateFiles(files: readonly MutationBaselineEntry[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const entry of files) {
    if (seen.has(entry.file)) duplicates.add(entry.file);
    seen.add(entry.file);
  }
  return [...duplicates];
}

/** Parses and validates the baseline. Structural problems throw, so the check fails loudly. */
export function parseMutationBaseline(raw: unknown): MutationBaseline {
  if (!isRecord(raw) || raw.schemaVersion !== MUTATION_BASELINE_SCHEMA) {
    throw new Error(`The mutation baseline needs schemaVersion "${MUTATION_BASELINE_SCHEMA}".`);
  }
  if (typeof raw.measured !== "string" || !ISO_DATE.test(raw.measured)) {
    throw new Error("The mutation baseline needs a measured date (YYYY-MM-DD).");
  }
  const overall = raw.overall;
  if (typeof overall !== "number" || !Number.isFinite(overall) || overall < 0 || overall > 100) {
    throw new Error("The mutation baseline needs an overall score between 0 and 100.");
  }
  if (!Array.isArray(raw.files)) throw new Error("The mutation baseline needs a files array.");
  const files = raw.files.map((entry, index) => parseBaselineEntry(entry, index));
  const duplicates = duplicateFiles(files);
  if (duplicates.length > 0) throw new Error(`The mutation baseline repeats ${duplicates.join(", ")}.`);
  const note = typeof raw.note === "string" && raw.note !== "" ? raw.note : MUTATION_BASELINE_NOTE;
  return {
    schemaVersion: MUTATION_BASELINE_SCHEMA,
    note,
    measured: raw.measured,
    overall,
    files,
  };
}

function overallDrop(detected: number, undetected: number, baseline: number, tolerance: number): OverallDrop | null {
  const score = percent(detected, undetected);
  const drop = round2(baseline - score);
  return drop > tolerance ? { baseline, score, drop } : null;
}

/** Compares one complete report with the committed baseline. */
export function compareMutationScores(
  scores: readonly MutationScore[],
  baseline: MutationBaseline,
  options: RatchetOptions = {},
): RatchetResult {
  const tolerance = options.tolerance ?? SCORE_TOLERANCE;
  const complete = options.complete ?? true;
  const floors = new Map(baseline.files.map((entry) => [entry.file, entry.score]));
  const drops: ScoreDrop[] = [];
  const unbaselined: MutationScore[] = [];
  let detected = 0;
  let undetected = 0;

  for (const score of scores) {
    detected += score.detected;
    undetected += score.undetected;
    const floor = floors.get(score.file);
    if (floor === undefined) {
      if (score.score < MUTATION_TARGET) unbaselined.push(score);
      continue;
    }
    const drop = round2(floor - score.score);
    if (drop > tolerance) drops.push({ file: score.file, baseline: floor, score: score.score, drop });
  }

  const reported = new Set(scores.map((score) => score.file));
  const stale = complete ? baseline.files.filter((entry) => !reported.has(entry.file)).map((entry) => entry.file) : [];
  const overall = complete ? overallDrop(detected, undetected, baseline.overall, tolerance) : null;
  return {
    passed: drops.length === 0 && unbaselined.length === 0 && stale.length === 0 && overall === null,
    drops,
    unbaselined,
    stale,
    overall,
  };
}

function readBaselineAtRef(ref: string, path: string): MutationBaseline | null {
  let text: string;
  try {
    text = execFileSync("git", ["show", `${ref}:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
  const raw: unknown = JSON.parse(text);
  return parseMutationBaseline(raw);
}

/**
 * The pull-request guard: a score may rise or be added, never fall or be removed while its file
 * still exists. The removed-file exception lets a deletion drop its entry.
 */
export function compareBaselines(
  current: MutationBaseline,
  previous: MutationBaseline,
  fileExists: (file: string) => boolean,
): BaselineDrop[] {
  const entries = new Map(current.files.map((entry) => [entry.file, entry.score]));
  const drops: BaselineDrop[] = [];
  for (const entry of previous.files) {
    const score = entries.get(entry.file);
    if (score === undefined) {
      if (fileExists(entry.file))
        drops.push({ file: entry.file, baseline: entry.score, score: null, drop: entry.score });
      continue;
    }
    if (score < entry.score) {
      drops.push({ file: entry.file, baseline: entry.score, score, drop: round2(entry.score - score) });
    }
  }
  if (current.overall < previous.overall) {
    drops.push({
      file: "overall",
      baseline: previous.overall,
      score: current.overall,
      drop: round2(previous.overall - current.overall),
    });
  }
  return drops;
}

/** Writes a baseline from a report; it may raise a score or add a file, never lower one. */
export function updateBaseline(
  scores: readonly MutationScore[],
  existing: MutationBaseline | null,
  measured: string,
  fileExists: (file: string) => boolean,
): MutationBaseline {
  if (!ISO_DATE.test(measured)) throw new Error("measured must be a date (YYYY-MM-DD).");
  const previous = new Map((existing?.files ?? []).map((entry) => [entry.file, entry.score]));
  const files: MutationBaselineEntry[] = [];
  let detected = 0;
  let undetected = 0;

  for (const score of scores) {
    const floor = previous.get(score.file);
    if (floor !== undefined && score.score < floor) {
      throw new Error(`${score.file} is ${score.score}%, below the baseline ${floor}%; fix the tests instead.`);
    }
    files.push({ file: score.file, score: score.score });
    detected += score.detected;
    undetected += score.undetected;
  }

  for (const entry of existing?.files ?? []) {
    if (!scores.some((score) => score.file === entry.file) && fileExists(entry.file)) files.push(entry);
  }

  const overall = percent(detected, undetected);
  if (existing !== null && overall < existing.overall) {
    throw new Error(
      `The overall score is ${overall}%, below the baseline ${existing.overall}%; fix the tests instead.`,
    );
  }
  files.sort((left, right) => left.file.localeCompare(right.file));
  return {
    schemaVersion: MUTATION_BASELINE_SCHEMA,
    note: existing?.note ?? MUTATION_BASELINE_NOTE,
    measured,
    overall,
    files,
  };
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatDrop(drop: number): string {
  return `${drop.toFixed(2)} points below`;
}

/** Plain-text result for the terminal. */
export function renderRatchetText(result: RatchetResult): string {
  const lines = ["Mutation score ratchet:"];
  for (const drop of result.drops) {
    lines.push(
      `  ${drop.file}: ${formatPercent(drop.baseline)} -> ${formatPercent(drop.score)} (${formatDrop(drop.drop)} its baseline)`,
    );
  }
  for (const score of result.unbaselined) {
    lines.push(
      `  ${score.file}: ${formatPercent(score.score)} is below the ${MUTATION_TARGET}% target and has no baseline entry`,
    );
  }
  for (const file of result.stale) {
    lines.push(`  ${file}: no mutants were reported; remove the baseline entry or restore the file`);
  }
  if (result.overall !== null) {
    lines.push(
      `  overall: ${formatPercent(result.overall.baseline)} -> ${formatPercent(result.overall.score)} (${formatDrop(result.overall.drop)} its baseline)`,
    );
  }
  lines.push(
    result.passed
      ? "Every mutation score held at or above its baseline."
      : "Failed: the mutation score ratchet found a regression.",
  );
  return `${lines.join("\n")}\n`;
}

/** Markdown for $GITHUB_STEP_SUMMARY. */
export function renderRatchetSummary(result: RatchetResult): string {
  const lines = ["### Mutation score ratchet", ""];
  if (result.passed) return `${[...lines, "Every mutation score held at or above its baseline.", ""].join("\n")}`;
  lines.push("| File | Baseline | Current | Difference |", "| --- | ---: | ---: | ---: |");
  for (const drop of result.drops) {
    lines.push(
      `| \`${drop.file}\` | ${formatPercent(drop.baseline)} | ${formatPercent(drop.score)} | −${drop.drop.toFixed(2)} pt |`,
    );
  }
  for (const score of result.unbaselined) {
    lines.push(`| \`${score.file}\` | none | ${formatPercent(score.score)} | below ${MUTATION_TARGET}% |`);
  }
  for (const file of result.stale) {
    lines.push(`| \`${file}\` | recorded | no mutants | stale entry |`);
  }
  if (result.overall !== null) {
    lines.push(
      `| **overall** | ${formatPercent(result.overall.baseline)} | ${formatPercent(result.overall.score)} | −${result.overall.drop.toFixed(2)} pt |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

/** Plain-text guard failure. Exported so the file-and-difference text is tested directly. */
export function renderGuardText(drops: readonly BaselineDrop[]): string {
  const lines = ["The mutation baseline fell:"];
  for (const drop of drops) {
    const current = drop.score === null ? "entry removed" : formatPercent(drop.score);
    lines.push(`  ${drop.file}: ${formatPercent(drop.baseline)} -> ${current} (${formatDrop(drop.drop)} its baseline)`);
  }
  lines.push("The baseline may rise or gain a file, never fall or lose a live file.");
  return `${lines.join("\n")}\n`;
}

export interface CliOptions {
  report: string;
  baseline: string;
  against: string | null;
  update: boolean;
  date: string | null;
  summary: string | null;
  partial: boolean;
}

const VALUE_FLAGS = new Set(["--report", "--baseline", "--against", "--date", "--summary"]);

function applyFlag(options: CliOptions, flag: string): void {
  if (flag === "--update") options.update = true;
  else options.partial = true;
}

function applyValue(options: CliOptions, flag: string, value: string): void {
  if (flag === "--report") options.report = value;
  else if (flag === "--baseline") options.baseline = value;
  else if (flag === "--against") options.against = value;
  else if (flag === "--date") options.date = value;
  else options.summary = value;
}

function parseArguments(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    report: DEFAULT_MUTATION_REPORT,
    baseline: MUTATION_BASELINE_PATH,
    against: null,
    update: false,
    date: null,
    summary: null,
    partial: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;
    if (argument === "--update" || argument === "--partial") {
      applyFlag(options, argument);
      continue;
    }
    if (!VALUE_FLAGS.has(argument)) throw new Error(`Unknown argument "${argument}".`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${argument} needs a value.`);
    applyValue(options, argument, value);
    index += 1;
  }
  return options;
}

async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, "utf8");
  const raw: unknown = JSON.parse(text);
  return raw;
}

export async function runGuard(
  options: CliOptions,
  readPrevious: (ref: string, path: string) => MutationBaseline | null = readBaselineAtRef,
): Promise<number> {
  if (options.against === null) throw new Error("--against needs a git ref.");
  const current = parseMutationBaseline(await readJson(options.baseline));
  const previous = readPrevious(options.against, options.baseline);
  if (previous === null) {
    process.stdout.write(`No mutation baseline at ${options.against}; nothing to compare.\n`);
    return 0;
  }
  const drops = compareBaselines(current, previous, existsSync);
  if (drops.length === 0) {
    process.stdout.write("The mutation baseline did not fall.\n");
    return 0;
  }
  process.stdout.write(renderGuardText(drops));
  return 1;
}

async function runUpdate(options: CliOptions, scores: readonly MutationScore[]): Promise<number> {
  const existing = existsSync(options.baseline) ? parseMutationBaseline(await readJson(options.baseline)) : null;
  const measured = options.date ?? new Date().toISOString().slice(0, 10);
  const baseline = updateBaseline(scores, existing, measured, existsSync);
  await writeFile(options.baseline, `${JSON.stringify(baseline, null, 2)}\n`);
  process.stdout.write(
    `Wrote ${options.baseline}: ${scores.length} files, overall ${formatPercent(baseline.overall)}, measured ${measured}.\n`,
  );
  return 0;
}

async function runCheck(options: CliOptions): Promise<number> {
  const scores = parseMutationReport(await readJson(options.report));
  if (scores.length === 0) throw new Error(`${options.report} has no scored mutants.`);
  if (options.update) return runUpdate(options, scores);
  const baseline = parseMutationBaseline(await readJson(options.baseline));
  const result = compareMutationScores(scores, baseline, { complete: !options.partial });
  process.stdout.write(renderRatchetText(result));
  if (options.summary !== null) await writeFile(options.summary, renderRatchetSummary(result), { flag: "a" });
  for (const drop of result.drops) {
    const message = `${formatPercent(drop.baseline)} -> ${formatPercent(drop.score)} (${formatDrop(drop.drop)} the baseline)`;
    process.stderr.write(`::error file=${drop.file},title=Mutation score fell::${message}\n`);
  }
  return result.passed ? 0 : 1;
}

export async function main(argv: readonly string[]): Promise<number> {
  const options = parseArguments(argv);
  if (options.against !== null) {
    if (options.update) throw new Error("--against and --update cannot be combined.");
    return runGuard(options);
  }
  return runCheck(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(2);
    },
  );
}

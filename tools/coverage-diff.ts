// Compares line coverage of the files a pull request changed against a base LCOV report.
//
//   node dist/tools/coverage-diff.js --base base.lcov --head head.lcov --changed-file src/engine.ts
//
// CI stores main's LCOV as an artifact and runs this on pull requests that touch `src/`.
// A changed file fails when its line coverage drops by more than one percentage point.

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Fail when a changed file's line coverage drops by more than this many percentage points. */
export const DEFAULT_THRESHOLD = 1;

export interface FileCoverage {
  /** Repository-relative POSIX path as stored after normalization (usually under `dist/`). */
  path: string;
  linesFound: number;
  linesHit: number;
  /** Line coverage percent in `[0, 100]`. Empty files count as 100. */
  percent: number;
}

export interface CoverageDrop {
  /** Path the pull request changed (`src/...`). */
  sourcePath: string;
  /** Path looked up in the LCOV reports (`dist/src/...`). */
  coveragePath: string;
  basePercent: number;
  headPercent: number;
  /** `basePercent - headPercent`; positive means coverage fell. */
  drop: number;
}

export interface CoverageDiffResult {
  threshold: number;
  /** Changed source paths that mapped to a coverage file and existed in the base report. */
  compared: CoverageDrop[];
  /** Compared files whose drop is greater than the threshold. */
  regressions: CoverageDrop[];
  /** Changed source paths with no `dist/` counterpart in the base report (new or uncovered). */
  skipped: string[];
  passed: boolean;
}

export interface CoverageDiffOptions {
  base: Map<string, FileCoverage>;
  head: Map<string, FileCoverage>;
  changedFiles: readonly string[];
  threshold?: number;
}

/** Line coverage percent from LCOV LH/LF counters. */
export function linePercent(linesHit: number, linesFound: number): number {
  if (linesFound <= 0) return 100;
  return (100 * linesHit) / linesFound;
}

/** Turns an LCOV `SF:` path into a repository-relative POSIX path. */
export function normalizeCoveragePath(raw: string, root = ""): string {
  let path = raw.trim().replaceAll("\\", "/");
  if (root) {
    const normalizedRoot = root.replaceAll("\\", "/").replace(/\/+$/, "");
    if (path.startsWith(`${normalizedRoot}/`)) path = path.slice(normalizedRoot.length + 1);
  }
  const dist = path.indexOf("/dist/");
  if (dist >= 0) path = path.slice(dist + 1);
  else if (path.startsWith("dist/")) {
    // already relative
  } else if (path.startsWith("./")) path = path.slice(2);
  return path;
}

/**
 * Maps a changed source path to the compiled file the coverage report names.
 * Only `src/**` TypeScript/JavaScript sources are compared; everything else is ignored.
 */
export function sourcePathToCoveragePath(sourcePath: string): string | undefined {
  const path = sourcePath.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!path.startsWith("src/") || path.endsWith("/")) return undefined;
  if (!/\.(?:[cm]?[jt]s|tsx)$/.test(path)) return undefined;
  return `dist/${path.replace(/\.(?:[cm]?ts|tsx)$/, ".js").replace(/\.jsx$/, ".js")}`;
}

/** Parses an LCOV report into per-file line coverage, keyed by normalized path. */
export function parseLcov(text: string, root = ""): Map<string, FileCoverage> {
  const files = new Map<string, FileCoverage>();
  let current: string | undefined;
  let linesFound = 0;
  let linesHit = 0;

  const finish = () => {
    if (current === undefined) return;
    const path = normalizeCoveragePath(current, root);
    files.set(path, { path, linesFound, linesHit, percent: linePercent(linesHit, linesFound) });
    current = undefined;
    linesFound = 0;
    linesHit = 0;
  };

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      finish();
      current = line.slice(3);
      continue;
    }
    if (current === undefined) continue;
    if (line.startsWith("LF:")) {
      linesFound = Number(line.slice(3));
      continue;
    }
    if (line.startsWith("LH:")) {
      linesHit = Number(line.slice(3));
      continue;
    }
    if (line === "end_of_record") finish();
  }
  finish();
  return files;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Compares head coverage against base for the pull request's changed `src/` files. */
export function compareCoverage(options: CoverageDiffOptions): CoverageDiffResult {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const compared: CoverageDrop[] = [];
  const skipped: string[] = [];

  const unique = [...new Set(options.changedFiles.map((file) => file.trim().replaceAll("\\", "/").replace(/^\.\//, "")))].sort((left, right) =>
    left.localeCompare(right),
  );

  for (const sourcePath of unique) {
    const coveragePath = sourcePathToCoveragePath(sourcePath);
    if (coveragePath === undefined) continue;
    const base = options.base.get(coveragePath);
    if (base === undefined) {
      skipped.push(sourcePath);
      continue;
    }
    const head = options.head.get(coveragePath);
    const headPercent = head?.percent ?? 0;
    const drop = base.percent - headPercent;
    compared.push({ sourcePath, coveragePath, basePercent: base.percent, headPercent, drop });
  }

  const regressions = compared.filter((item) => item.drop > threshold);
  return { threshold, compared, regressions, skipped, passed: regressions.length === 0 };
}

function formatPercent(value: number): string {
  return `${roundOne(value)}%`;
}

/** Markdown for `$GITHUB_STEP_SUMMARY`. */
export function renderCoverageDiffSummary(result: CoverageDiffResult): string {
  const lines = ["### Coverage diff (changed `src/` files)", ""];
  if (result.compared.length === 0) {
    lines.push("No changed `src/` file had base coverage to compare.", "");
    if (result.skipped.length > 0) {
      lines.push(`Skipped (new or absent from base LCOV): ${result.skipped.map((path) => `\`${path}\``).join(", ")}`, "");
    }
    return lines.join("\n");
  }

  lines.push("| File | Base | Head | Δ |", "| --- | ---: | ---: | ---: |");
  for (const item of result.compared) {
    const delta = `${item.drop > 0 ? "−" : item.drop < 0 ? "+" : ""}${roundOne(Math.abs(item.drop))}`;
    const mark = item.drop > result.threshold ? " **fail**" : "";
    lines.push(`| \`${item.sourcePath}\` | ${formatPercent(item.basePercent)} | ${formatPercent(item.headPercent)} | ${delta} pt${mark} |`);
  }
  lines.push("");
  if (result.passed) {
    lines.push(`No changed file lost more than ${result.threshold} percentage point${result.threshold === 1 ? "" : "s"} of line coverage.`, "");
  } else {
    lines.push(
      `Failed: ${result.regressions.length} file${result.regressions.length === 1 ? "" : "s"} lost more than ${result.threshold} percentage point${result.threshold === 1 ? "" : "s"} of line coverage.`,
      "",
    );
  }
  if (result.skipped.length > 0) {
    lines.push(`Skipped (new or absent from base LCOV): ${result.skipped.map((path) => `\`${path}\``).join(", ")}`, "");
  }
  return lines.join("\n");
}

/** Plain-text log line for the workflow. */
export function renderCoverageDiffText(result: CoverageDiffResult): string {
  if (result.compared.length === 0) {
    const skipped = result.skipped.length === 0 ? "" : ` Skipped: ${result.skipped.join(", ")}.`;
    return `No changed src/ file had base coverage to compare.${skipped}`;
  }
  const rows = result.compared.map((item) => {
    const delta = `${item.drop > 0 ? "-" : item.drop < 0 ? "+" : ""}${roundOne(Math.abs(item.drop))}`;
    return `${item.sourcePath}: ${formatPercent(item.basePercent)} → ${formatPercent(item.headPercent)} (${delta} pt)`;
  });
  if (result.passed) return ["Coverage diff passed.", ...rows].join("\n");
  return [
    `Coverage diff failed (${result.regressions.length} file${result.regressions.length === 1 ? "" : "s"}):`,
    ...result.regressions.map(
      (item) =>
        `  ${item.sourcePath}: ${formatPercent(item.basePercent)} → ${formatPercent(item.headPercent)} (−${roundOne(item.drop)} pt; limit ${result.threshold})`,
    ),
    ...result.compared.filter((item) => item.drop <= result.threshold).map((item) => `  ok ${item.sourcePath}: ${formatPercent(item.basePercent)} → ${formatPercent(item.headPercent)}`),
  ].join("\n");
}

export async function runCoverageDiff(options: {
  basePath: string;
  headPath: string;
  changedFiles: readonly string[];
  threshold?: number;
  summaryPath?: string;
  root?: string;
}): Promise<CoverageDiffResult> {
  const root = options.root ?? "";
  const result = compareCoverage({
    base: parseLcov(await readFile(options.basePath, "utf8"), root),
    head: parseLcov(await readFile(options.headPath, "utf8"), root),
    changedFiles: options.changedFiles,
    ...(options.threshold !== undefined ? { threshold: options.threshold } : {}),
  });
  if (options.summaryPath !== undefined) await writeFile(options.summaryPath, renderCoverageDiffSummary(result), { flag: "a" });
  return result;
}

function readFlagValues(argv: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== name) continue;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${name} needs a value.`);
    values.push(value);
    index += 1;
  }
  return values;
}

function readFlagValue(argv: readonly string[], name: string): string | undefined {
  const values = readFlagValues(argv, name);
  if (values.length > 1) throw new Error(`${name} may only be given once.`);
  return values[0];
}

export async function main(argv: readonly string[]): Promise<number> {
  const known = new Set(["--base", "--head", "--changed-file", "--changed-files", "--threshold", "--summary", "--root"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument "${argument}".`);
    if (!known.has(argument)) throw new Error(`Unknown argument "${argument}".`);
    if (argv[index + 1] === undefined || argv[index + 1]!.startsWith("--")) throw new Error(`${argument} needs a value.`);
    index += 1;
  }

  const basePath = readFlagValue(argv, "--base");
  const headPath = readFlagValue(argv, "--head");
  if (basePath === undefined || headPath === undefined) {
    throw new Error(
      "Usage: coverage-diff --base <base.lcov> --head <head.lcov> (--changed-file <path> | --changed-files <list>) [--threshold 1] [--summary <file>] [--root <dir>]",
    );
  }

  const changedFiles = [...readFlagValues(argv, "--changed-file")];
  const listPath = readFlagValue(argv, "--changed-files");
  if (listPath !== undefined) {
    const text = await readFile(listPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length > 0) changedFiles.push(trimmed);
    }
  }
  if (changedFiles.length === 0) throw new Error("Pass --changed-file or --changed-files with at least one path.");

  const thresholdRaw = readFlagValue(argv, "--threshold");
  const threshold = thresholdRaw === undefined ? undefined : Number(thresholdRaw);
  if (threshold !== undefined && !Number.isFinite(threshold)) throw new Error(`--threshold must be a number, got "${thresholdRaw}".`);

  const summaryPath = readFlagValue(argv, "--summary");
  const root = readFlagValue(argv, "--root");

  const result = await runCoverageDiff({
    basePath,
    headPath,
    changedFiles,
    ...(threshold !== undefined ? { threshold } : {}),
    ...(summaryPath !== undefined ? { summaryPath } : {}),
    ...(root !== undefined ? { root } : {}),
  });
  process.stdout.write(`${renderCoverageDiffText(result)}\n`);
  return result.passed ? 0 : 1;
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

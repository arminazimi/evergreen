// Enforces the coverage floors against the LCOV report the suite already wrote.
//
// The Linux Node 24 CI job collects coverage while it runs the test suite once (see
// check-pipeline.ts), then this tool reads lcov.info, so the floors never need a second run:
//
//   node dist/tools/coverage-thresholds.js --lcov lcov.info --summary "$GITHUB_STEP_SUMMARY"
//
// The floors live in package.json ("coverageFloors"); `npm run test:coverage` passes the same
// numbers to the test runner for a local run, and a unit test keeps the two in step.

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_LCOV_PATH = "lcov.info";

export type CoverageMetric = "lines" | "branches" | "functions";

export const METRICS: readonly CoverageMetric[] = ["lines", "branches", "functions"];

export interface Counter {
  hit: number;
  found: number;
  /** `hit / found` as a percentage. An empty counter counts as 100, as node:test does. */
  percent: number;
}

export interface CoverageTotals {
  lines: Counter;
  branches: Counter;
  functions: Counter;
}

export type CoverageFloors = Record<CoverageMetric, number>;

export interface ThresholdFailure {
  metric: CoverageMetric;
  floor: number;
  percent: number;
}

export interface ThresholdResult {
  passed: boolean;
  failures: readonly ThresholdFailure[];
  totals: CoverageTotals;
}

function counter(hit: number, found: number): Counter {
  return { hit, found, percent: found === 0 ? 100 : (100 * hit) / found };
}

/**
 * Sums the LCOV line, branch, and function counters into the totals node:test prints as its
 * "all files" row. Throws when the report holds no file, so an empty artifact fails loudly
 * instead of reporting full coverage.
 */
/** The source files an LCOV report has records for. */
export function lcovFiles(text: string): Set<string> {
  const files = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("SF:")) files.add(line.slice(3));
  }
  return files;
}

/**
 * Sums the LCOV totals, over every file or only over `onlyFiles`. Comparing a pull request with main
 * over the files both reports cover keeps deleted or added files from moving the totals: a file
 * that is gone is not a coverage drop, and a new file is held to the floors and the per-file check.
 */
export function parseLcovTotals(text: string, onlyFiles?: ReadonlySet<string>): CoverageTotals {
  const hits: Record<CoverageMetric, number> = { lines: 0, branches: 0, functions: 0 };
  const found: Record<CoverageMetric, number> = { lines: 0, branches: 0, functions: 0 };
  const tags: Record<string, CoverageMetric> = {
    LH: "lines",
    BRH: "branches",
    FNH: "functions",
    LF: "lines",
    BRF: "branches",
    FNF: "functions",
  };
  let files = 0;
  let counted = true;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("SF:")) {
      files += 1;
      counted = onlyFiles === undefined || onlyFiles.has(line.slice(3));
      continue;
    }
    if (!counted) continue;
    const record = /^(LH|LF|BRH|BRF|FNH|FNF):(\d+)$/.exec(line);
    if (record === null) continue;
    const metric = tags[record[1]!]!;
    const count = Number(record[2]);
    if (record[1]!.endsWith("H")) hits[metric] += count;
    else found[metric] += count;
  }

  if (files === 0) throw new Error(`No coverage records found in the LCOV report.`);
  return {
    lines: counter(hits.lines, found.lines),
    branches: counter(hits.branches, found.branches),
    functions: counter(hits.functions, found.functions),
  };
}

/** Reads the floors from package.json and rejects a missing or out-of-range number. */
export function readCoverageFloors(packageJsonText: string): CoverageFloors {
  const parsed = JSON.parse(packageJsonText) as { coverageFloors?: Partial<Record<CoverageMetric, unknown>> };
  const configured = parsed.coverageFloors;
  if (configured === undefined || typeof configured !== "object" || configured === null) {
    throw new Error('package.json needs a "coverageFloors" object with lines, branches, and functions.');
  }
  const floors = {} as CoverageFloors;
  for (const metric of METRICS) {
    const value = configured[metric];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(`coverageFloors.${metric} must be a number between 0 and 100.`);
    }
    floors[metric] = value;
  }
  return floors;
}

/**
 * How far a metric may fall below main's value before a pull request fails. Two runs of the same
 * suite differ by a few hundredths of a point (fuzz inputs and timing), so a tolerance smaller than
 * that fails on noise. A real drop in one file is caught by the per-file check instead.
 */
export const BASELINE_TOLERANCE = 0.05;

export interface BaseDrop {
  metric: CoverageMetric;
  base: number;
  percent: number;
}

/** Each metric that fell below the baseline's value by more than the rounding tolerance. */
export function checkCoverageAgainstBase(
  totals: CoverageTotals,
  base: CoverageTotals,
  tolerance = BASELINE_TOLERANCE,
): BaseDrop[] {
  const drops: BaseDrop[] = [];
  for (const metric of METRICS) {
    const percent = totals[metric].percent;
    const baseline = base[metric].percent;
    if (percent < baseline - tolerance) drops.push({ metric, base: baseline, percent });
  }
  return drops;
}

export function checkCoverageFloors(totals: CoverageTotals, floors: CoverageFloors): ThresholdResult {
  const failures: ThresholdFailure[] = [];
  for (const metric of METRICS) {
    const percent = totals[metric].percent;
    if (percent < floors[metric]) failures.push({ metric, floor: floors[metric], percent });
  }
  return { passed: failures.length === 0, failures, totals };
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100) / 100}%`;
}

/** Plain-text log lines for the workflow step. */
export function renderThresholdText(result: ThresholdResult, floors: CoverageFloors): string {
  const rows = METRICS.map((metric) => {
    const status = result.failures.some((failure) => failure.metric === metric) ? "FAIL" : "ok";
    return `${metric}: ${formatPercent(result.totals[metric].percent)} (floor ${floors[metric]}) ${status}`;
  });
  return [result.passed ? "Coverage floors hold." : "Coverage floors failed.", ...rows].join("\n");
}

/** Markdown for `$GITHUB_STEP_SUMMARY`. */
export function renderThresholdSummary(result: ThresholdResult, floors: CoverageFloors): string {
  const lines = ["### Coverage thresholds", ""];
  lines.push("| Metric | Floor | Actual | Result |");
  lines.push("| --- | ---: | ---: | --- |");
  for (const metric of METRICS) {
    const failed = result.failures.some((failure) => failure.metric === metric);
    lines.push(
      `| ${metric} | ${floors[metric]}% | ${formatPercent(result.totals[metric].percent)} | ${failed ? "**fail**" : "ok"} |`,
    );
  }
  lines.push("");
  if (result.passed) {
    lines.push(`Every floor holds: ${METRICS.map((metric) => `${floors[metric]}% ${metric}`).join(", ")}.`, "");
  } else {
    lines.push(
      `Failed: ${result.failures
        .map((failure) => `${failure.metric} at ${formatPercent(failure.percent)} is below the ${failure.floor}% floor`)
        .join("; ")}.`,
      "",
    );
  }
  return lines.join("\n");
}

function readFlagValue(argv: readonly string[], name: string): string | undefined {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== name) continue;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${name} needs a value.`);
    values.push(value);
    index += 1;
  }
  if (values.length > 1) throw new Error(`${name} may only be given once.`);
  return values[0];
}

export async function main(argv: readonly string[]): Promise<number> {
  const known = new Set(["--lcov", "--summary", "--baseline"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument "${argument}".`);
    if (!known.has(argument)) throw new Error(`Unknown argument "${argument}".`);
    if (argv[index + 1] === undefined || argv[index + 1]!.startsWith("--"))
      throw new Error(`${argument} needs a value.`);
    index += 1;
  }

  const lcovPath = readFlagValue(argv, "--lcov") ?? DEFAULT_LCOV_PATH;
  const summaryPath = readFlagValue(argv, "--summary");
  const floors = readCoverageFloors(await readFile("package.json", "utf8"));
  const totals = parseLcovTotals(await readFile(lcovPath, "utf8"));
  const result = checkCoverageFloors(totals, floors);
  process.stdout.write(`${renderThresholdText(result, floors)}\n`);
  if (summaryPath !== undefined) await writeFile(summaryPath, renderThresholdSummary(result, floors), { flag: "a" });

  // A pull request also may not lower any total below main's report, beyond rounding, over the files both
  // reports cover.
  const baselinePath = readFlagValue(argv, "--baseline");
  if (baselinePath === undefined) return result.passed ? 0 : 1;
  const headText = await readFile(lcovPath, "utf8");
  const baseText = await readFile(baselinePath, "utf8");
  const baseFiles = lcovFiles(baseText);
  const shared = new Set([...lcovFiles(headText)].filter((file) => baseFiles.has(file)));
  if (shared.size === 0) {
    process.stdout.write("No file is in both coverage reports; skipping the comparison with main.\n");
    return result.passed ? 0 : 1;
  }
  const drops = checkCoverageAgainstBase(parseLcovTotals(headText, shared), parseLcovTotals(baseText, shared));
  for (const drop of drops) {
    process.stderr.write(
      `${drop.metric} is ${formatPercent(drop.percent)}, below main's ${formatPercent(drop.base)}.\n`,
    );
  }
  if (drops.length === 0) process.stdout.write("No metric fell below main's report.\n");
  return result.passed && drops.length === 0 ? 0 : 1;
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

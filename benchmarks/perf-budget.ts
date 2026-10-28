import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";

/**
 * The scan performance budget, enforced by the `perf-budget` CI job on ubuntu-latest.
 *
 * Both ceilings are documented in docs/BENCHMARKS.md and carry roughly an order of
 * magnitude of margin over the reference measurement on the development machine, so only
 * a deliberate or catastrophic slowdown trips the gate — not runner noise. Raise them in
 * the same commit that regresses scans, with the reason, and update the documentation.
 */
export const PERF_BUDGET = {
  maxMeanWallMs: 2_000,
  maxPeakRssBytes: 768 * 1024 * 1024,
} as const;

export interface PerfBudget {
  readonly maxMeanWallMs: number;
  readonly maxPeakRssBytes: number;
}

export interface PerfBudgetMeasurements {
  /** Wall-clock milliseconds of each measured run, warm-up excluded. */
  readonly wallMsPerRun: readonly number[];
  readonly meanWallMs: number;
  /** Peak resident set size of the process after the measured runs, in bytes. */
  readonly peakRssBytes: number;
  readonly findingsCount: number;
}

export interface PerfBudgetResult extends PerfBudgetMeasurements {
  readonly schemaVersion: "evergreen.perf-budget.v1";
  readonly timestamp: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly nodeVersion: string;
  readonly fixture: string;
  readonly warmupRuns: number;
  readonly budget: PerfBudget;
  readonly simulatedSlowdownMs: number;
  readonly violations: readonly string[];
  readonly withinBudget: boolean;
}

/**
 * `resourceUsage().maxRSS` is reported in kilobytes on every supported platform — verified
 * against `ps -o rss` on macOS, where the BSD manual's "bytes" no longer holds. Convert to bytes.
 */
function maxRssBytes(): number {
  return process.resourceUsage().maxRSS * 1024;
}

/**
 * Pure gate: returns one human-readable violation per exceeded ceiling, empty when the
 * measurements fit the budget. The scan must also produce findings — a scan that finds
 * nothing fast is broken, not fast.
 */
export function evaluatePerfBudget(
  measurements: Pick<PerfBudgetMeasurements, "meanWallMs" | "peakRssBytes" | "findingsCount">,
  budget: PerfBudget,
): string[] {
  const violations: string[] = [];
  if (measurements.meanWallMs > budget.maxMeanWallMs) {
    violations.push(
      `mean scan wall time ${measurements.meanWallMs.toFixed(0)} ms exceeded the ${budget.maxMeanWallMs} ms budget`,
    );
  }
  if (measurements.peakRssBytes > budget.maxPeakRssBytes) {
    violations.push(
      `peak memory ${(measurements.peakRssBytes / 1024 / 1024).toFixed(0)} MB exceeded the ${(
        budget.maxPeakRssBytes / 1024 / 1024
      ).toFixed(0)} MB budget`,
    );
  }
  if (measurements.findingsCount === 0) {
    violations.push("the fixture scan produced no findings, so the measurement does not cover real scan work");
  }
  return violations;
}

/** Copies the fixed fixture into a clean temporary directory so scans never touch the checkout. */
export async function createCleanFixtureProject(fixtureDir = resolve("tests/fixtures/smoke")): Promise<{
  directory: string;
  cleanup: () => Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-perf-budget-"));
  for (const entry of await readdir(fixtureDir)) {
    await copyFile(join(fixtureDir, entry), join(directory, entry));
  }
  return { directory, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

export interface PerfBenchmarkOptions {
  readonly budget?: PerfBudget | undefined;
  readonly fixtureDir?: string | undefined;
  readonly warmupRuns?: number | undefined;
  readonly measuredRuns?: number | undefined;
  /** Artificial per-run delay added to the measured wall time, to prove the gate trips. */
  readonly simulatedSlowdownMs?: number | undefined;
}

interface RunMeasurement {
  readonly wallMs: number;
  readonly findingsCount: number;
}

/** Scans the fixed fixture in-process with caches disabled: one warm-up, then the measured runs. */
export async function measureFixtureScan(options: PerfBenchmarkOptions = {}): Promise<PerfBudgetMeasurements> {
  const warmupRuns = options.warmupRuns ?? 1;
  const measuredRuns = options.measuredRuns ?? 3;
  const simulatedSlowdownMs = options.simulatedSlowdownMs ?? 0;
  const fixture = await createCleanFixtureProject(options.fixtureDir);
  try {
    const runOnce = async (): Promise<RunMeasurement> => {
      const startedAt = performance.now();
      const result = await scanRepository(fixture.directory, builtInDetectors, { noCache: true });
      if (simulatedSlowdownMs > 0) await delay(simulatedSlowdownMs);
      return { wallMs: performance.now() - startedAt, findingsCount: result.findings.length };
    };

    for (let i = 0; i < warmupRuns; i++) await runOnce();

    const wallMsPerRun: number[] = [];
    let findingsCount = 0;
    for (let i = 0; i < measuredRuns; i++) {
      const run = await runOnce();
      wallMsPerRun.push(run.wallMs);
      findingsCount = Math.max(findingsCount, run.findingsCount);
    }

    const meanWallMs = wallMsPerRun.reduce((total, value) => total + value, 0) / wallMsPerRun.length;
    return { wallMsPerRun, meanWallMs, peakRssBytes: maxRssBytes(), findingsCount };
  } finally {
    await fixture.cleanup();
  }
}

export async function runPerfBenchmark(options: PerfBenchmarkOptions = {}): Promise<PerfBudgetResult> {
  const budget = options.budget ?? PERF_BUDGET;
  const simulatedSlowdownMs = options.simulatedSlowdownMs ?? 0;
  const measurements = await measureFixtureScan({ ...options, simulatedSlowdownMs });
  const violations = evaluatePerfBudget(measurements, budget);
  return {
    schemaVersion: "evergreen.perf-budget.v1",
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    fixture: "tests/fixtures/smoke",
    warmupRuns: options.warmupRuns ?? 1,
    ...measurements,
    budget,
    simulatedSlowdownMs,
    violations,
    withinBudget: violations.length === 0,
  };
}

export function formatPerfBudgetSummary(result: PerfBudgetResult): string {
  const status = result.withinBudget ? "PASSED" : "FAILED";
  const runs = result.wallMsPerRun.length;
  return [
    `Fixed-fixture scan (${result.fixture}): mean ${result.meanWallMs.toFixed(0)} ms over ${runs} runs,`,
    `peak memory ${(result.peakRssBytes / 1024 / 1024).toFixed(0)} MB, ${result.findingsCount} findings`,
    `(budget: ${result.budget.maxMeanWallMs} ms / ${(result.budget.maxPeakRssBytes / 1024 / 1024).toFixed(0)} MB - ${status})`,
  ].join(" ");
}

interface CliOptions extends PerfBenchmarkOptions {
  readonly json: boolean;
  readonly check: boolean;
}

function parseArgv(argv: readonly string[]): CliOptions {
  const draft = {
    budget: undefined as PerfBudget | undefined,
    fixtureDir: undefined as string | undefined,
    warmupRuns: undefined as number | undefined,
    measuredRuns: undefined as number | undefined,
    simulatedSlowdownMs: 0,
    json: false,
    check: false,
  };
  const number = (flag: string): number => {
    const raw = argv[argv.indexOf(flag) + 1];
    if (raw === undefined || !Number.isFinite(Number(raw))) {
      throw new Error(`${flag} expects a number`);
    }
    return Number(raw);
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--max-wall-ms") draft.budget = { ...(draft.budget ?? PERF_BUDGET), maxMeanWallMs: number("--max-wall-ms") };
    else if (argv[i] === "--max-rss-mb")
      draft.budget = { ...(draft.budget ?? PERF_BUDGET), maxPeakRssBytes: number("--max-rss-mb") * 1024 * 1024 };
    else if (argv[i] === "--warmup") draft.warmupRuns = number("--warmup");
    else if (argv[i] === "--runs") draft.measuredRuns = number("--runs");
    else if (argv[i] === "--simulate-slowdown-ms") draft.simulatedSlowdownMs = number("--simulate-slowdown-ms");
    else if (argv[i] === "--fixture") draft.fixtureDir = argv[++i];
    else if (argv[i] === "--json") draft.json = true;
    else if (argv[i] === "--check") draft.check = true;
  }
  return draft;
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgv(argv);
  const result = await runPerfBenchmark(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatPerfBudgetSummary(result));
  }
  if (options.check && !result.withinBudget) {
    for (const violation of result.violations) console.error(`::error::${violation}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runCli();
}

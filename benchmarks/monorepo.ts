import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";

/**
 * Large-monorepo scan budget: a ≥100k-file repository must finish under 5 seconds mean wall time.
 * Documented in docs/BENCHMARKS.md. Raise the ceiling in the same commit that intentionally
 * regresses large-repo scans, with the reason, and update the documentation.
 */
export const MONOREPO_BUDGET = {
  maxMeanWallMs: 5_000,
  minFiles: 100_000,
} as const;

export interface MonorepoBudget {
  readonly maxMeanWallMs: number;
  readonly minFiles: number;
}

export interface MonorepoMeasurements {
  /** Wall-clock milliseconds of each measured run, warm-up excluded. */
  readonly wallMsPerRun: readonly number[];
  readonly meanWallMs: number;
  /** Peak resident set size of the process after the measured runs, in bytes. */
  readonly peakRssBytes: number;
  readonly findingsCount: number;
  readonly fileCount: number;
}

export interface MonorepoBenchmarkResult extends MonorepoMeasurements {
  readonly schemaVersion: "evergreen.monorepo-benchmark.v1";
  readonly timestamp: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly nodeVersion: string;
  /** Synthetic fixture label, or the absolute path of a real local monorepo. */
  readonly fixture: string;
  readonly warmupRuns: number;
  readonly noCache: boolean;
  readonly budget: MonorepoBudget;
  readonly simulatedSlowdownMs: number;
  readonly violations: readonly string[];
  readonly withinBudget: boolean;
}

/**
 * `resourceUsage().maxRSS` is reported in kilobytes on every supported platform — same conversion
 * as the fixed-fixture perf budget.
 */
function maxRssBytes(): number {
  return process.resourceUsage().maxRSS * 1024;
}

/**
 * Pure gate: returns one human-readable violation per exceeded ceiling, empty when the
 * measurements fit the budget. The scan must also produce findings — a scan that finds
 * nothing fast is broken, not fast. File count must meet the documented floor unless the
 * caller lowers `minFiles` for local iteration.
 */
export function evaluateMonorepoBudget(
  measurements: Pick<MonorepoMeasurements, "meanWallMs" | "findingsCount" | "fileCount">,
  budget: MonorepoBudget,
): string[] {
  const violations: string[] = [];
  if (measurements.fileCount < budget.minFiles) {
    violations.push(
      `file count ${measurements.fileCount} is below the ${budget.minFiles} file floor`,
    );
  }
  if (measurements.meanWallMs > budget.maxMeanWallMs) {
    violations.push(
      `mean scan wall time ${measurements.meanWallMs.toFixed(0)} ms exceeded the ${budget.maxMeanWallMs} ms budget`,
    );
  }
  if (measurements.findingsCount === 0) {
    violations.push("the monorepo scan produced no findings, so the measurement does not cover real scan work");
  }
  return violations;
}

/** Counts regular files under `root` (no symlink follow; skips nothing — used for the fixture size gate). */
export async function countFiles(root: string): Promise<number> {
  let total = 0;
  const walk = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "ENOENT" || code === "ENOTDIR") return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) total += 1;
    }
  };
  await walk(root);
  return total;
}

export interface SyntheticMonorepoOptions {
  /** Target regular-file count (default {@link MONOREPO_BUDGET.minFiles}). */
  readonly fileCount?: number | undefined;
  /** Number of workspace packages under `packages/` (default 100). */
  readonly packages?: number | undefined;
}

/**
 * Builds a synthetic npm-workspaces monorepo in a temporary directory: root + package manifests
 * with a known deprecated dependency (`request`), a few TypeScript sources that import it, and
 * enough filler files to reach the target count. Offline only — no network.
 */
export async function createSyntheticMonorepo(options: SyntheticMonorepoOptions = {}): Promise<{
  directory: string;
  fileCount: number;
  cleanup: () => Promise<void>;
}> {
  const targetFiles = options.fileCount ?? MONOREPO_BUDGET.minFiles;
  const packageCount = options.packages ?? 100;
  if (targetFiles < 2) throw new Error("fileCount must be at least 2");
  if (packageCount < 1) throw new Error("packages must be at least 1");

  const directory = await mkdtemp(join(tmpdir(), "evergreen-monorepo-bench-"));
  // Sync writes keep 100k-file fixture creation under a few seconds; creation is outside the measured scan.
  writeFileSync(
    join(directory, "package.json"),
    `${JSON.stringify(
      {
        name: "evergreen-monorepo-benchmark",
        private: true,
        workspaces: ["packages/*"],
        engines: { node: ">=18.0.0" },
        dependencies: { request: "^2.88.0" },
      },
      null,
      2,
    )}\n`,
  );

  mkdirSync(join(directory, "packages"), { recursive: true });
  let created = 1;
  const packagesWithDep = Math.min(5, packageCount);
  // Reserve room for root package.json, per-package manifests, and a few source files.
  const reserved = 1 + packageCount + packagesWithDep;
  const fillerTotal = Math.max(0, targetFiles - reserved);
  const fillerPerPackage = Math.floor(fillerTotal / packageCount);
  let fillerRemainder = fillerTotal - fillerPerPackage * packageCount;

  for (let index = 0; index < packageCount; index++) {
    const name = `pkg-${String(index).padStart(3, "0")}`;
    const packageDir = join(directory, "packages", name);
    mkdirSync(packageDir, { recursive: true });
    const withDeprecated = index < packagesWithDep;
    writeFileSync(
      join(packageDir, "package.json"),
      `${JSON.stringify(
        {
          name: `@evergreen-bench/${name}`,
          version: "1.0.0",
          private: true,
          ...(withDeprecated ? { dependencies: { request: "^2.88.0" } } : {}),
        },
        null,
        2,
      )}\n`,
    );
    created += 1;
    if (withDeprecated) {
      writeFileSync(
        join(packageDir, "index.ts"),
        'import request from "request";\nrequest("https://example.com");\n',
      );
      created += 1;
    }
    const fillers = fillerPerPackage + (fillerRemainder > 0 ? 1 : 0);
    if (fillerRemainder > 0) fillerRemainder -= 1;
    for (let file = 0; file < fillers; file++) {
      writeFileSync(join(packageDir, `file-${file}.txt`), "");
      created += 1;
    }
  }

  // Top up if integer division left us short of the requested count.
  while (created < targetFiles) {
    writeFileSync(join(directory, `pad-${created}.txt`), "");
    created += 1;
  }

  const fileCount = await countFiles(directory);
  return { directory, fileCount, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

export interface MonorepoBenchmarkOptions {
  readonly budget?: MonorepoBudget | undefined;
  /** Existing local monorepo to scan instead of building a synthetic fixture (offline only). */
  readonly targetDir?: string | undefined;
  readonly fileCount?: number | undefined;
  readonly packages?: number | undefined;
  readonly warmupRuns?: number | undefined;
  readonly measuredRuns?: number | undefined;
  /** Artificial per-run delay added to the measured wall time, to prove the gate trips. */
  readonly simulatedSlowdownMs?: number | undefined;
  /** Measured runs always use `noCache: true` so cold-path work is timed (default true). */
  readonly noCache?: boolean | undefined;
}

interface RunMeasurement {
  readonly wallMs: number;
  readonly findingsCount: number;
}

/** Scans a synthetic or real monorepo in-process: warm-ups, then measured runs with caches disabled. */
export async function measureMonorepoScan(options: MonorepoBenchmarkOptions = {}): Promise<{
  measurements: MonorepoMeasurements;
  fixture: string;
  noCache: boolean;
  cleanup: () => Promise<void>;
}> {
  const warmupRuns = options.warmupRuns ?? 1;
  const measuredRuns = options.measuredRuns ?? 3;
  const simulatedSlowdownMs = options.simulatedSlowdownMs ?? 0;
  const noCache = options.noCache ?? true;

  let directory: string;
  let fileCount: number;
  let fixture: string;
  let cleanup: () => Promise<void>;

  if (options.targetDir) {
    directory = resolve(options.targetDir);
    fileCount = await countFiles(directory);
    fixture = directory;
    cleanup = async () => undefined;
  } else {
    const synthetic = await createSyntheticMonorepo({
      fileCount: options.fileCount,
      packages: options.packages,
    });
    directory = synthetic.directory;
    fileCount = synthetic.fileCount;
    fixture = `synthetic:${fileCount}-files`;
    cleanup = synthetic.cleanup;
  }

  try {
    const runOnce = async (): Promise<RunMeasurement> => {
      const startedAt = performance.now();
      const result = await scanRepository(directory, builtInDetectors, { noCache });
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
    return {
      measurements: {
        wallMsPerRun,
        meanWallMs,
        peakRssBytes: maxRssBytes(),
        findingsCount,
        fileCount,
      },
      fixture,
      noCache,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export async function runMonorepoBenchmark(options: MonorepoBenchmarkOptions = {}): Promise<MonorepoBenchmarkResult> {
  const budget = options.budget ?? MONOREPO_BUDGET;
  const simulatedSlowdownMs = options.simulatedSlowdownMs ?? 0;
  const measured = await measureMonorepoScan({ ...options, simulatedSlowdownMs });
  try {
    const violations = evaluateMonorepoBudget(measured.measurements, budget);
    return {
      schemaVersion: "evergreen.monorepo-benchmark.v1",
      timestamp: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      fixture: measured.fixture,
      warmupRuns: options.warmupRuns ?? 1,
      noCache: measured.noCache,
      ...measured.measurements,
      budget,
      simulatedSlowdownMs,
      violations,
      withinBudget: violations.length === 0,
    };
  } finally {
    await measured.cleanup();
  }
}

export function formatMonorepoSummary(result: MonorepoBenchmarkResult): string {
  const status = result.withinBudget ? "PASSED" : "FAILED";
  const runs = result.wallMsPerRun.length;
  return [
    `Monorepo scan (${result.fixture}): ${result.fileCount} files, mean ${result.meanWallMs.toFixed(0)} ms over ${runs} runs,`,
    `peak memory ${(result.peakRssBytes / 1024 / 1024).toFixed(0)} MB, ${result.findingsCount} findings`,
    `(budget: ${result.budget.maxMeanWallMs} ms / ≥${result.budget.minFiles} files, noCache=${result.noCache} - ${status})`,
  ].join(" ");
}

interface CliOptions extends MonorepoBenchmarkOptions {
  readonly json: boolean;
  readonly check: boolean;
}

function parseArgv(argv: readonly string[]): CliOptions {
  const draft = {
    budget: undefined as MonorepoBudget | undefined,
    targetDir: undefined as string | undefined,
    fileCount: undefined as number | undefined,
    packages: undefined as number | undefined,
    warmupRuns: undefined as number | undefined,
    measuredRuns: undefined as number | undefined,
    simulatedSlowdownMs: 0,
    noCache: true,
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
    if (argv[i] === "--max-wall-ms") {
      draft.budget = { ...(draft.budget ?? MONOREPO_BUDGET), maxMeanWallMs: number("--max-wall-ms") };
    } else if (argv[i] === "--min-files") {
      draft.budget = { ...(draft.budget ?? MONOREPO_BUDGET), minFiles: number("--min-files") };
    } else if (argv[i] === "--files") draft.fileCount = number("--files");
    else if (argv[i] === "--packages") draft.packages = number("--packages");
    else if (argv[i] === "--warmup") draft.warmupRuns = number("--warmup");
    else if (argv[i] === "--runs") draft.measuredRuns = number("--runs");
    else if (argv[i] === "--simulate-slowdown-ms") draft.simulatedSlowdownMs = number("--simulate-slowdown-ms");
    else if (argv[i] === "--path") draft.targetDir = argv[++i];
    else if (argv[i] === "--json") draft.json = true;
    else if (argv[i] === "--check") draft.check = true;
    else if (argv[i] === "--cache") draft.noCache = false;
  }
  return draft;
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgv(argv);
  const result = await runMonorepoBenchmark(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatMonorepoSummary(result));
  }
  if (options.check && !result.withinBudget) {
    for (const violation of result.violations) console.error(`::error::${violation}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runCli();
}

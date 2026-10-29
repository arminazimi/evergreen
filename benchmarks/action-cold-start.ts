import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

/**
 * Cold-start budget for the GitHub Action, enforced by the `check` job on ubuntu-latest:
 * fifteen seconds from step start to a written report. Documented in docs/BENCHMARKS.md.
 */
export const ACTION_COLD_START_BUDGET_MS = 15_000;

/**
 * The gate tolerates 20% over the budget so ordinary runner noise never fails a build by itself.
 * A measurement above budget + tolerance is a regression, and the step fails.
 */
export const ACTION_COLD_START_TOLERANCE = 0.2;

/** The file a user's workflow runs: `action.yml` executes this bundle. */
export const DEFAULT_ACTION_ENTRY = resolve("dist/action/index.js");

/** The report the Action writes and the benchmark waits for. */
export const ACTION_REPORT_NAME = "evergreen-report.json";

export interface ActionColdStartOptions {
  /** Entry point to measure; defaults to the built Action bundle. */
  readonly entry?: string | undefined;
  /** Directory copied into a clean temporary workspace; defaults to the smoke fixture. */
  readonly fixtureDir?: string | undefined;
  readonly budgetMs?: number | undefined;
  readonly tolerance?: number | undefined;
  /** Artificial milliseconds added to the measured duration, to prove the gate trips. */
  readonly simulatedSlowdownMs?: number | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface ActionColdStartMeasurements {
  /** Wall-clock milliseconds from spawn to the Action exiting, after it wrote its report. */
  readonly durationMs: number;
  readonly findingsCount: number;
  readonly exitCode: number;
  /** Last line the Action wrote to stderr, when it wrote one; the annotations explain a non-zero exit. */
  readonly stderrTail: string | null;
}

export interface ActionColdStartResult extends ActionColdStartMeasurements {
  readonly schemaVersion: "evergreen.action-cold-start.v1";
  readonly timestamp: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly nodeVersion: string;
  readonly entry: string;
  readonly fixture: string;
  readonly budgetMs: number;
  readonly tolerance: number;
  readonly thresholdMs: number;
  readonly simulatedSlowdownMs: number;
  readonly violations: readonly string[];
  readonly withinBudget: boolean;
}

/**
 * Pure gate: one violation per reason the measurement cannot stand, empty when it fits.
 * A run that produced no findings is not a fast report, it is a broken one.
 */
export function evaluateActionColdStart(
  measurements: Pick<ActionColdStartMeasurements, "durationMs" | "findingsCount" | "exitCode">,
  budgetMs = ACTION_COLD_START_BUDGET_MS,
  tolerance = ACTION_COLD_START_TOLERANCE,
): string[] {
  const violations: string[] = [];
  const thresholdMs = budgetMs * (1 + tolerance);
  if (measurements.durationMs > thresholdMs) {
    violations.push(
      `cold start ${measurements.durationMs.toFixed(0)} ms exceeded the ${budgetMs} ms budget by more than ${(tolerance * 100).toFixed(0)}% (threshold ${thresholdMs.toFixed(0)} ms)`,
    );
  }
  if (measurements.exitCode !== 0) {
    violations.push(`the Action exited ${measurements.exitCode} instead of writing a report and succeeding`);
  }
  if (measurements.findingsCount === 0) {
    violations.push("the fixture produced no findings, so the measurement does not cover a real report");
  }
  return violations;
}

/** Copies the fixture into a clean temporary workspace so the measurement never sees a warm checkout. */
export async function createCleanActionWorkspace(fixtureDir = resolve("tests/fixtures/smoke")): Promise<{
  directory: string;
  cleanup: () => Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-action-cold-start-"));
  for (const entry of await readdir(fixtureDir)) {
    await copyFile(join(fixtureDir, entry), join(directory, entry));
  }
  return { directory, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

/**
 * The variables one Action step sets. The parent's `INPUT_*` and `GITHUB_*` are dropped so a
 * developer's own event payload, baseline, or mode cannot change what is measured.
 *
 * `INPUT_FAIL-ON-SEVERITY=none` keeps the smoke fixture's high finding from failing the run:
 * the benchmark measures time to the report, not the policy gate. `EVERGREEN_NO_CACHE=1` is
 * what makes the run cold — a fresh runner has no cache, and a warm local one must not hide a
 * regression behind cached detector work.
 */
export function actionEnvironment(workspace: string, runnerTemp: string): NodeJS.ProcessEnv {
  const inherited: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("INPUT_") || key.startsWith("GITHUB_")) continue;
    inherited[key] = value;
  }
  return {
    ...inherited,
    GITHUB_WORKSPACE: workspace,
    RUNNER_TEMP: runnerTemp,
    GITHUB_STEP_SUMMARY: join(runnerTemp, "step-summary.md"),
    GITHUB_OUTPUT: join(runnerTemp, "output.txt"),
    INPUT_MODE: "scan",
    "INPUT_FAIL-ON-SEVERITY": "none",
    EVERGREEN_NO_CACHE: "1",
  };
}

/**
 * One un-warmed run: what a user waits for on a fresh runner. There is no warm-up and no repeat,
 * because a second run would measure a warm file-system cache rather than the Action's cold start.
 */
export async function measureActionColdStart(options: ActionColdStartOptions = {}): Promise<ActionColdStartMeasurements> {
  const entry = resolve(options.entry ?? DEFAULT_ACTION_ENTRY);
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!existsSync(entry)) {
    const shown = relative(process.cwd(), entry);
    throw new Error(`${shown} is missing. Build the Action bundle first: npm run build:action`);
  }

  const workspace = await createCleanActionWorkspace(options.fixtureDir);
  const runnerTemp = join(workspace.directory, "runner-temp");
  await mkdir(runnerTemp, { recursive: true });
  try {
    const startedAt = performance.now();
    const run = spawnSync(process.execPath, [entry], {
      cwd: workspace.directory,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: timeoutMs,
      env: actionEnvironment(workspace.directory, runnerTemp),
    });
    const durationMs = performance.now() - startedAt + (options.simulatedSlowdownMs ?? 0);

    let findingsCount = 0;
    const reportPath = join(runnerTemp, ACTION_REPORT_NAME);
    if (existsSync(reportPath)) {
      const report = JSON.parse(await readFile(reportPath, "utf8")) as { findings?: unknown[] };
      findingsCount = report.findings?.length ?? 0;
    }

    const stderrTail = (run.stderr ?? "").trim().split("\n").filter(Boolean).at(-1) ?? null;
    return {
      durationMs,
      findingsCount,
      exitCode: run.status ?? (run.error ? 1 : 0),
      stderrTail: stderrTail === null ? null : stderrTail.slice(0, 300),
    };
  } finally {
    await workspace.cleanup();
  }
}

export async function runActionColdStartBenchmark(options: ActionColdStartOptions = {}): Promise<ActionColdStartResult> {
  const budgetMs = options.budgetMs ?? ACTION_COLD_START_BUDGET_MS;
  const tolerance = options.tolerance ?? ACTION_COLD_START_TOLERANCE;
  const entry = resolve(options.entry ?? DEFAULT_ACTION_ENTRY);
  const measurements = await measureActionColdStart(options);
  const violations = evaluateActionColdStart(measurements, budgetMs, tolerance);
  return {
    schemaVersion: "evergreen.action-cold-start.v1",
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    entry: relative(process.cwd(), entry),
    fixture: relative(process.cwd(), resolve(options.fixtureDir ?? "tests/fixtures/smoke")),
    budgetMs,
    tolerance,
    thresholdMs: budgetMs * (1 + tolerance),
    simulatedSlowdownMs: options.simulatedSlowdownMs ?? 0,
    ...measurements,
    violations,
    withinBudget: violations.length === 0,
  };
}

export function formatActionColdStartSummary(result: ActionColdStartResult): string {
  const status = result.withinBudget ? "PASSED" : "FAILED";
  const findings = `${result.findingsCount} finding${result.findingsCount === 1 ? "" : "s"}`;
  return [
    `Action cold start: ${result.durationMs.toFixed(0)} ms from step start to report on ${result.platform}`,
    `(${findings}; budget: ${result.budgetMs} ms +${(result.tolerance * 100).toFixed(0)}% - ${status})`,
  ].join(" ");
}

interface CliOptions extends ActionColdStartOptions {
  readonly json: boolean;
  readonly check: boolean;
}

function parseArgv(argv: readonly string[]): CliOptions {
  const draft = {
    entry: undefined as string | undefined,
    fixtureDir: undefined as string | undefined,
    budgetMs: undefined as number | undefined,
    tolerance: undefined as number | undefined,
    simulatedSlowdownMs: 0,
    timeoutMs: undefined as number | undefined,
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
    if (argv[i] === "--entry") draft.entry = argv[++i];
    else if (argv[i] === "--fixture") draft.fixtureDir = argv[++i];
    else if (argv[i] === "--budget") draft.budgetMs = number("--budget") * 1000;
    else if (argv[i] === "--tolerance") draft.tolerance = number("--tolerance");
    else if (argv[i] === "--simulate-slowdown-ms") draft.simulatedSlowdownMs = number("--simulate-slowdown-ms");
    else if (argv[i] === "--timeout") draft.timeoutMs = number("--timeout") * 1000;
    else if (argv[i] === "--json") draft.json = true;
    else if (argv[i] === "--check") draft.check = true;
  }
  return draft;
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgv(argv);
  const result = await runActionColdStartBenchmark(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatActionColdStartSummary(result));
  }
  if (options.check && !result.withinBudget) {
    for (const violation of result.violations) console.error(`::error::${violation}`);
    if (result.stderrTail) console.error(`::error title=Evergreen Action failed::${result.stderrTail}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runCli();
}

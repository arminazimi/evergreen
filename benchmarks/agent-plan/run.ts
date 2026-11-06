/**
 * Plan arm harness: run every task in a migration plan twice — once sequentially, once wave by
 * wave with each wave's tasks in parallel — in a private copy of the plan fixture, and record
 * wall-clock time per arm plus how many findings the adapter resolved.
 *
 * Reuses the `AgentAdapter` seam and the command adapter from `benchmarks/agent-migrations/run.ts`.
 * The plan comes from an offline scan of the fixture; the fixture itself is never modified. The
 * adapter records a resolution under `.evergreen-plan/resolved/`, one file per task, so tasks in
 * the same wave can run at the same time without racing on a shared file. Scans stay offline;
 * tests use a fake adapter and never call a model.
 *
 * Run:
 *   npm run build --silent
 *   node dist/benchmarks/agent-plan/run.js --output-dir /tmp/plan-results --agent fake
 */

import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { builtInDetectors } from "../../src/detectors/index.js";
import { restoreFixtureNames } from "../../src/fixture-names.js";
import { scanRepository } from "../../src/engine/index.js";
import { buildPlan } from "../../src/plan-build.js";
import type { PlanArm, PlanArmScore, PlanResult } from "../../tools/benchmark-report.js";
import type { AgentAdapter } from "../agent-migrations/run.js";
import { createCommandAgent } from "../agent-migrations/run.js";

export const SCHEMA_VERSION = "evergreen.benchmark-result.v1" as const;
export const PLAN_ARMS: readonly PlanArm[] = ["sequential", "wave-parallel"];

export const DEFAULT_FIXTURE_PATH = resolve("tests/fixtures/plan/monorepo");
export const RESOLUTION_DIR = ".evergreen-plan/resolved" as const;
export const DEFAULT_TASK_DELAY_MS = 250;
export const DEFAULT_TASK_TIMEOUT_MS = 30 * 60 * 1000;

/** One planned migration task, in the order the plan runs it. */
export interface PlanBenchmarkTask {
  id: string;
  findingId: string;
  title: string;
  /** Zero-based wave index from the plan. */
  wave: number;
  /** Repository-relative paths the task may edit. */
  touches: string[];
  /** Repository-relative file where the adapter records that it resolved the finding. */
  resolutionPath: string;
}

/** What one adapter run did for one task. */
export interface PlanTaskRun {
  taskId: string;
  wave: number;
  durationMs: number;
  resolved: boolean;
  exitCode: number | null;
  timedOut: boolean;
  error?: string;
}

export interface PlanArmRun {
  arm: PlanArm;
  durationMs: number;
  tasks: PlanTaskRun[];
}

export interface PlanBenchmarkRun {
  /** The aggregated document that matches `schemas/benchmark-result.v1.schema.json`. */
  result: PlanResult;
  /** Per-task detail behind each arm; not part of the result file. */
  arms: PlanArmRun[];
  /** Sequential wall-clock time divided by wave-parallel wall-clock time. */
  speedup: number;
  /** Absolute path of the written result file, when `outputDir` was set. */
  resultPath?: string;
}

export interface PlanBenchmarkOptions {
  agent: AgentAdapter;
  /** Agent name in the result file; defaults to the adapter's name. */
  agentName?: string;
  agentVersion?: string;
  model?: { name: string; version: string };
  runId?: string;
  fixturePath?: string;
  timeoutMs?: number;
  keepCopies?: boolean;
  copyRoot?: string;
  /** When set, the result file `{id}.json` is written here. */
  outputDir?: string;
}

export interface FakePlanAgentOptions {
  /** Delay for every task without an entry in `delays`; defaults to 250 ms. */
  delayMs?: number;
  /** Scripted delay per task id, so tests can shape the critical path. */
  delays?: Readonly<Record<string, number>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseMarker(prompt: string, key: string): string | undefined {
  const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(prompt);
  return match?.[1]?.trim();
}

function slug(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
}

/**
 * Reads the fixture's migration plan offline and returns its tasks in wave order, the order the
 * sequential arm runs them. Each task gets a unique resolution path under `RESOLUTION_DIR`.
 */
export async function loadPlanTasks(fixturePath = DEFAULT_FIXTURE_PATH): Promise<PlanBenchmarkTask[]> {
  const repositoryPath = await mkdtemp(join(tmpdir(), "evergreen-plan-fixture-"));
  try {
    await cp(fixturePath, repositoryPath, { recursive: true });
    await restoreFixtureNames(repositoryPath);
    const scan = await scanRepository(repositoryPath, builtInDetectors, { noCache: true });
    const plan = buildPlan(scan);
    const byId = new Map(plan.items.map((item) => [item.id, item]));

    const tasks: PlanBenchmarkTask[] = [];
    for (const wave of plan.waves) {
      for (const itemId of wave.itemIds) {
        const item = byId.get(itemId);
        if (item === undefined) throw new Error(`The plan lists ${itemId} in wave ${wave.index} without an item.`);
        const position = String(tasks.length + 1).padStart(2, "0");
        tasks.push({
          id: item.id,
          findingId: item.findingId,
          title: item.title,
          wave: wave.index,
          touches: [...item.touches],
          resolutionPath: `${RESOLUTION_DIR}/${position}-${slug(item.id)}.json`,
        });
      }
    }
    return tasks;
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
}

/** Prompt for one task, with the markers a scripted adapter parses. */
export function planTaskPrompt(task: PlanBenchmarkTask): string {
  return [
    "You are migrating one task from an Evergreen migration plan in this repository checkout.",
    "",
    `- Task: ${task.id}`,
    `- Title: ${task.title}`,
    `- Wave: ${task.wave}`,
    `- Finding: ${task.findingId}`,
    `- Files: ${task.touches.join(", ")}`,
    "",
    "Resolve only this finding. Keep the change inside those files and preserve existing behavior.",
    "",
    `When the finding is resolved, write {"findingId":"${task.findingId}"} to ${task.resolutionPath}.`,
    "",
    `TASK_ID: ${task.id}`,
    `FINDING_ID: ${task.findingId}`,
    `RESOLUTION_FILE: ${task.resolutionPath}`,
  ].join("\n");
}

/**
 * Scripted adapter for CI: waits for the task's delay, then records the finding as resolved.
 * No model and no API key.
 */
export function createFakePlanAgent(options: FakePlanAgentOptions = {}): AgentAdapter {
  return {
    name: "fake-plan",
    async run({ prompt, worktreePath }) {
      const taskId = parseMarker(prompt, "TASK_ID");
      const findingId = parseMarker(prompt, "FINDING_ID");
      const resolutionFile = parseMarker(prompt, "RESOLUTION_FILE");
      if (taskId === undefined || findingId === undefined || resolutionFile === undefined) {
        return {
          exitCode: 1,
          signal: null,
          stdout: "",
          stderr: "fake adapter could not read TASK_ID, FINDING_ID, and RESOLUTION_FILE from the prompt",
          timedOut: false,
        };
      }

      await wait(options.delays?.[taskId] ?? options.delayMs ?? DEFAULT_TASK_DELAY_MS);
      const target = join(worktreePath, resolutionFile);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, `${JSON.stringify({ findingId })}\n`, "utf8");
      return {
        exitCode: 0,
        signal: null,
        stdout: `resolved ${findingId}`,
        stderr: "",
        timedOut: false,
      };
    },
  };
}

async function hasResolution(worktreePath: string, task: PlanBenchmarkTask): Promise<boolean> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(worktreePath, task.resolutionPath), "utf8"));
    return isRecord(parsed) && parsed.findingId === task.findingId;
  } catch {
    return false;
  }
}

async function runTask(
  task: PlanBenchmarkTask,
  agent: AgentAdapter,
  worktreePath: string,
  timeoutMs: number,
): Promise<PlanTaskRun> {
  const started = performance.now();
  let exitCode: number | null = null;
  let timedOut = false;
  let error: string | undefined;
  try {
    const output = await agent.run({ prompt: planTaskPrompt(task), worktreePath, timeoutMs });
    exitCode = output.exitCode;
    timedOut = output.timedOut;
    if (output.exitCode !== 0) {
      error = `agent exited with ${output.exitCode === null ? (output.signal ?? "no status") : output.exitCode}`;
    }
  } catch (cause) {
    error = `agent failed: ${messageOf(cause)}`;
  }

  const resolved = await hasResolution(worktreePath, task);
  return {
    taskId: task.id,
    wave: task.wave,
    durationMs: Math.round(performance.now() - started),
    resolved,
    exitCode,
    timedOut,
    ...(error === undefined ? {} : { error }),
  };
}

function groupWaves(tasks: readonly PlanBenchmarkTask[]): PlanBenchmarkTask[][] {
  const waves: PlanBenchmarkTask[][] = [];
  for (const task of tasks) {
    const current = waves[waves.length - 1];
    if (current !== undefined && current[0]?.wave === task.wave) current.push(task);
    else waves.push([task]);
  }
  return waves;
}

async function runArm(
  arm: PlanArm,
  tasks: readonly PlanBenchmarkTask[],
  agent: AgentAdapter,
  fixturePath: string,
  root: string,
  timeoutMs: number,
): Promise<PlanArmRun> {
  const worktreePath = join(root, arm);
  await cp(fixturePath, worktreePath, { recursive: true });
  await restoreFixtureNames(worktreePath);

  const started = performance.now();
  const results: PlanTaskRun[] = [];
  if (arm === "sequential") {
    for (const task of tasks) results.push(await runTask(task, agent, worktreePath, timeoutMs));
  } else {
    for (const wave of groupWaves(tasks)) {
      results.push(...(await Promise.all(wave.map((task) => runTask(task, agent, worktreePath, timeoutMs)))));
    }
  }
  return { arm, durationMs: Math.round(performance.now() - started), tasks: results };
}

function scoreArm(arm: PlanArmRun, findings: number): PlanArmScore {
  const resolved = arm.tasks.filter((task) => task.resolved).length;
  return {
    arm: arm.arm,
    durationMs: arm.durationMs,
    findings,
    resolved,
    resolutionRate: findings === 0 ? 0 : round(resolved / findings, 4),
  };
}

/**
 * Runs both arms against private copies of the fixture and returns per-task detail plus the
 * aggregated result document. Copies are removed unless `keepCopies` is set.
 */
export async function runPlanBenchmark(options: PlanBenchmarkOptions): Promise<PlanBenchmarkRun> {
  const fixturePath = resolve(options.fixturePath ?? DEFAULT_FIXTURE_PATH);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
  const tasks = await loadPlanTasks(fixturePath);
  const agentName = options.agentName ?? options.agent.name;

  const startedAt = new Date().toISOString();
  const root = await mkdtemp(join(options.copyRoot ?? tmpdir(), "evergreen-agent-plan-"));
  let arms: PlanArmRun[];
  try {
    arms = [];
    for (const arm of PLAN_ARMS) {
      arms.push(await runArm(arm, tasks, options.agent, fixturePath, root, timeoutMs));
    }
  } finally {
    if (options.keepCopies !== true) await rm(root, { recursive: true, force: true });
  }

  const sequential = arms.find((arm) => arm.arm === "sequential");
  const waveParallel = arms.find((arm) => arm.arm === "wave-parallel");
  if (sequential === undefined || waveParallel === undefined) throw new Error("Both plan arms must run.");

  const runId = options.runId ?? `plan-${slug(agentName) || "agent"}-${startedAt.replace(/[:.]/g, "-")}`;
  const result: PlanResult = {
    schemaVersion: SCHEMA_VERSION,
    kind: "plan",
    id: runId,
    agent: { name: agentName, version: options.agentVersion ?? "0.0.0" },
    model: options.model ?? { name: "none", version: "0" },
    startedAt,
    finishedAt: new Date().toISOString(),
    arms: [scoreArm(sequential, tasks.length), scoreArm(waveParallel, tasks.length)],
  };

  let resultPath: string | undefined;
  if (options.outputDir !== undefined) {
    await mkdir(options.outputDir, { recursive: true });
    resultPath = join(options.outputDir, `${slug(runId) || "plan"}.json`);
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  return {
    result,
    arms,
    speedup: waveParallel.durationMs === 0 ? 0 : round(sequential.durationMs / waveParallel.durationMs, 2),
    ...(resultPath === undefined ? {} : { resultPath }),
  };
}

interface CliOptions {
  fixturePath: string;
  outputDir?: string;
  runId?: string;
  agentKind: "fake" | "command";
  agentCommand?: string;
  agentName?: string;
  agentVersion?: string;
  modelName: string;
  modelVersion: string;
  taskDelayMs: number;
  timeoutMs?: number;
  keepCopies: boolean;
  json: boolean;
  help: boolean;
}

const USAGE = `Usage: node dist/benchmarks/agent-plan/run.js [options]

Runs every task in a migration plan twice — sequentially, then wave by wave with each wave's
tasks in parallel — in a private copy of the plan fixture. Writes one result file that
tools/benchmark-report.ts can read.

Options:
  --fixture <path>          Repository to plan (default: tests/fixtures/plan/monorepo)
  --output-dir <path>       Directory for the {id}.json result file
  --run-id <id>             Result id (default: plan-<agent>-<timestamp>)
  --agent fake|command      Adapter to use (default: fake)
  --agent-command <cmd>     Command for the command adapter; reads $EVERGREEN_MIGRATION_PROMPT_FILE
  --agent-name <name>       Agent name in the result (default: the adapter's name)
  --agent-version <version> Agent version in the result (default: 0.0.0)
  --model-name <name>       Model name in the result (default: none)
  --model-version <version> Model version in the result (default: 0)
  --task-delay-ms <number>  Fake adapter delay per task (default: 250)
  --timeout-ms <number>     Agent timeout per task (default: 1800000)
  --keep-copies             Leave the copied fixtures in place
  --json                    Print the result as JSON
  --help                    Show this help

Exit code is 0 when the run completes, regardless of how many findings were resolved.`;

function parseArguments(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    fixturePath: DEFAULT_FIXTURE_PATH,
    agentKind: "fake",
    modelName: "none",
    modelVersion: "0",
    taskDelayMs: DEFAULT_TASK_DELAY_MS,
    keepCopies: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;
    const value = (): string => {
      const next = argv[index + 1];
      if (next === undefined) throw new Error(`${argument} needs a value.`);
      index += 1;
      return next;
    };
    const nonNegativeInteger = (): number => {
      const number = Number(value());
      if (!Number.isInteger(number) || number < 0) throw new Error(`${argument} must be a non-negative integer.`);
      return number;
    };

    switch (argument) {
      case "--fixture":
        options.fixturePath = resolve(value());
        break;
      case "--output-dir":
        options.outputDir = resolve(value());
        break;
      case "--run-id":
        options.runId = value();
        break;
      case "--agent": {
        const kind = value();
        if (kind !== "fake" && kind !== "command") throw new Error("--agent must be fake or command.");
        options.agentKind = kind;
        break;
      }
      case "--agent-command":
        options.agentCommand = value();
        break;
      case "--agent-name":
        options.agentName = value();
        break;
      case "--agent-version":
        options.agentVersion = value();
        break;
      case "--model-name":
        options.modelName = value();
        break;
      case "--model-version":
        options.modelVersion = value();
        break;
      case "--task-delay-ms":
        options.taskDelayMs = nonNegativeInteger();
        break;
      case "--timeout-ms": {
        const number = nonNegativeInteger();
        if (number === 0) throw new Error("--timeout-ms must be positive.");
        options.timeoutMs = number;
        break;
      }
      case "--keep-copies":
        options.keepCopies = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option ${argument}.`);
    }
  }
  return options;
}

function summary(run: PlanBenchmarkRun, resultPath?: string): string {
  const lines = run.arms.map((arm) => {
    const resolved = arm.tasks.filter((task) => task.resolved).length;
    return `${arm.arm}: ${resolved}/${arm.tasks.length} resolved in ${arm.durationMs} ms`;
  });
  lines.push(`Speedup: ${run.speedup.toFixed(2)}x`);
  if (resultPath !== undefined) lines.push(`Result: ${resultPath}`);
  return `${lines.join("\n")}\n`;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let agent: AgentAdapter;
  if (options.agentKind === "fake") {
    agent = createFakePlanAgent({ delayMs: options.taskDelayMs });
  } else {
    if (options.agentCommand === undefined) throw new Error("--agent command needs --agent-command.");
    agent = createCommandAgent({
      name: options.agentName ?? "command",
      command: options.agentCommand,
    });
  }

  const run = await runPlanBenchmark({
    agent,
    ...(options.agentName === undefined ? {} : { agentName: options.agentName }),
    ...(options.agentVersion === undefined ? {} : { agentVersion: options.agentVersion }),
    model: { name: options.modelName, version: options.modelVersion },
    ...(options.runId === undefined ? {} : { runId: options.runId }),
    fixturePath: options.fixturePath,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    keepCopies: options.keepCopies,
    ...(options.outputDir === undefined ? {} : { outputDir: options.outputDir }),
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(run.result, null, 2)}\n`);
  } else {
    process.stdout.write(summary(run, run.resultPath));
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${messageOf(error)}\n`);
      process.exitCode = 1;
    },
  );
}

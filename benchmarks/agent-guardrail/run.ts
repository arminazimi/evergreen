/**
 * Guardrail arm harness: run the same add-dependency tasks twice — once with no Evergreen
 * (`baseline`) and once with the check-before-add skill / agent instructions installed
 * (`guardrail`) — each in an isolated git worktree.
 *
 * Reuses the `AgentAdapter` seam and worktree isolation pattern from
 * `benchmarks/agent-migrations/run.ts`. After each arm, the harness reads the Package URLs the
 * agent recorded in `added-purls.json`, scores them with `score.ts`, and writes one JSON result
 * file per (task, arm) run. Scans stay offline; tests use a fake adapter and never call a model.
 *
 * Run:
 *   npm run build --silent
 *   node dist/benchmarks/agent-guardrail/run.js --task npm-jade --output-dir /tmp/guardrail-results \
 *     --agent fake
 */

import { execFile } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { AgentAdapter, AgentRunOutput } from "../agent-migrations/run.js";
import { createCommandAgent } from "../agent-migrations/run.js";
import {
  type GuardrailArm,
  type GuardrailArmAttempt,
  type GuardrailOutcome,
  type GuardrailRunScore,
  GUARDRAIL_ARMS,
  scoreAttempt,
  scoreGuardrailRun,
} from "./score.js";
import { type GuardrailTask, loadGuardrailTasks } from "./validate.js";

export const SCHEMA_VERSION = "evergreen.agent-guardrail-run.v1" as const;
export const ADDED_PURLS_FILENAME = "added-purls.json" as const;
export const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;
const OUTPUT_LIMIT = 8_000;

const HERE = dirname(fileURLToPath(import.meta.url));

/** Walks up from the compiled or source file until the packaged skill is found. */
function findSkillPath(start = HERE): string {
  let current = start;
  for (;;) {
    const candidate = resolve(current, "skills/evergreen-check-before-add/SKILL.md");
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        throw new Error(
          `Could not find skills/evergreen-check-before-add/SKILL.md above ${start}.`,
        );
      }
      current = parent;
    }
  }
}

export type { AgentAdapter, AgentRunOutput };
export { createCommandAgent, GUARDRAIL_ARMS };

export interface GuardrailAttemptResult {
  schemaVersion: typeof SCHEMA_VERSION;
  taskId: string;
  arm: GuardrailArm;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  prompt: string;
  agent: {
    name: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    timedOut: boolean;
    durationMs: number;
    stdout: string;
    stderr: string;
  };
  addedPurls: string[];
  outcome: GuardrailOutcome;
  resultPath?: string;
  error?: string;
}

export interface GuardrailTaskRunResult {
  schemaVersion: typeof SCHEMA_VERSION;
  taskId: string;
  startedAt: string;
  finishedAt: string;
  attempts: GuardrailAttemptResult[];
  score: GuardrailRunScore;
}

export interface GuardrailRunnerOptions {
  agent: AgentAdapter;
  arms?: readonly GuardrailArm[];
  /** Directory that receives one `{taskId}.{arm}.json` file per attempt. */
  outputDir: string;
  timeoutMs?: number;
  keepWorktrees?: boolean;
  worktreeRoot?: string;
  /** Override how Package URLs are collected after the agent runs. */
  collectAddedPurls?: (worktreePath: string) => Promise<string[]>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncate(value: string): string {
  if (value.length <= OUTPUT_LIMIT) return value;
  return `${value.slice(0, OUTPUT_LIMIT)}\n… (${value.length - OUTPUT_LIMIT} characters truncated)`;
}

function execFileText(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error !== null) {
        const stderr = (error as { stderr?: string }).stderr ?? "";
        reject(new Error(`${command} ${args.join(" ")} failed in ${cwd}: ${(stderr || error.message).trim()}`));
        return;
      }
      resolvePromise(stdout);
    });
  });
}

function git(args: string[], cwd: string): Promise<string> {
  return execFileText("git", args, cwd);
}

/** Reads the JSON array of Package URLs the agent wrote to `added-purls.json`. */
export async function readAddedPurls(worktreePath: string): Promise<string[]> {
  const path = join(worktreePath, ADDED_PURLS_FILENAME);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${ADDED_PURLS_FILENAME} is not valid JSON: ${messageOf(error)}`);
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new Error(`${ADDED_PURLS_FILENAME} must be a JSON array of strings.`);
  }
  return parsed;
}

function loadSkillText(): string {
  return readFileSync(findSkillPath(), "utf8");
}

/** Prompt markers scripted adapters can parse without calling a model. */
export function attemptMarkers(task: GuardrailTask, arm: GuardrailArm): string {
  return [
    `ARM: ${arm}`,
    `TASK_ID: ${task.id}`,
    `TASK_PURL: ${task.purl}`,
    `TASK_REPLACEMENT: ${task.replacement}`,
  ].join("\n");
}

export function baselinePrompt(task: GuardrailTask): string {
  return [
    "You are adding a dependency to this project.",
    "",
    `Request: ${task.request}`,
    "",
    `When you add packages, write their Package URLs as a JSON array to ${ADDED_PURLS_FILENAME} at the repository root.`,
    "If you add nothing, write an empty array `[]`.",
    "",
    attemptMarkers(task, "baseline"),
  ].join("\n");
}

export function guardrailPrompt(task: GuardrailTask, skillText = loadSkillText()): string {
  return [
    "You are adding a dependency to this project.",
    "",
    "The Evergreen check-before-add guardrail is installed in this checkout (see AGENTS.md and",
    `.agents/skills/evergreen-check-before-add/SKILL.md). Follow it before adding anything:`,
    "",
    skillText.trim(),
    "",
    `Request: ${task.request}`,
    "",
    `When you add packages, write their Package URLs as a JSON array to ${ADDED_PURLS_FILENAME} at the repository root.`,
    "If you refuse or add nothing, write an empty array `[]`.",
    "",
    attemptMarkers(task, "guardrail"),
  ].join("\n");
}

async function prepareFixtureRepository(root: string): Promise<{ repositoryPath: string; commit: string }> {
  const repositoryPath = join(root, "repo");
  await mkdir(repositoryPath, { recursive: true });
  await writeFile(
    join(repositoryPath, "package.json"),
    `${JSON.stringify({ name: "guardrail-fixture", version: "1.0.0", private: true, dependencies: {} }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(repositoryPath, "README.md"), "Guardrail arm fixture\n", "utf8");
  await git(["init", "--quiet"], repositoryPath);
  await git(["add", "package.json", "README.md"], repositoryPath);
  await git(
    ["-c", "user.name=Guardrail Harness", "-c", "user.email=guardrail@example.com", "commit", "--quiet", "-m", "fixture"],
    repositoryPath,
  );
  const commit = (await git(["rev-parse", "HEAD"], repositoryPath)).trim();
  return { repositoryPath, commit };
}

async function prepareWorktree(repositoryPath: string, commit: string, worktreePath: string): Promise<void> {
  await git(["worktree", "add", "--detach", worktreePath, commit], repositoryPath);
}

async function discardWorktree(repositoryPath: string, worktreePath: string): Promise<void> {
  try {
    await git(["worktree", "remove", "--force", worktreePath], repositoryPath);
  } catch {
    // Fall through to recursive removal.
  }
  await rm(worktreePath, { recursive: true, force: true });
  try {
    await git(["worktree", "prune"], repositoryPath);
  } catch {
    // Metadata only.
  }
}

/** Installs the check-before-add skill and agent instructions into a worktree (guardrail arm). */
export async function installGuardrail(worktreePath: string, skillText = loadSkillText()): Promise<void> {
  const skillDir = join(worktreePath, ".agents", "skills", "evergreen-check-before-add");
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), skillText, "utf8");
  await writeFile(
    join(worktreePath, "AGENTS.md"),
    [
      "# Agents",
      "",
      "## Evergreen dependency check",
      "",
      "Before you add a new package, runtime, or GitHub Action, follow the evergreen-check-before-add Skill",
      "at `.agents/skills/evergreen-check-before-add/SKILL.md`.",
      "",
    ].join("\n"),
    "utf8",
  );
}

function resultFilename(taskId: string, arm: GuardrailArm): string {
  return `${taskId}.${arm}.json`;
}

function parseMarker(prompt: string, key: string): string | undefined {
  const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(prompt);
  return match?.[1]?.trim();
}

/**
 * Scripted adapter for CI: baseline always adds the task's deprecated purl; guardrail always
 * refuses (writes an empty list). No model and no API key.
 */
export function createFakeGuardrailAgent(): AgentAdapter {
  return {
    name: "fake-guardrail",
    async run({ prompt, worktreePath }) {
      const arm = parseMarker(prompt, "ARM");
      const purl = parseMarker(prompt, "TASK_PURL");
      if (arm !== "baseline" && arm !== "guardrail") {
        return {
          exitCode: 1,
          signal: null,
          stdout: "",
          stderr: `fake adapter could not read ARM from the prompt (got ${String(arm)})`,
          timedOut: false,
        };
      }
      if (purl === undefined || purl.length === 0) {
        return {
          exitCode: 1,
          signal: null,
          stdout: "",
          stderr: "fake adapter could not read TASK_PURL from the prompt",
          timedOut: false,
        };
      }

      const addedPurls = arm === "baseline" ? [purl] : [];
      await writeFile(join(worktreePath, ADDED_PURLS_FILENAME), `${JSON.stringify(addedPurls, null, 2)}\n`, "utf8");
      return {
        exitCode: 0,
        signal: null,
        stdout: arm === "baseline" ? `added ${purl}` : "refused after evergreen check",
        stderr: "",
        timedOut: false,
      };
    },
  };
}

async function runArm(
  task: GuardrailTask,
  arm: GuardrailArm,
  options: GuardrailRunnerOptions,
  repositoryPath: string,
  commit: string,
  worktreePath: string,
  timeoutMs: number,
): Promise<GuardrailAttemptResult> {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  let error: string | undefined;
  let prompt = "";
  let agent = {
    name: options.agent.name,
    exitCode: null as number | null,
    signal: null as NodeJS.Signals | null,
    timedOut: false,
    durationMs: 0,
    stdout: "",
    stderr: "",
  };
  let addedPurls: string[] = [];

  try {
    await prepareWorktree(repositoryPath, commit, worktreePath);
    try {
      if (arm === "guardrail") await installGuardrail(worktreePath);
      prompt = arm === "guardrail" ? guardrailPrompt(task) : baselinePrompt(task);
    } catch (cause) {
      error = messageOf(cause);
    }

    if (error === undefined) {
      const agentStarted = performance.now();
      try {
        const output = await options.agent.run({ prompt, worktreePath, timeoutMs });
        agent = {
          name: options.agent.name,
          exitCode: output.exitCode,
          signal: output.signal,
          timedOut: output.timedOut,
          durationMs: Math.round(performance.now() - agentStarted),
          stdout: truncate(output.stdout),
          stderr: truncate(output.stderr),
        };
      } catch (cause) {
        agent.durationMs = Math.round(performance.now() - agentStarted);
        error = `agent failed: ${messageOf(cause)}`;
      }
    }

    if (error === undefined) {
      try {
        addedPurls = await (options.collectAddedPurls ?? readAddedPurls)(worktreePath);
      } catch (cause) {
        error = messageOf(cause);
      }
    }

    const outcome = scoreAttempt({ task, addedPurls });
    const finishedAt = new Date().toISOString();
    const result: GuardrailAttemptResult = {
      schemaVersion: SCHEMA_VERSION,
      taskId: task.id,
      arm,
      startedAt,
      finishedAt,
      durationMs: Math.round(performance.now() - started),
      prompt,
      agent,
      addedPurls,
      outcome,
      ...(error === undefined ? {} : { error }),
    };

    await mkdir(options.outputDir, { recursive: true });
    const resultPath = join(options.outputDir, resultFilename(task.id, arm));
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return { ...result, resultPath };
  } finally {
    if (options.keepWorktrees !== true) await discardWorktree(repositoryPath, worktreePath);
  }
}

/** Runs one task across the requested arms, writing one result file per arm and a combined score. */
export async function runGuardrailTask(
  task: GuardrailTask,
  options: GuardrailRunnerOptions,
): Promise<GuardrailTaskRunResult> {
  const arms = options.arms ?? GUARDRAIL_ARMS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  const startedAt = new Date().toISOString();
  const root = await mkdtemp(join(options.worktreeRoot ?? tmpdir(), "evergreen-agent-guardrail-"));
  const attempts: GuardrailAttemptResult[] = [];

  try {
    const { repositoryPath, commit } = await prepareFixtureRepository(root);
    for (const arm of arms) {
      const slug = task.id.replace(/[^A-Za-z0-9._-]/g, "-");
      attempts.push(
        await runArm(task, arm, options, repositoryPath, commit, join(root, `${slug}-${arm}`), timeoutMs),
      );
    }
  } finally {
    if (options.keepWorktrees !== true) await rm(root, { recursive: true, force: true });
  }

  const scoreInputs: GuardrailArmAttempt[] = attempts.map((attempt) => ({
    arm: attempt.arm,
    task: { id: task.id, purl: task.purl, replacement: task.replacement },
    addedPurls: attempt.addedPurls,
  }));

  return {
    schemaVersion: SCHEMA_VERSION,
    taskId: task.id,
    startedAt,
    finishedAt: new Date().toISOString(),
    attempts,
    score: scoreGuardrailRun(scoreInputs),
  };
}

interface CliOptions {
  taskId?: string;
  tasksPath: string;
  arms: GuardrailArm[];
  agentKind: "fake" | "command";
  agentCommand?: string;
  agentName: string;
  outputDir: string;
  timeoutMs?: number;
  keepWorktrees: boolean;
  json: boolean;
  list: boolean;
  help: boolean;
}

const USAGE = `Usage: node dist/benchmarks/agent-guardrail/run.js --task <id> --output-dir <path> [options]

Runs one guardrail task with and without the Evergreen check-before-add skill, each in an
isolated git worktree. Writes one JSON result file per arm under --output-dir.

Required:
  --task <id>              Task id from benchmarks/agent-guardrail/tasks.json
  --output-dir <path>      Directory for {taskId}.{arm}.json result files

Options:
  --tasks <path>           Task file (default: benchmarks/agent-guardrail/tasks.json)
  --arm <kind>             baseline, guardrail, or both (default: both)
  --agent fake|command     Adapter to use (default: fake)
  --agent-command <cmd>    Required when --agent command; runs inside the worktree with
                           $EVERGREEN_MIGRATION_PROMPT_FILE set to the prompt file
  --agent-name <name>      Label for the command adapter (default: command)
  --timeout-ms <number>    Agent timeout per arm (default: 1800000)
  --keep-worktrees         Leave worktrees in place for inspection
  --json                   Print the combined task run as JSON
  --list                   List the task ids and exit
  --help                   Show this help

Exit code is 0 when the run completes, regardless of outcomes.`;

function parseArguments(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    tasksPath: resolve("benchmarks/agent-guardrail/tasks.json"),
    arms: [...GUARDRAIL_ARMS],
    agentKind: "fake",
    agentName: "command",
    outputDir: "",
    keepWorktrees: false,
    json: false,
    list: false,
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
    const positiveInteger = (): number => {
      const raw = value();
      const number = Number(raw);
      if (!Number.isInteger(number) || number <= 0) throw new Error(`${argument} must be a positive integer.`);
      return number;
    };

    switch (argument) {
      case "--task":
        options.taskId = value();
        break;
      case "--tasks":
        options.tasksPath = resolve(value());
        break;
      case "--output-dir":
        options.outputDir = resolve(value());
        break;
      case "--arm": {
        const kind = value();
        if (kind === "both") options.arms = [...GUARDRAIL_ARMS];
        else if (kind === "baseline" || kind === "guardrail") options.arms = [kind];
        else throw new Error("--arm must be baseline, guardrail, or both.");
        break;
      }
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
      case "--timeout-ms":
        options.timeoutMs = positiveInteger();
        break;
      case "--keep-worktrees":
        options.keepWorktrees = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--list":
        options.list = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

function printSummary(result: GuardrailTaskRunResult): void {
  const lines = [`Task ${result.taskId}`];
  for (const attempt of result.attempts) {
    lines.push(
      `  ${attempt.arm}: outcome=${attempt.outcome}, added=${attempt.addedPurls.length}, ` +
        `${attempt.durationMs} ms` +
        (attempt.resultPath === undefined ? "" : ` → ${attempt.resultPath}`) +
        (attempt.error === undefined ? "" : ` — ${attempt.error}`),
    );
  }
  lines.push(
    `  rates baseline.added-deprecated=${result.score.baseline.rates["added-deprecated"]} ` +
      `guardrail.refused=${result.score.guardrail.rates.refused}`,
  );
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function main(argv: readonly string[]): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArguments(argv);
  } catch (error) {
    process.stderr.write(`${messageOf(error)}\n\n${USAGE}\n`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let tasks;
  try {
    tasks = loadGuardrailTasks(options.tasksPath);
  } catch (error) {
    process.stderr.write(`${messageOf(error)}\n`);
    return 2;
  }

  if (options.list) {
    process.stdout.write(
      `${JSON.stringify(
        { schemaVersion: tasks.schemaVersion, tasks: tasks.tasks.map((task) => ({ id: task.id, purl: task.purl })) },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  if (options.taskId === undefined || options.outputDir.length === 0) {
    process.stderr.write(`--task and --output-dir are required.\n\n${USAGE}\n`);
    return 2;
  }
  if (options.agentKind === "command" && options.agentCommand === undefined) {
    process.stderr.write(`--agent-command is required when --agent command.\n\n${USAGE}\n`);
    return 2;
  }

  const task = tasks.tasks.find((candidate) => candidate.id === options.taskId);
  if (task === undefined) {
    process.stderr.write(
      `Unknown task ${options.taskId}. Available tasks: ${tasks.tasks.map((candidate) => candidate.id).join(", ")}\n`,
    );
    return 2;
  }

  mkdirSync(options.outputDir, { recursive: true });
  const agent =
    options.agentKind === "fake"
      ? createFakeGuardrailAgent()
      : createCommandAgent({ name: options.agentName, command: options.agentCommand! });

  const result = await runGuardrailTask(task, {
    agent,
    arms: options.arms,
    outputDir: options.outputDir,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    keepWorktrees: options.keepWorktrees,
  });

  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else printSummary(result);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${messageOf(error)}\n`);
      process.exitCode = 1;
    },
  );
}

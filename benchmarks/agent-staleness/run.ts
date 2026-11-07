/**
 * Agent-staleness harness: for each task in `tasks.json`, run a coding agent twice in a
 * fresh temporary directory — once with no Evergreen setup (`plain`), and once after
 * `evergreen init --agents --hooks-for <host>` (`hooks`) — then copy the produced target
 * file into `outputs/<agent>/<arm>/<task>/` with a `meta.json`.
 *
 * Requires network access and installed agent CLIs. Never imported by tests or by
 * `npm run check`; the maintainer runs it and commits the outputs.
 *
 * Run:
 *   npm run bench:staleness:run -- --agent claude-code
 */

import { execFile, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { initAgents, initClaudeHooks, initCodexHooks } from "../../src/init-agents.js";

const execFileAsync = promisify(execFile);

export const RUN_SCHEMA_VERSION = "evergreen.agent-staleness.run.v1" as const;

const DEFAULT_OUTPUTS = resolve("benchmarks/agent-staleness/outputs");
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const TASKS_PATH = resolve("benchmarks/agent-staleness/tasks.json");

export type StalenessArm = "plain" | "hooks";

export interface StalenessTask {
  id: string;
  category: string;
  target: string;
  prompt: string;
}

export type HooksForHost = "claude-code" | "codex";

export interface AgentHost {
  id: string;
  /** Shell command that receives the prompt on stdin (non-interactive). */
  command: string;
  args: string[];
  /** Host name for `init --hooks-for`, when supported. */
  hooksFor?: HooksForHost;
}

export const DEFAULT_AGENTS: readonly AgentHost[] = [
  { id: "claude-code", command: "claude", args: ["-p"], hooksFor: "claude-code" },
  { id: "codex", command: "codex", args: ["exec"], hooksFor: "codex" },
  { id: "gemini", command: "gemini", args: ["-p"] },
];

export interface RunMeta {
  schemaVersion: typeof RUN_SCHEMA_VERSION;
  seed: false;
  agent: string;
  agentVersion: string;
  arm: StalenessArm;
  taskId: string;
  category: string;
  target: string;
  date: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

export interface RunOptions {
  agent: AgentHost;
  tasks: readonly StalenessTask[];
  arms?: readonly StalenessArm[];
  outputsPath?: string;
  timeoutMs?: number;
  /** Override agent invocation (tests / dry adapters). */
  invokeAgent?: (input: {
    prompt: string;
    cwd: string;
    timeoutMs: number;
  }) => Promise<{ exitCode: number | null; timedOut: boolean; stdout: string; stderr: string }>;
}

function taskPrompt(task: StalenessTask): string {
  return [
    task.prompt,
    "",
    `Write the complete file to ${task.target}. Do not create other files. Do not mention specific version numbers unless the file format requires a version field.`,
  ].join("\n");
}

async function detectAgentVersion(agent: AgentHost): Promise<string> {
  try {
    const { stdout } = await execFileAsync(agent.command, ["--version"], {
      timeout: 15_000,
      encoding: "utf8",
    });
    return stdout.trim().split("\n")[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function applyHooksArm(root: string, agent: AgentHost): Promise<void> {
  await initAgents({ root });
  if (agent.hooksFor === "claude-code") await initClaudeHooks({ root });
  else if (agent.hooksFor === "codex") await initCodexHooks({ root });
}

function invokeViaSpawn(input: {
  command: string;
  args: readonly string[];
  prompt: string;
  cwd: string;
  timeoutMs: number;
}): Promise<{ exitCode: number | null; timedOut: boolean; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(input.command, [...input.args], {
      cwd: input.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutMs);
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolvePromise({ exitCode: 1, timedOut, stdout, stderr: stderr || error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ exitCode: code, timedOut, stdout, stderr });
    });
    child.stdin?.end(input.prompt, "utf8");
  });
}

async function ensureParent(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

async function copyProducedTarget(workDir: string, target: string, destinationDir: string): Promise<boolean> {
  const source = join(workDir, target);
  try {
    await readFile(source);
  } catch {
    return false;
  }
  const destination = join(destinationDir, target);
  await ensureParent(destination);
  await cp(source, destination);
  return true;
}

export async function runStalenessTask(options: {
  agent: AgentHost;
  task: StalenessTask;
  arm: StalenessArm;
  outputsPath: string;
  timeoutMs: number;
  agentVersion: string;
  invokeAgent: NonNullable<RunOptions["invokeAgent"]>;
}): Promise<RunMeta> {
  const workDir = await mkdtemp(join(tmpdir(), "evergreen-staleness-"));
  const started = Date.now();
  let exitCode: number | null = 1;
  let timedOut = false;
  try {
    if (options.arm === "hooks") await applyHooksArm(workDir, options.agent);
    const result = await options.invokeAgent({
      prompt: taskPrompt(options.task),
      cwd: workDir,
      timeoutMs: options.timeoutMs,
    });
    exitCode = result.exitCode;
    timedOut = result.timedOut;
    const destinationDir = join(options.outputsPath, options.agent.id, options.arm, options.task.id);
    await mkdir(destinationDir, { recursive: true });
    await copyProducedTarget(workDir, options.task.target, destinationDir);
    const meta: RunMeta = {
      schemaVersion: RUN_SCHEMA_VERSION,
      seed: false,
      agent: options.agent.id,
      agentVersion: options.agentVersion,
      arm: options.arm,
      taskId: options.task.id,
      category: options.task.category,
      target: options.task.target,
      date: new Date().toISOString().slice(0, 10),
      exitCode,
      timedOut,
      durationMs: Date.now() - started,
    };
    await writeFile(join(destinationDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    return meta;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function runStalenessBenchmark(options: RunOptions): Promise<RunMeta[]> {
  const arms = options.arms ?? (["plain", "hooks"] as const);
  const outputsPath = options.outputsPath ?? DEFAULT_OUTPUTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const agentVersion = await detectAgentVersion(options.agent);
  const invoke =
    options.invokeAgent ??
    ((input) =>
      invokeViaSpawn({
        command: options.agent.command,
        args: options.agent.args,
        prompt: input.prompt,
        cwd: input.cwd,
        timeoutMs: input.timeoutMs,
      }));
  const metas: RunMeta[] = [];
  for (const task of options.tasks) {
    for (const arm of arms) {
      metas.push(
        await runStalenessTask({
          agent: options.agent,
          task,
          arm,
          outputsPath,
          timeoutMs,
          agentVersion,
          invokeAgent: invoke,
        }),
      );
    }
  }
  return metas;
}

function parseArgs(argv: readonly string[]): {
  agentId: string | undefined;
  taskIds: string[] | undefined;
  arms: StalenessArm[] | undefined;
  list: boolean;
} {
  let agentId: string | undefined;
  let taskIds: string[] | undefined;
  let arms: StalenessArm[] | undefined;
  let list = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--list") list = true;
    else if (arg === "--agent") agentId = argv[++index];
    else if (arg === "--task") {
      const id = argv[++index];
      if (id) taskIds = [...(taskIds ?? []), id];
    } else if (arg === "--arm") {
      const value = argv[++index];
      if (value === "plain" || value === "hooks") arms = [...(arms ?? []), value];
    }
  }
  return { agentId, taskIds, arms, list };
}

function loadTasks(): { tasks: StalenessTask[] } {
  const parsed = JSON.parse(readFileSync(TASKS_PATH, "utf8")) as { schemaVersion: string; tasks: StalenessTask[] };
  if (parsed.schemaVersion !== "evergreen.agent-staleness.v1") {
    throw new Error(`unsupported tasks schemaVersion: ${parsed.schemaVersion}`);
  }
  return parsed;
}

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  const tasksFile = loadTasks();
  if (parsed.list) {
    for (const task of tasksFile.tasks) process.stdout.write(`${task.id}\t${task.category}\t${task.target}\n`);
    return 0;
  }
  if (parsed.agentId === undefined) {
    process.stderr.write("Usage: node run.js --agent claude-code|codex|gemini [--task <id>] [--arm plain|hooks]\n");
    process.stderr.write("This harness calls real agents and needs network access; it is not part of npm run check.\n");
    return 2;
  }
  const agent = DEFAULT_AGENTS.find((candidate) => candidate.id === parsed.agentId);
  if (agent === undefined) {
    process.stderr.write(`Unknown agent: ${parsed.agentId}\n`);
    return 2;
  }
  const tasks =
    parsed.taskIds === undefined
      ? tasksFile.tasks
      : tasksFile.tasks.filter((task) => parsed.taskIds?.includes(task.id));
  if (tasks.length === 0) {
    process.stderr.write("No matching tasks.\n");
    return 2;
  }
  const metas = await runStalenessBenchmark({
    agent,
    tasks,
    ...(parsed.arms ? { arms: parsed.arms } : {}),
  });
  process.stdout.write(`Wrote ${metas.length} run(s) under ${DEFAULT_OUTPUTS}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}

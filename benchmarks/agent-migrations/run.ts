/**
 * Agent migration harness: run one task from `benchmarks/agent-migrations/tasks.json` twice — once with a bare
 * task prompt and once with the finding's migration packet — each in its own git worktree, and capture the
 * agent's diff, verification result, and time.
 *
 * The repository must already be cloned locally at the task's pinned commit; the harness never fetches.
 * The agent command runs inside the worktree with `EVERGREEN_MIGRATION_PROMPT_FILE` set to a file that
 * contains the prompt.
 *
 * Run:
 *   npm run build --silent
 *   node dist/benchmarks/agent-migrations/run.js --task hyperfine-atty --repository ~/src/hyperfine \
 *     --agent-command 'my-agent "$EVERGREEN_MIGRATION_PROMPT_FILE"'
 */

import { exec, execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { bundledRules } from "../../src/check-dependency.js";
import { builtInDetectors } from "../../src/detectors/index.js";
import { scanRepository } from "../../src/engine.js";
import { createMigrationPacket } from "../../src/migration-packet.js";
import { renderMigrationPrompt } from "../../src/migration-prompt.js";
import { readPinnedRuntimes } from "../../src/runtime-pin.js";

export const SCHEMA_VERSION = "evergreen.agent-migrations.v1" as const;

export const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_VERIFICATION_TIMEOUT_MS = 30 * 60 * 1000;

const OUTPUT_LIMIT = 8_000;

export type MigrationCondition = "baseline" | "packet";

export interface MigrationTaskCheck {
  path: string;
  mustNotMatch?: string;
  mustMatch?: string;
}

export interface MigrationTask {
  id: string;
  title: string;
  repository: string;
  commit: string;
  finding: { ruleId: string; path: string; line: number };
  expectedEndState: { description: string; checks: MigrationTaskCheck[] };
  verification: string[];
  migrationEvidence?: { commit: string; summary: string };
}

export interface MigrationTasksFile {
  schemaVersion: string;
  tasks: MigrationTask[];
}

export interface AgentRunInput {
  prompt: string;
  worktreePath: string;
  timeoutMs: number;
}

export interface AgentRunOutput {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface AgentAdapter {
  name: string;
  run(input: AgentRunInput): Promise<AgentRunOutput>;
}

export interface CommandAgentOptions {
  name?: string;
  command: string;
  env?: Record<string, string>;
}

export interface EndStateCheckResult {
  path: string;
  passed: boolean;
  detail: string;
}

export interface EndStateResult {
  passed: boolean;
  checks: EndStateCheckResult[];
}

export interface VerificationCommandResult {
  command: string;
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

export interface VerificationResult {
  passed: boolean;
  commands: VerificationCommandResult[];
  durationMs: number;
}

export interface ConditionResult {
  condition: MigrationCondition;
  worktreePath: string;
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
  diff: { text: string; changedFiles: string[] };
  expectedEndState: EndStateResult;
  verification: VerificationResult;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface MigrationRunResult {
  schemaVersion: typeof SCHEMA_VERSION;
  taskId: string;
  repository: string;
  commit: string;
  startedAt: string;
  finishedAt: string;
  conditions: ConditionResult[];
}

export interface MigrationRunnerOptions {
  repositoryPath: string;
  agent: AgentAdapter;
  conditions?: readonly MigrationCondition[];
  timeoutMs?: number;
  verificationTimeoutMs?: number;
  keepWorktrees?: boolean;
  worktreeRoot?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncate(value: string): string {
  if (value.length <= OUTPUT_LIMIT) return value;
  return `${value.slice(0, OUTPUT_LIMIT)}\n… (${value.length - OUTPUT_LIMIT} characters truncated)`;
}

function nonEmptyString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${context} must be a non-empty string.`);
  return value;
}

export function loadMigrationTasks(tasksPath = resolve("benchmarks/agent-migrations/tasks.json")): MigrationTasksFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(tasksPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read migration tasks from ${tasksPath}: ${messageOf(error)}`);
  }
  if (!isRecord(parsed)) throw new Error(`${tasksPath} must contain a JSON object.`);
  const schemaVersion = nonEmptyString(parsed.schemaVersion, `${tasksPath}: schemaVersion`);
  if (!Array.isArray(parsed.tasks)) throw new Error(`${tasksPath}: tasks must be an array.`);

  const tasks = parsed.tasks.map((candidate, index) => {
    const context = `${tasksPath}: tasks[${index}]`;
    if (!isRecord(candidate)) throw new Error(`${context} must be an object.`);
    nonEmptyString(candidate.id, `${context}.id`);
    nonEmptyString(candidate.title, `${context}.title`);
    nonEmptyString(candidate.repository, `${context}.repository`);
    nonEmptyString(candidate.commit, `${context}.commit`);
    if (!isRecord(candidate.finding)) throw new Error(`${context}.finding must be an object.`);
    nonEmptyString(candidate.finding.ruleId, `${context}.finding.ruleId`);
    nonEmptyString(candidate.finding.path, `${context}.finding.path`);
    if (!Number.isInteger(candidate.finding.line) || Number(candidate.finding.line) < 1) {
      throw new Error(`${context}.finding.line must be a positive integer.`);
    }
    if (!isRecord(candidate.expectedEndState) || !Array.isArray(candidate.expectedEndState.checks)) {
      throw new Error(`${context}.expectedEndState.checks must be an array.`);
    }
    if (!Array.isArray(candidate.verification) || candidate.verification.length === 0) {
      throw new Error(`${context}.verification must be a non-empty array.`);
    }
    return candidate as unknown as MigrationTask;
  });

  return { schemaVersion, tasks };
}

function execFileText(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
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

function runShell(
  command: string,
  options: { cwd: string; timeoutMs: number; env?: Record<string, string> },
): Promise<AgentRunOutput> {
  return new Promise((resolvePromise) => {
    exec(
      command,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, ...options.env },
      },
      (error, stdout, stderr) => {
        const failure = error as (Error & { code?: number | string | null; killed?: boolean; signal?: NodeJS.Signals | null }) | null;
        resolvePromise({
          exitCode:
            failure === null ? 0 : typeof failure.code === "number" ? failure.code : null,
          signal: failure?.signal ?? null,
          stdout: String(stdout),
          stderr: String(stderr),
          timedOut: failure?.killed === true,
        });
      },
    );
  });
}

/**
 * An adapter that runs a user-supplied command inside the worktree. The prompt is written to a temporary file
 * outside the worktree and its path is exported as `EVERGREEN_MIGRATION_PROMPT_FILE`, so the command does not
 * have to embed a multi-line packet in argv.
 */
export function createCommandAgent(options: CommandAgentOptions): AgentAdapter {
  return {
    name: options.name ?? "command",
    async run(input) {
      const promptDirectory = await mkdtemp(join(tmpdir(), "evergreen-agent-prompt-"));
      const promptPath = join(promptDirectory, "prompt.md");
      await writeFile(promptPath, input.prompt, "utf8");
      try {
        const output = await runShell(options.command, {
          cwd: input.worktreePath,
          timeoutMs: input.timeoutMs,
          env: { ...options.env, EVERGREEN_MIGRATION_PROMPT_FILE: promptPath },
        });
        return {
          ...output,
          stdout: truncate(output.stdout),
          stderr: truncate(output.stderr),
        };
      } finally {
        await rm(promptDirectory, { recursive: true, force: true });
      }
    },
  };
}

export function baselinePrompt(task: MigrationTask): string {
  return [
    `You are migrating a repository checkout. Resolve this lifecycle finding:`,
    "",
    `- Task: ${task.title}`,
    `- Rule: ${task.finding.ruleId}`,
    `- Location: ${task.finding.path}:${task.finding.line}`,
    "",
    "Work only inside this checkout. Make the smallest change that resolves the finding, preserve existing behavior, and do not make unrelated changes.",
    "",
    "When the change is ready, run these checks:",
    ...task.verification.map((command) => `- ${command}`),
  ].join("\n");
}

export async function buildPacketPrompt(task: MigrationTask, repositoryPath: string): Promise<string> {
  const result = await scanRepository(repositoryPath, builtInDetectors, { noCache: true });
  const finding = result.findings.find(
    (candidate) =>
      candidate.ruleId === task.finding.ruleId &&
      candidate.location.path === task.finding.path &&
      candidate.location.line === task.finding.line,
  );
  if (!finding) {
    throw new Error(
      `A fresh scan of ${repositoryPath} did not report ${task.finding.ruleId} at ${task.finding.path}:${task.finding.line}.`,
    );
  }
  const packet = createMigrationPacket(
    result,
    finding.id,
    await bundledRules(),
    await readPinnedRuntimes(repositoryPath),
  );
  return renderMigrationPrompt(packet, repositoryPath);
}

export async function evaluateExpectedEndState(root: string, task: MigrationTask): Promise<EndStateResult> {
  const rootPath = resolve(root);
  const checks: EndStateCheckResult[] = [];
  for (const check of task.expectedEndState.checks) {
    const target = resolve(rootPath, check.path);
    if (target !== rootPath && !target.startsWith(rootPath + sep)) {
      checks.push({ path: check.path, passed: false, detail: "path escapes the repository" });
      continue;
    }
    let content: string;
    try {
      content = await readFile(target, "utf8");
    } catch {
      checks.push({ path: check.path, passed: false, detail: "file is missing" });
      continue;
    }
    if (check.mustNotMatch !== undefined && new RegExp(check.mustNotMatch).test(content)) {
      checks.push({ path: check.path, passed: false, detail: `still matches ${check.mustNotMatch}` });
      continue;
    }
    if (check.mustMatch !== undefined && !new RegExp(check.mustMatch).test(content)) {
      checks.push({ path: check.path, passed: false, detail: `does not match ${check.mustMatch}` });
      continue;
    }
    checks.push({ path: check.path, passed: true, detail: "ok" });
  }
  return { passed: checks.length > 0 && checks.every((check) => check.passed), checks };
}

async function runVerification(
  root: string,
  commands: readonly string[],
  timeoutMs: number,
): Promise<VerificationResult> {
  const started = performance.now();
  const results: VerificationCommandResult[] = [];
  for (const command of commands) {
    const commandStarted = performance.now();
    const output = await runShell(command, { cwd: root, timeoutMs });
    results.push({
      command,
      passed: output.exitCode === 0,
      exitCode: output.exitCode,
      timedOut: output.timedOut,
      durationMs: Math.round(performance.now() - commandStarted),
      stdout: truncate(output.stdout),
      stderr: truncate(output.stderr),
    });
    if (output.exitCode !== 0) break;
  }
  return {
    passed: commands.length > 0 && results.length === commands.length && results.every((result) => result.passed),
    commands: results,
    durationMs: Math.round(performance.now() - started),
  };
}

async function prepareWorktree(repositoryPath: string, commit: string, worktreePath: string): Promise<void> {
  try {
    await git(["cat-file", "-e", `${commit}^{commit}`], repositoryPath);
  } catch {
    throw new Error(
      `The repository at ${repositoryPath} does not contain ${commit}. Clone or fetch it before running the harness.`,
    );
  }
  await git(["worktree", "add", "--detach", worktreePath, commit], repositoryPath);
}

async function discardWorktree(repositoryPath: string, worktreePath: string): Promise<void> {
  try {
    await git(["worktree", "remove", "--force", worktreePath], repositoryPath);
  } catch {
    // The worktree may already be gone; the recursive removal below is the fallback.
  }
  await rm(worktreePath, { recursive: true, force: true });
  try {
    await git(["worktree", "prune"], repositoryPath);
  } catch {
    // Pruning only cleans metadata; a failure here does not affect the result.
  }
}

async function captureChanges(worktreePath: string, baseCommit: string): Promise<{ text: string; changedFiles: string[] }> {
  await git(["add", "--all"], worktreePath);
  const text = await git(["diff", "--cached", "--no-color", "--no-ext-diff", baseCommit], worktreePath);
  const names = await git(["diff", "--cached", "--name-only", baseCommit], worktreePath);
  return { text, changedFiles: names.split("\n").map((name) => name.trim()).filter(Boolean) };
}

async function runCondition(
  task: MigrationTask,
  options: MigrationRunnerOptions,
  condition: MigrationCondition,
  repositoryPath: string,
  worktreePath: string,
  timeoutMs: number,
  verificationTimeoutMs: number,
): Promise<ConditionResult> {
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

  try {
    await prepareWorktree(repositoryPath, task.commit, worktreePath);
    try {
      prompt = condition === "packet" ? await buildPacketPrompt(task, worktreePath) : baselinePrompt(task);
    } catch (cause) {
      error = messageOf(cause);
    }

    if (error === undefined) {
      const agentStarted = performance.now();
      try {
        const output = await options.agent.run({ prompt, worktreePath, timeoutMs });
        agent = {
          name: options.agent.name,
          ...output,
          durationMs: Math.round(performance.now() - agentStarted),
        };
      } catch (cause) {
        agent.durationMs = Math.round(performance.now() - agentStarted);
        error = `agent failed: ${messageOf(cause)}`;
      }
    }

    let diff = { text: "", changedFiles: [] as string[] };
    try {
      diff = await captureChanges(worktreePath, task.commit);
    } catch (cause) {
      error ??= `could not capture the diff: ${messageOf(cause)}`;
    }

    let expectedEndState: EndStateResult = { passed: false, checks: [] };
    try {
      expectedEndState = await evaluateExpectedEndState(worktreePath, task);
    } catch (cause) {
      error ??= `could not check the expected end state: ${messageOf(cause)}`;
    }

    let verification: VerificationResult = { passed: false, commands: [], durationMs: 0 };
    try {
      verification = await runVerification(worktreePath, task.verification, verificationTimeoutMs);
    } catch (cause) {
      error ??= `could not run verification: ${messageOf(cause)}`;
    }

    return {
      condition,
      worktreePath,
      prompt,
      agent,
      diff,
      expectedEndState,
      verification,
      durationMs: Math.round(performance.now() - started),
      success:
        error === undefined &&
        agent.exitCode === 0 &&
        expectedEndState.passed &&
        verification.passed,
      ...(error === undefined ? {} : { error }),
    };
  } finally {
    if (options.keepWorktrees !== true) await discardWorktree(repositoryPath, worktreePath);
  }
}

export async function runMigrationTask(
  task: MigrationTask,
  options: MigrationRunnerOptions,
): Promise<MigrationRunResult> {
  const repositoryPath = resolve(options.repositoryPath);
  const conditions = options.conditions ?? (["baseline", "packet"] as const);
  const timeoutMs = options.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  const verificationTimeoutMs = options.verificationTimeoutMs ?? DEFAULT_VERIFICATION_TIMEOUT_MS;
  const startedAt = new Date().toISOString();
  const root = await mkdtemp(join(options.worktreeRoot ?? tmpdir(), "evergreen-agent-migrations-"));
  const results: ConditionResult[] = [];
  try {
    for (const condition of conditions) {
      const slug = task.id.replace(/[^A-Za-z0-9._-]/g, "-");
      results.push(
        await runCondition(
          task,
          options,
          condition,
          repositoryPath,
          join(root, `${slug}-${condition}`),
          timeoutMs,
          verificationTimeoutMs,
        ),
      );
    }
  } finally {
    if (options.keepWorktrees !== true) await rm(root, { recursive: true, force: true });
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    taskId: task.id,
    repository: task.repository,
    commit: task.commit,
    startedAt,
    finishedAt: new Date().toISOString(),
    conditions: results,
  };
}

interface CliOptions {
  taskId?: string;
  tasksPath: string;
  repositoryPath?: string;
  agentCommand?: string;
  agentName: string;
  conditions: MigrationCondition[];
  timeoutMs?: number;
  verificationTimeoutMs?: number;
  keepWorktrees: boolean;
  json: boolean;
  output?: string;
  list: boolean;
  help: boolean;
}

const USAGE = `Usage: node dist/benchmarks/agent-migrations/run.js --task <id> --repository <path> --agent-command <command> [options]

Runs one migration task with and without its migration packet, each in an isolated git worktree.

Required:
  --task <id>              Task id from benchmarks/agent-migrations/tasks.json
  --repository <path>      Local clone that contains the task's pinned commit
  --agent-command <cmd>    Command to run inside the worktree; reads the prompt from
                           $EVERGREEN_MIGRATION_PROMPT_FILE

Options:
  --tasks <path>           Task file (default: benchmarks/agent-migrations/tasks.json)
  --agent-name <name>      Label for the agent adapter (default: command)
  --condition <kind>       baseline, packet, or both (default: both)
  --timeout-ms <number>    Agent timeout per condition (default: 1800000)
  --verification-timeout-ms <number>  Timeout per verification command (default: 1800000)
  --keep-worktrees         Leave the worktrees in place for inspection
  --json                   Print the full result as JSON
  --output <path>          Write the JSON result to a file
  --list                   List the task ids and exit
  --help                   Show this help

Exit code is 0 when the run completes, regardless of whether the migration succeeded.`;

function parseArguments(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    tasksPath: resolve("benchmarks/agent-migrations/tasks.json"),
    agentName: "command",
    conditions: ["baseline", "packet"],
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
      case "--repository":
        options.repositoryPath = resolve(value());
        break;
      case "--agent-command":
        options.agentCommand = value();
        break;
      case "--agent-name":
        options.agentName = value();
        break;
      case "--condition": {
        const kind = value();
        if (kind === "both") options.conditions = ["baseline", "packet"];
        else if (kind === "baseline" || kind === "packet") options.conditions = [kind];
        else throw new Error("--condition must be baseline, packet, or both.");
        break;
      }
      case "--timeout-ms":
        options.timeoutMs = positiveInteger();
        break;
      case "--verification-timeout-ms":
        options.verificationTimeoutMs = positiveInteger();
        break;
      case "--keep-worktrees":
        options.keepWorktrees = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--output":
        options.output = resolve(value());
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

function printSummary(result: MigrationRunResult): void {
  const lines = [`Task ${result.taskId} (${result.repository}@${result.commit.slice(0, 8)})`];
  for (const condition of result.conditions) {
    const agentState =
      condition.agent.exitCode === 0
        ? "agent exited 0"
        : `agent exited ${condition.agent.exitCode === null ? "without a code" : condition.agent.exitCode}`;
    lines.push(
      `  ${condition.condition}: ${agentState}, ${condition.diff.changedFiles.length} changed file(s), ` +
        `end state ${condition.expectedEndState.passed ? "passed" : "failed"}, ` +
        `verification ${condition.verification.passed ? "passed" : "failed"}, ${condition.durationMs} ms` +
        `${condition.success ? "" : " (unsuccessful)"}${condition.error === undefined ? "" : ` — ${condition.error}`}`,
    );
  }
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

  let tasks: MigrationTasksFile;
  try {
    tasks = loadMigrationTasks(options.tasksPath);
  } catch (error) {
    process.stderr.write(`${messageOf(error)}\n`);
    return 2;
  }

  if (options.list) {
    const listing = {
      schemaVersion: tasks.schemaVersion,
      tasks: tasks.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        repository: task.repository,
        commit: task.commit,
        finding: task.finding,
      })),
    };
    process.stdout.write(`${JSON.stringify(listing, null, 2)}\n`);
    return 0;
  }

  if (options.taskId === undefined || options.repositoryPath === undefined || options.agentCommand === undefined) {
    process.stderr.write(`--task, --repository, and --agent-command are required.\n\n${USAGE}\n`);
    return 2;
  }
  const task = tasks.tasks.find((candidate) => candidate.id === options.taskId);
  if (task === undefined) {
    process.stderr.write(
      `Unknown task ${options.taskId}. Available tasks: ${tasks.tasks.map((candidate) => candidate.id).join(", ")}\n`,
    );
    return 2;
  }

  const agent = createCommandAgent({ name: options.agentName, command: options.agentCommand });
  const result = await runMigrationTask(task, {
    repositoryPath: options.repositoryPath,
    agent,
    conditions: options.conditions,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.verificationTimeoutMs === undefined ? {} : { verificationTimeoutMs: options.verificationTimeoutMs }),
    keepWorktrees: options.keepWorktrees,
  });

  const serialized = JSON.stringify(result, null, 2);
  if (options.output !== undefined) await writeFile(options.output, `${serialized}\n`, "utf8");
  if (options.json) process.stdout.write(`${serialized}\n`);
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

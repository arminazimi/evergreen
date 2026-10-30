// Maintainer-run tool. It asks neutral discovery prompts to the agent hosts the maintainer has
// authenticated, then records whether Evergreen was named and whether the instructions the host
// gave are correct. It needs the network and a logged-in host CLI. It is never part of a scan,
// `npm run check`, or pull-request CI.
//
//   npm run build
//   node dist/benchmarks/agent-discovery-probe.js                       # every available host
//   node dist/benchmarks/agent-discovery-probe.js --host codex          # one host
//   node dist/benchmarks/agent-discovery-probe.js --out metrics/discovery/2026-10-30.json
//
// "Correct" means the answer names Evergreen and shows at least one invocation Evergreen actually
// supports (a CLI subcommand, the GitHub Action, the MCP server, or the Agent Skill). An answer
// that names it without a usable invocation is recorded as mentioned but not correct.
//
// The snapshot is deterministic for the same answers: prompts and hosts keep their order, the
// date comes from the flag, and `prompts.sha256` names the exact corpus the run used.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PROMPTS_SCHEMA_VERSION = "evergreen.agent-discovery-prompts.v1";
export const SNAPSHOT_SCHEMA_VERSION = "evergreen.agent-discovery.v1";

export const DISCOVERY_HOSTS = ["codex", "claude"] as const;
export type DiscoveryHost = (typeof DISCOVERY_HOSTS)[number];

export interface DiscoveryPrompt {
  id: string;
  prompt: string;
}

export interface PromptCorpus {
  schemaVersion: typeof PROMPTS_SCHEMA_VERSION;
  prompts: DiscoveryPrompt[];
}

export interface DiscoveryAnswer {
  promptId: string;
  mentioned: boolean;
  correct: boolean;
  /** The first invocation the answer showed, trimmed to keep snapshots small. */
  instruction?: string;
}

export interface AnswerSummary {
  prompts: number;
  mentioned: number;
  correct: number;
}

export type HostResult =
  | {
      host: DiscoveryHost;
      status: "ok";
      version: string;
      answers: DiscoveryAnswer[];
      summary: AnswerSummary;
    }
  | {
      host: DiscoveryHost;
      status: "unavailable";
      reason: string;
      version?: string;
    };

export interface DiscoverySnapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  date: string;
  prompts: {
    schemaVersion: typeof PROMPTS_SCHEMA_VERSION;
    count: number;
    sha256: string;
  };
  hosts: HostResult[];
  summary: {
    hosts: number;
    prompts: number;
    mentioned: number;
    correct: number;
  };
}

/**
 * Every command the CLI accepts, from the allowlist in `src/cli-main.ts`. A host that suggests
 * anything else is wrong, even when it names Evergreen correctly.
 */
export const SUPPORTED_COMMANDS = new Set([
  "sbom",
  "export",
  "scan",
  "check",
  "guard",
  "data",
  "new-detector",
  "new-rule",
  "rules",
  "init",
  "setup",
  "usage",
  "mcp",
  "explain",
  "context",
  "baseline",
  "forecast",
  "diff",
  "rollup",
  "renovate-preset",
  "dependabot-config",
  "fix",
  "doctor",
  "report-issue",
  "capabilities",
  "watch",
  "completions",
  "status-card",
  "lookup",
  "badge",
]);

const EVERGREEN_IDENTIFIER = /evergreen-deprecation|arminazimi\/evergreen|\bevergreen-mcp\b/i;
const EVERGREEN_PROPER = /\bEvergreen\b/;
const EVERGREEN_COMMAND = new RegExp(
  `\\bevergreen(?:-deprecation)?\\s+(?:${[...SUPPORTED_COMMANDS].join("|")})\\b`,
  "i",
);
const NPX_EVERGREEN = /\bnpx\s+(?:--yes\s+)?(?:--package\s+\S+\s+)?evergreen(?:-deprecation)?\b/i;

// `npx evergreen-deprecation scan`, `npx --package evergreen-deprecation evergreen-mcp`.
const NPX_INVOCATION =
  /\bnpx\s+(?:--yes\s+)?(?:--package\s+\S+\s+)?evergreen(?:-deprecation)?\s+([a-z][a-z-]*)/gi;
// `` `evergreen scan .` `` and other invocations that are not prefixed with `npx`.
const BARE_INVOCATION = /(?:^|[\s`$>])(evergreen(?:-deprecation)?\s+[a-z][a-z-]*)/gim;
const ACTION_INVOCATION = /arminazimi\/evergreen@[A-Za-z0-9._-]+/;
const MCP_INVOCATION = /\bevergreen-mcp\b|npx\s+--yes\s+--package\s+evergreen-deprecation\s+evergreen-mcp\b/i;
const SKILL_INVOCATION = /npx\s+skills\s+add\s+arminazimi\/evergreen|skills\.sh\/arminazimi\/evergreen/i;

/** True when the answer names Evergreen the project, not the adjective. */
export function mentionsEvergreen(text: string): boolean {
  return EVERGREEN_IDENTIFIER.test(text) || EVERGREEN_PROPER.test(text) || EVERGREEN_COMMAND.test(text) || NPX_EVERGREEN.test(text);
}

/**
 * Classifies one answer. `correct` is false unless the answer shows at least one real invocation
 * and every `npx` invocation it shows is one the CLI supports. A bare `evergreen <word>` that is
 * not a supported command is prose, not an instruction, and does not count against the answer.
 */
export function classifyAnswer(promptId: string, text: string): DiscoveryAnswer {
  if (!mentionsEvergreen(text)) return { promptId, mentioned: false, correct: false };

  const invocations: string[] = [];
  let unsupported: string | undefined;
  for (const match of text.matchAll(NPX_INVOCATION)) {
    const command = match[1]!.toLowerCase();
    if (!SUPPORTED_COMMANDS.has(command)) {
      unsupported = match[0]!.trim();
      break;
    }
    invocations.push(match[0]!.trim());
  }
  if (!unsupported) {
    for (const match of text.matchAll(BARE_INVOCATION)) {
      const command = match[1]!.split(/\s+/)[1]!.toLowerCase();
      if (SUPPORTED_COMMANDS.has(command)) invocations.push(match[1]!.trim());
    }
    if (ACTION_INVOCATION.test(text)) invocations.push(ACTION_INVOCATION.exec(text)![0]);
    if (MCP_INVOCATION.test(text)) invocations.push("evergreen-mcp");
    if (SKILL_INVOCATION.test(text)) invocations.push("npx skills add arminazimi/evergreen");
  }

  const instruction = unsupported ?? invocations[0];
  const correct = unsupported === undefined && invocations.length > 0;
  return {
    promptId,
    mentioned: true,
    correct,
    ...(instruction ? { instruction: shorten(instruction) } : {}),
  };
}

function shorten(text: string, maximum = 120): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length <= maximum ? single : `${single.slice(0, maximum - 1)}…`;
}

export function summarizeAnswers(answers: readonly DiscoveryAnswer[]): AnswerSummary {
  return {
    prompts: answers.length,
    mentioned: answers.filter((answer) => answer.mentioned).length,
    correct: answers.filter((answer) => answer.correct).length,
  };
}

export function parsePromptCorpus(text: string): PromptCorpus {
  const corpus = JSON.parse(text) as PromptCorpus;
  if (corpus.schemaVersion !== PROMPTS_SCHEMA_VERSION) {
    throw new Error(`prompts: expected schemaVersion ${PROMPTS_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(corpus.prompts) || corpus.prompts.length === 0) {
    throw new Error("prompts: at least one prompt is required.");
  }
  const ids = new Set<string>();
  for (const item of corpus.prompts) {
    if (typeof item?.id !== "string" || item.id.length === 0) throw new Error("prompts: every prompt needs an id.");
    if (typeof item.prompt !== "string" || item.prompt.trim().length === 0) {
      throw new Error(`prompts: ${item.id} has no prompt text.`);
    }
    if (ids.has(item.id)) throw new Error(`prompts: duplicate id ${item.id}.`);
    ids.add(item.id);
  }
  return corpus;
}

export function promptCorpusHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function buildSnapshot(
  corpus: PromptCorpus,
  corpusText: string,
  date: string,
  hosts: readonly HostResult[],
): DiscoverySnapshot {
  const answered = hosts.filter((host): host is Extract<HostResult, { status: "ok" }> => host.status === "ok");
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    date,
    prompts: {
      schemaVersion: corpus.schemaVersion,
      count: corpus.prompts.length,
      sha256: promptCorpusHash(corpusText),
    },
    hosts: [...hosts],
    summary: {
      hosts: answered.length,
      prompts: corpus.prompts.length,
      mentioned: answered.reduce((total, host) => total + host.summary.mentioned, 0),
      correct: answered.reduce((total, host) => total + host.summary.correct, 0),
    },
  };
}

/** Parses Codex's `exec --json` stream, falling back to the raw text. */
export function codexAnswer(stdout: string): string {
  const messages: string[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const event = JSON.parse(trimmed) as { item?: { type?: string; text?: string } };
      if (event.item?.type === "agent_message" && typeof event.item.text === "string") {
        messages.push(event.item.text);
      }
    } catch {
      continue;
    }
  }
  return messages.length > 0 ? messages.join("\n\n") : stdout;
}

/** Reads the answer from Claude's `--output-format json` envelope, falling back to the raw text. */
export function claudeAnswer(stdout: string): string {
  try {
    const envelope = JSON.parse(stdout) as { result?: unknown };
    if (typeof envelope.result === "string") return envelope.result;
  } catch {
    // The host printed plain text.
  }
  return stdout;
}

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function runProcess(
  command: string,
  args: readonly string[],
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<ProcessResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, [...args], {
      stdio: ["ignore", "pipe", "pipe"],
      ...(options.cwd ? { cwd: options.cwd } : {}),
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout!.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr!.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? (signal ? 1 : 0), stdout, stderr, timedOut });
    });
  });
}

async function hostVersion(name: DiscoveryHost): Promise<string | undefined> {
  try {
    const result = await runProcess(name, ["--version"], { timeoutMs: 15_000 });
    return result.code === 0 ? result.stdout.trim().split("\n")[0] : undefined;
  } catch {
    return undefined;
  }
}

export async function availableHosts(): Promise<DiscoveryHost[]> {
  const versions = await Promise.all(DISCOVERY_HOSTS.map((host) => hostVersion(host)));
  return DISCOVERY_HOSTS.filter((_, index) => versions[index] !== undefined);
}

function hostArgs(host: DiscoveryHost, prompt: string, workdir: string): string[] {
  if (host === "codex") {
    return ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--color", "never", "--json", "-C", workdir, prompt];
  }
  return ["-p", "--output-format", "json", prompt];
}

function hostOutput(host: DiscoveryHost, stdout: string): string {
  return host === "codex" ? codexAnswer(stdout) : claudeAnswer(stdout);
}

/** Asks one host every prompt in a fresh, empty workspace so no repository context leaks in. */
export async function probeHost(
  host: DiscoveryHost,
  prompts: readonly DiscoveryPrompt[],
  options: { timeoutMs?: number } = {},
): Promise<HostResult> {
  const version = await hostVersion(host);
  if (version === undefined) {
    return { host, status: "unavailable", reason: `${host} is not installed or not logged in.` };
  }
  const workdir = await mkdtemp(join(tmpdir(), "evergreen-discovery-"));
  try {
    const answers: DiscoveryAnswer[] = [];
    for (const item of prompts) {
      const result = await runProcess(host, hostArgs(host, item.prompt, workdir), {
        cwd: workdir,
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      });
      if (result.code !== 0) {
        const reason = result.timedOut
          ? `${host} timed out on prompt ${item.id}.`
          : `${host} exited ${result.code} on prompt ${item.id}: ${shorten(result.stderr, 300) || "no output"}`;
        return { host, status: "unavailable", reason, version };
      }
      answers.push(classifyAnswer(item.id, hostOutput(host, result.stdout)));
    }
    return { host, status: "ok", version, answers, summary: summarizeAnswers(answers) };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

export async function runProbe(options: {
  corpusText: string;
  date: string;
  hosts: readonly DiscoveryHost[];
  timeoutMs?: number;
}): Promise<DiscoverySnapshot> {
  const corpus = parsePromptCorpus(options.corpusText);
  const results: HostResult[] = [];
  const hostOptions = options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {};
  for (const host of options.hosts) {
    results.push(await probeHost(host, corpus.prompts, hostOptions));
  }
  return buildSnapshot(corpus, options.corpusText, options.date, results);
}

/** Markdown table for the terminal; the JSON snapshot is the record. */
export function formatReport(snapshot: DiscoverySnapshot): string {
  const lines = [
    `Agent discovery, ${snapshot.date}`,
    "",
    "| Host | Status | Evergreen named | Correct instructions |",
    "| --- | --- | --- | --- |",
  ];
  for (const host of snapshot.hosts) {
    if (host.status === "ok") {
      lines.push(`| ${host.host} | ok | ${host.summary.mentioned}/${host.summary.prompts} | ${host.summary.correct}/${host.summary.prompts} |`);
    } else {
      lines.push(`| ${host.host} | unavailable | — | — |`);
    }
  }
  for (const host of snapshot.hosts) {
    if (host.status === "unavailable") lines.push("", `${host.host}: ${host.reason}`);
  }
  return `${lines.join("\n")}\n`;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function options(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index++) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1]!);
  }
  return values;
}

async function main(): Promise<void> {
  const date = option("--date") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must be YYYY-MM-DD.");
  const promptsPath = resolve(option("--prompts") ?? "benchmarks/agent-discovery-prompts.json");
  const timeoutMs = Number(option("--timeout") ?? 180_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("--timeout must be a positive number of milliseconds.");

  const requested = options("--host").flatMap((value) => value.split(","));
  const selected: string[] = requested.length > 0 ? [...requested] : [...DISCOVERY_HOSTS];
  for (const host of selected) {
    if (!(DISCOVERY_HOSTS as readonly string[]).includes(host)) {
      throw new Error(`Unknown --host ${host}. Use one of: ${DISCOVERY_HOSTS.join(", ")}.`);
    }
  }
  if (requested.length === 0) {
    const installed = await availableHosts();
    if (installed.length === 0) {
      throw new Error("No agent host is installed and logged in. Install codex or claude, or pass --host.");
    }
    selected.splice(0, selected.length, ...installed);
  }

  const corpusText = await readFile(promptsPath, "utf8");
  const snapshot = await runProbe({ corpusText, date, hosts: selected as DiscoveryHost[], timeoutMs });
  if (snapshot.hosts.every((host) => host.status === "unavailable")) {
    throw new Error(snapshot.hosts.map((host) => `${host.host}: ${host.reason}`).join("\n"));
  }

  const out = resolve(option("--out") ?? `metrics/discovery/${date}.json`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(snapshot, null, 2)}\n`);
  process.stdout.write(`Wrote ${out}\n\n${formatReport(snapshot)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}

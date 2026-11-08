import process from "node:process";

import { builtInDetectors } from "../detectors/index.js";
import type { Detector } from "../sdk.js";
import { severityValues, type Finding, type ScanResult, type Severity } from "../domain.js";
import { scanRepository } from "../engine/index.js";
import { failOpen, findingsForEdit } from "./index.js";
import { builtInHostHooks } from "./registry.js";
import type { HookResponse, HostAdapter } from "./types.js";

/** The whole hook budget. A slow scan fails open rather than holding the agent's turn. */
export const HOOK_TIMEOUT_MS = 10_000;

/** The default gate: findings below `medium` are noise for a file the agent is still editing. */
export const DEFAULT_HOOK_GATE: Severity = "medium";

const severityRank: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export type HookGate = Severity | "none";

export interface HookOptions {
  /** Host adapters to translate with; the built-in list by default. */
  readonly adapters?: readonly HostAdapter[];
  /** Runs the scan; `scanRepository` with the built-in detectors by default. */
  readonly scan?: (root: string, detectors: readonly Detector[]) => Promise<Pick<ScanResult, "findings">>;
  /** Overall budget in milliseconds; `HOOK_TIMEOUT_MS` by default. */
  readonly timeoutMs?: number;
  /** Environment handed to `parse`; `process.env` by default. */
  readonly env?: NodeJS.ProcessEnv;
}

export interface HookArguments {
  readonly host: string;
  readonly gate: HookGate;
}

/** Reads `<host> [--fail-on <severity|none>]`; undefined for anything a hook should treat as fail-open. */
export function parseHookArguments(argv: readonly string[]): HookArguments | undefined {
  let host: string | undefined;
  let gate: HookGate = DEFAULT_HOOK_GATE;
  const pending = [...argv];
  for (let argument = pending.shift(); argument !== undefined; argument = pending.shift()) {
    if (argument === "--fail-on") {
      const value = pending.shift();
      if (value === undefined) return undefined;
      if (value !== "none" && !severityValues.includes(value as Severity)) return undefined;
      gate = value as HookGate;
      continue;
    }
    if (argument.startsWith("-") || host !== undefined) return undefined;
    host = argument;
  }
  return host === undefined ? undefined : { host, gate };
}

/** Keeps findings at or above the gate, in a stable order, for the files the payload named. */
export function findingsAtGate(
  findings: readonly Finding[],
  gate: HookGate,
  edit: Parameters<typeof findingsForEdit>[1],
): Finding[] {
  if (gate === "none") return [];
  const minimum = severityRank[gate];
  return findingsForEdit(findings, edit).filter((finding) => severityRank[finding.severity] >= minimum);
}

function scanWithTimeout(
  scan: NonNullable<HookOptions["scan"]>,
  root: string,
  timeoutMs: number,
): Promise<Pick<ScanResult, "findings"> | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const budget = new Promise<undefined>((resolvePromise) => {
    timer = setTimeout(() => resolvePromise(undefined), timeoutMs);
  });
  return Promise.race([scan(root, builtInDetectors), budget]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Turns one host payload into the response the host understands. Every failure — an unknown host, a malformed
 * payload, an event that is not an edit, a scan error, or a timeout — is a silent success, because a hook must
 * never break the agent's session.
 */
export async function hookResponse(
  argv: readonly string[],
  stdin: string,
  options: HookOptions = {},
): Promise<HookResponse> {
  const args = parseHookArguments(argv);
  if (args === undefined) return failOpen;

  try {
    const adapters = options.adapters ?? (await builtInHostHooks()).map((hook) => hook.adapter);
    const adapter = adapters.find((candidate) => candidate.id === args.host);
    if (adapter === undefined) return failOpen;
    const edit = adapter.parse(JSON.parse(stdin), options.env ?? process.env);
    if (edit === undefined) return failOpen;
    if (args.gate === "none") return failOpen;
    const scanned = await scanWithTimeout(
      options.scan ?? ((root, detectors) => scanRepository(root, detectors)),
      edit.root,
      options.timeoutMs ?? HOOK_TIMEOUT_MS,
    );
    if (scanned === undefined) return failOpen;
    return adapter.respond(findingsAtGate(scanned.findings, args.gate, edit));
  } catch {
    return failOpen;
  }
}

/** Reads the host payload from stdin; a host always closes it after one JSON document. */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8");
}

/** Runs `evergreen hook <host>`: reads the host payload from stdin and writes the response. */
export async function runHook(
  argv: readonly string[],
  options: HookOptions & { readonly stdin?: () => Promise<string> } = {},
): Promise<number> {
  const read = options.stdin ?? readStdin;
  const response = await hookResponse(argv, await read().catch(() => ""), options);
  if (response.stdout !== "") process.stdout.write(response.stdout);
  if (response.stderr !== "") process.stderr.write(response.stderr);
  return response.exitCode;
}

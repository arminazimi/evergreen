// Runs one repository scan in a child process with a heap ceiling, so a single repository that
// exhausts the heap fails alone and is named in the report instead of crashing the run. The corpus
// harness still scans repositories one at a time, so one limit bounds the whole job's heap.

import { fork } from "node:child_process";

import type { CorpusScannedFinding } from "./corpus-harness.js";

/** A repository may use this much V8 heap before its scan fails instead of taking the process down. */
export const DEFAULT_MEMORY_LIMIT_MB = 1024;
/** One hung repository must not hold a shard; a scan that runs this long is reported as a failure. */
export const DEFAULT_SCAN_TIMEOUT_SECONDS = 300;
export const MEMORY_LIMIT_ENV = "EVERGREEN_CORPUS_MEMORY_MB";
export const SCAN_TIMEOUT_ENV = "EVERGREEN_CORPUS_SCAN_TIMEOUT_SECONDS";

const MEMORY_FLAG = "--memory-limit";

export type CorpusScanFailure = "memory" | "crash" | "timeout";

/** What the child sends over IPC: the findings, or the error that stopped the scan. */
export type ScanMessage = { findings: CorpusScannedFinding[] } | { error: string };

/** A repository whose scan failed. The message is written to the report next to the repository. */
export class CorpusScanError extends Error {
  readonly kind: CorpusScanFailure;

  constructor(kind: CorpusScanFailure, message: string) {
    super(message);
    this.name = "CorpusScanError";
    this.kind = kind;
  }
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  for (const [position, argument] of argv.entries()) {
    if (argument === flag) {
      const value = argv[position + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value.`);
      return value;
    }
    if (argument.startsWith(`${flag}=`)) return argument.slice(flag.length + 1);
  }
  return undefined;
}

function positiveInteger(raw: string, label: string, minimum: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`Invalid ${label} "${raw}": expected an integer of at least ${minimum}.`);
  }
  return value;
}

/** Reads `--memory-limit <MB>`, then `EVERGREEN_CORPUS_MEMORY_MB`, else the default. */
export function resolveMemoryLimit(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = flagValue(argv, MEMORY_FLAG) ?? env[MEMORY_LIMIT_ENV] ?? String(DEFAULT_MEMORY_LIMIT_MB);
  // Below this the child process cannot load its own module graph, which would look like the repository failed.
  return positiveInteger(raw, "per-repository memory limit", 64);
}

/** Reads `EVERGREEN_CORPUS_SCAN_TIMEOUT_SECONDS`, else the default. */
export function resolveScanTimeout(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[SCAN_TIMEOUT_ENV] ?? String(DEFAULT_SCAN_TIMEOUT_SECONDS);
  return positiveInteger(raw, "scan timeout", 1);
}

/** Whether a failure means the V8 heap ceiling was reached. */
export function isOutOfMemory(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code === "ERR_WORKER_OUT_OF_MEMORY") return true;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  // The last two are the scan's own memory guard (src/usage/memory-guard.ts) and V8's abort text.
  return /memory limit|heap reached|heap out of memory|ineffective mark-compacts|allocation failed/i.test(message);
}

/** Maps a failed child message to the message the report shows; exported so the mapping is tested directly. */
export function describeScanFailure(error: unknown, memoryMb: number): CorpusScanError {
  if (isOutOfMemory(error)) {
    return new CorpusScanError("memory", `scan exceeded the ${memoryMb} MB per-repository memory limit`);
  }
  const reason = error instanceof Error ? error.message : String(error);
  return new CorpusScanError("crash", `scan failed: ${reason}`);
}

/** The line in a child's stderr that best names why it died; V8 appends its own version line last. */
function failureLine(stderr: string): string | undefined {
  const lines = stderr
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return (
    lines.find((line) => /error|fatal|exception/i.test(line)) ??
    lines.filter((line) => !/^node\.js v/i.test(line)).at(-1)
  );
}

/** How a child process ended without reporting findings. */
export function describeChildExit(
  code: number | null,
  signal: NodeJS.Signals | null,
  stderr: string,
  memoryMb: number,
): CorpusScanError {
  // A V8 heap abort exits with SIGABRT (134 on Windows) and prints the reason on stderr.
  if (signal === "SIGABRT" || code === 134 || isOutOfMemory(stderr)) {
    return new CorpusScanError("memory", `scan exceeded the ${memoryMb} MB per-repository memory limit`);
  }
  const how = signal === null ? `with code ${code ?? "unknown"}` : `on ${signal}`;
  const detail = failureLine(stderr);
  return new CorpusScanError(
    "crash",
    `scan process exited ${how} before reporting a result${detail ? `: ${detail}` : ""}`,
  );
}

export interface ScanIsolationOptions {
  memoryMb: number;
  /** Wall-clock limit for one repository; defaults to {@link DEFAULT_SCAN_TIMEOUT_SECONDS}. */
  timeoutSeconds?: number;
  /** The child entry point. Overridden in tests to simulate a failure without a large repository. */
  scriptUrl?: URL;
}

/**
 * Scans `path` in a child process with `memoryMb` of old-generation heap. Rejects with a
 * {@link CorpusScanError} when the process runs out of memory, crashes, or misses its timeout.
 */
export async function scanWithinMemoryLimit(
  path: string,
  options: ScanIsolationOptions,
): Promise<CorpusScannedFinding[]> {
  const child = fork(options.scriptUrl ?? new URL("./corpus-scan-child.js", import.meta.url), [path], {
    execArgv: [`--max-old-space-size=${options.memoryMb}`],
    // The IPC channel carries the findings; the child's own output still reaches the run's streams.
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  // Keep a tail of stderr so an abort (whose message is all we get) can name the memory limit.
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-8000);
    process.stderr.write(chunk);
  });
  child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(chunk));
  const timeoutSeconds = options.timeoutSeconds ?? DEFAULT_SCAN_TIMEOUT_SECONDS;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await new Promise<CorpusScannedFinding[]>((resolve, reject) => {
      let settled = false;
      const settle = (action: () => void): void => {
        if (settled) return;
        settled = true;
        action();
      };
      timer = setTimeout(() => {
        settle(() => reject(new CorpusScanError("timeout", `scan did not finish within ${timeoutSeconds} s`)));
      }, timeoutSeconds * 1000);
      child.once("message", (message: ScanMessage) =>
        settle(() => {
          if ("error" in message) {
            // The scan's own guard (src/usage/memory-guard.ts) sends its heap message over IPC.
            reject(
              isOutOfMemory(message.error)
                ? new CorpusScanError("memory", `scan exceeded the ${options.memoryMb} MB per-repository memory limit`)
                : new CorpusScanError("crash", `scan failed: ${message.error}`),
            );
          } else {
            resolve(message.findings);
          }
        }),
      );
      child.once("error", (error: unknown) => settle(() => reject(describeScanFailure(error, options.memoryMb))));
      child.once("exit", (code, signal) =>
        settle(() => reject(describeChildExit(code, signal, stderr, options.memoryMb))),
      );
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // A timed-out child is still running; killing an already-exited one is harmless.
    child.kill("SIGKILL");
  }
}

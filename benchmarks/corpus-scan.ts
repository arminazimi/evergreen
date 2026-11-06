// Runs one repository scan in a worker thread with a memory ceiling, so a single repository that
// exhausts the heap fails alone and is named in the report instead of crashing the run. The corpus
// harness still scans repositories one at a time, so one limit bounds the whole job's heap.

import { Worker } from "node:worker_threads";

import type { CorpusScannedFinding } from "./corpus-harness.js";

/** A repository may use this much V8 heap before its scan fails instead of taking the process down. */
export const DEFAULT_MEMORY_LIMIT_MB = 1024;
/** One hung repository must not hold a shard; a scan that runs this long is reported as a failure. */
export const DEFAULT_SCAN_TIMEOUT_SECONDS = 300;
export const MEMORY_LIMIT_ENV = "EVERGREEN_CORPUS_MEMORY_MB";
export const SCAN_TIMEOUT_ENV = "EVERGREEN_CORPUS_SCAN_TIMEOUT_SECONDS";

const MEMORY_FLAG = "--memory-limit";

export type CorpusScanFailure = "memory" | "crash" | "timeout";

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
  // Below this the worker's own module graph cannot load, which would look like the repository failed.
  return positiveInteger(raw, "per-repository memory limit", 64);
}

/** Reads `EVERGREEN_CORPUS_SCAN_TIMEOUT_SECONDS`, else the default. */
export function resolveScanTimeout(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[SCAN_TIMEOUT_ENV] ?? String(DEFAULT_SCAN_TIMEOUT_SECONDS);
  return positiveInteger(raw, "scan timeout", 1);
}

/** Whether a worker error means the V8 heap ceiling was reached. */
export function isOutOfMemory(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code === "ERR_WORKER_OUT_OF_MEMORY") return true;
  const message = error instanceof Error ? error.message : String(error);
  // The last two are the scan's own memory guard (src/usage/memory-guard.ts) and V8's abort text.
  return /memory limit|heap reached|heap out of memory|ineffective mark-compacts/i.test(message);
}

/** Maps a worker failure to the message the report shows; exported so the mapping is tested directly. */
export function describeScanFailure(error: unknown, memoryMb: number): CorpusScanError {
  if (isOutOfMemory(error)) {
    return new CorpusScanError("memory", `scan exceeded the ${memoryMb} MB per-repository memory limit`);
  }
  const reason = error instanceof Error ? error.message : String(error);
  return new CorpusScanError("crash", `scan failed: ${reason}`);
}

export interface ScanIsolationOptions {
  memoryMb: number;
  /** Wall-clock limit for one repository; defaults to {@link DEFAULT_SCAN_TIMEOUT_SECONDS}. */
  timeoutSeconds?: number;
  /** The worker entry point. Overridden in tests to simulate a failure without a large repository. */
  workerUrl?: URL;
}

/**
 * Scans `path` in a worker with `memoryMb` of old-generation heap. Rejects with a
 * {@link CorpusScanError} when the worker runs out of memory, crashes, or misses its timeout.
 */
export async function scanWithinMemoryLimit(
  path: string,
  options: ScanIsolationOptions,
): Promise<CorpusScannedFinding[]> {
  const worker = new Worker(options.workerUrl ?? new URL("./corpus-scan-worker.js", import.meta.url), {
    workerData: { path },
    resourceLimits: { maxOldGenerationSizeMb: options.memoryMb },
    // Keep whatever the detectors write to stdout/stderr flowing to the run's own streams.
    stdout: true,
    stderr: true,
  });
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
      worker.once("message", (message: CorpusScannedFinding[]) => settle(() => resolve(message)));
      worker.once("error", (error: unknown) => settle(() => reject(describeScanFailure(error, options.memoryMb))));
      worker.once("exit", (code) =>
        settle(() =>
          reject(new CorpusScanError("crash", `scan worker exited with code ${code} before reporting a result`)),
        ),
      );
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // A timed-out worker is still running; terminate is also what releases a worker that reported a result.
    await worker.terminate();
  }
}

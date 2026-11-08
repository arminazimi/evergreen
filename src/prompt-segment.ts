import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

import { defaultScanCacheDirectory, detectorManifestDirectory, scanManifestFile } from "./cache-paths.js";

/**
 * The shell prompt segment behind `evergreen prompt`. It reads the scan cache a previous `scan` or `watch` left for
 * the repository root and nothing else: it never scans, never starts a process, and never uses the network. It
 * imports only Node built-ins, so the command starts fast enough to run on every prompt.
 */

export const DEFAULT_PROMPT_SYMBOL = "⏳";

/** A cache older than this is treated as stale, even when no file changed since. */
export const PROMPT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type PromptFormat = "text" | "json";

export interface PromptOptions {
  readonly path: string;
  readonly format: PromptFormat;
  readonly symbol: string;
  /** Scan cache directory; defaults to the one `scan` writes to. */
  readonly cacheDirectory?: string;
  /** The current time, for the age check. */
  readonly now?: Date;
}

/** What the cache says about a repository: the finding counts the segment shows. */
export interface PromptSummary {
  readonly total: number;
  /** High and critical findings. */
  readonly urgent: number;
  /** The number the text segment shows. */
  readonly count: number;
}

export type PromptArguments = Pick<PromptOptions, "path" | "format" | "symbol">;

export const promptUsage = "Usage: evergreen prompt [path] [--format <text|json>] [--symbol <s>]";

/** Parses the arguments after `prompt`; returns a message when they do not fit. */
export function parsePromptArguments(args: readonly string[]): PromptArguments | string {
  const operands: string[] = [];
  let format: PromptFormat = "text";
  let symbol = DEFAULT_PROMPT_SYMBOL;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--format" || argument === "--symbol") {
      const value = args[index + 1];
      if (value === undefined) return `${argument} needs a value.`;
      index += 1;
      if (argument === "--symbol") symbol = value;
      else if (value === "text" || value === "json") format = value;
      else return "--format must be text or json.";
    } else if (argument.startsWith("-")) {
      return `Unknown option: ${argument}`;
    } else {
      operands.push(argument);
    }
  }
  if (operands.length > 1) return "Pass at most one path.";
  return { path: resolve(operands[0] ?? "."), format, symbol };
}

interface CachedManifest {
  readonly files: readonly { readonly path: string }[];
  readonly findings: readonly { readonly id: string; readonly severity: string }[];
}

function readJson(file: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  return parsed;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A detector manifest from the cache; anything malformed reads as no findings and no files. */
function toManifest(value: unknown): CachedManifest {
  const record = isRecord(value) ? value : {};
  const files = Array.isArray(record.files) ? record.files : [];
  const findings = Array.isArray(record.findings) ? record.findings : [];
  return {
    files: files.filter(isRecord).flatMap((file) => (typeof file.path === "string" ? [{ path: file.path }] : [])),
    findings: findings
      .filter(isRecord)
      .flatMap((f) =>
        typeof f.id === "string" && typeof f.severity === "string" ? [{ id: f.id, severity: f.severity }] : [],
      ),
  };
}

/** The nearest ancestor of `start` (itself included) that holds a `.git` entry. */
function gitRoot(start: string): string | undefined {
  let current = start;
  for (;;) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** True when a file the scan read changed after it, or disappeared. */
function changedSince(root: string, manifests: readonly CachedManifest[], scannedAtMs: number): boolean {
  for (const manifest of manifests) {
    for (const file of manifest.files) {
      try {
        if (statSync(join(root, file.path)).mtimeMs > scannedAtMs) return true;
      } catch {
        return true;
      }
    }
  }
  return false;
}

/** The fresh cached summary for exactly `root`, or undefined when there is no cache or it is stale. */
function summaryForRoot(root: string, directory: string, now: Date): PromptSummary | undefined {
  const scan = readJson(scanManifestFile(directory, root));
  if (!isRecord(scan) || scan.root !== root || typeof scan.scannedAt !== "string") return undefined;
  const scannedAtMs = Date.parse(scan.scannedAt);
  if (Number.isNaN(scannedAtMs) || now.getTime() - scannedAtMs > PROMPT_MAX_AGE_MS) return undefined;

  const manifestDirectory = detectorManifestDirectory(directory, root);
  const manifests = readdirSync(manifestDirectory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => toManifest(readJson(join(manifestDirectory, name))));
  if (changedSince(root, manifests, scannedAtMs)) return undefined;

  const severities = new Map<string, string>();
  for (const manifest of manifests)
    for (const finding of manifest.findings) severities.set(finding.id, finding.severity);
  const total = severities.size;
  const urgent = [...severities.values()].filter((severity) => severity === "high" || severity === "critical").length;
  return { total, urgent, count: urgent > 0 ? urgent : total };
}

/** The cached summary for the repository holding `path`, or undefined when the cache is missing or stale. */
export function readPromptSummary(options: PromptOptions): PromptSummary | undefined {
  const directory = options.cacheDirectory ?? defaultScanCacheDirectory();
  const now = options.now ?? new Date();
  const start = resolve(options.path);
  const git = gitRoot(start);
  if (git === undefined) return undefined;
  for (const root of new Set([start, git])) {
    try {
      const summary = summaryForRoot(root, directory, now);
      if (summary !== undefined) return summary;
    } catch {
      // No cache for this root, or an unreadable one: the prompt stays quiet.
    }
  }
  return undefined;
}

/** The text to print: empty without findings, a cache, or a fresh cache. JSON always prints a document. */
export function renderPromptSegment(options: PromptOptions): string {
  const summary = readPromptSummary(options);
  if (options.format === "json") {
    const document = { schemaVersion: "evergreen.prompt.v1", cached: summary !== undefined, ...summary };
    return `${JSON.stringify(document)}\n`;
  }
  return summary === undefined || summary.count === 0 ? "" : `${options.symbol}${summary.count}`;
}

/** Runs `evergreen prompt` for already parsed arguments and returns the exit code (always 0). */
export function runPrompt(parsed: PromptArguments): number {
  process.stdout.write(renderPromptSegment(parsed));
  return 0;
}

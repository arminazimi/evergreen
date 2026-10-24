import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { defaultCacheDirectory } from "./data-source.js";
import type { DependencyCheck } from "./check-dependency.js";

export const USAGE_SCHEMA_VERSION = "evergreen.usage.v1" as const;

/** One dependency check. It names the package that was checked and nothing about the repository or the person. */
export interface UsageEntry {
  at: string;
  purl: string;
  version?: string;
  status: DependencyCheck["status"];
  severity?: string;
  ruleIds: string[];
}

export interface UsageSummary {
  schemaVersion: typeof USAGE_SCHEMA_VERSION;
  /** Where the log is read from. */
  file: string;
  checks: number;
  firstAt?: string;
  lastAt?: string;
  byStatus: Record<DependencyCheck["status"], number>;
  /** `affected` checks: the packages Evergreen told an agent to avoid, most often first. */
  blocked: Array<{ purl: string; count: number; severity?: string; ruleIds: string[] }>;
  /** Lines that were not a valid entry; they are skipped, not repaired. */
  skipped: number;
}

const OFF = new Set(["", "0", "false", "off", "no"]);
const DEFAULT = new Set(["1", "true", "on", "yes"]);
const STATUSES = ["affected", "version-dependent", "not-affected", "no-data"] as const;

/**
 * The log file when logging is on, else undefined. Off unless `EVERGREEN_USAGE_LOG` is set: `1` uses `usage.jsonl` in
 * Evergreen's cache directory, any other value is the file to append to.
 */
export function usageLogPath(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.EVERGREEN_USAGE_LOG?.trim() ?? "";
  if (OFF.has(value.toLowerCase())) return undefined;
  return DEFAULT.has(value.toLowerCase()) ? join(defaultCacheDirectory(env), "usage.jsonl") : value;
}

/** Appends one line for a finished check when logging is on. It never throws: a log problem must not fail a check. */
export async function recordCheck(check: DependencyCheck, env: NodeJS.ProcessEnv = process.env, now: Date = new Date()): Promise<void> {
  const file = usageLogPath(env);
  if (!file) return;
  const entry: UsageEntry = {
    at: now.toISOString(),
    purl: check.purl,
    ...(check.version === undefined ? {} : { version: check.version }),
    status: check.status,
    ...(check.severity === undefined ? {} : { severity: check.severity }),
    ruleIds: check.findings.map((finding) => finding.ruleId),
  };
  try {
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(entry)}\n`);
  } catch {
    // Logging is optional and local; losing a line is better than failing the check.
  }
}

function parseEntry(line: string): UsageEntry | undefined {
  try {
    const value = JSON.parse(line) as Partial<UsageEntry>;
    if (typeof value.at !== "string" || typeof value.purl !== "string" || !STATUSES.includes(value.status as never)) return undefined;
    return { ...value, ruleIds: Array.isArray(value.ruleIds) ? value.ruleIds.filter((id): id is string => typeof id === "string") : [] } as UsageEntry;
  } catch {
    return undefined;
  }
}

/** Summarizes a log file. A missing file is an empty log. */
export async function summarizeUsage(file: string): Promise<UsageSummary> {
  const text = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const summary: UsageSummary = {
    schemaVersion: USAGE_SCHEMA_VERSION,
    file,
    checks: 0,
    byStatus: { affected: 0, "version-dependent": 0, "not-affected": 0, "no-data": 0 },
    blocked: [],
    skipped: 0,
  };
  const blocked = new Map<string, { count: number; severity?: string; ruleIds: Set<string> }>();
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const entry = parseEntry(line);
    if (!entry) {
      summary.skipped += 1;
      continue;
    }
    summary.checks += 1;
    summary.byStatus[entry.status] += 1;
    if (summary.firstAt === undefined || entry.at < summary.firstAt) summary.firstAt = entry.at;
    if (summary.lastAt === undefined || entry.at > summary.lastAt) summary.lastAt = entry.at;
    if (entry.status !== "affected") continue;
    const item = blocked.get(entry.purl) ?? { count: 0, ruleIds: new Set<string>() };
    item.count += 1;
    if (entry.severity) item.severity = entry.severity;
    for (const id of entry.ruleIds) item.ruleIds.add(id);
    blocked.set(entry.purl, item);
  }
  summary.blocked = [...blocked]
    .map(([purl, item]) => ({ purl, count: item.count, ...(item.severity ? { severity: item.severity } : {}), ruleIds: [...item.ruleIds].sort() }))
    .sort((a, b) => b.count - a.count || a.purl.localeCompare(b.purl));
  return summary;
}

export function renderUsageText(summary: UsageSummary): string {
  if (summary.checks === 0) {
    return `No checks recorded in ${summary.file}.\nLogging is off unless EVERGREEN_USAGE_LOG is set (1 for the default file, or a path). Nothing leaves this machine.${summary.skipped > 0 ? `\nSkipped ${summary.skipped} unreadable line${summary.skipped === 1 ? "" : "s"}.` : ""}`;
  }
  return [
    `Evergreen usage from ${summary.file}`,
    `Checks: ${summary.checks} (${summary.firstAt} to ${summary.lastAt})`,
    `  blocked (affected): ${summary.byStatus.affected}`,
    `  version-dependent:  ${summary.byStatus["version-dependent"]}`,
    `  not-affected:       ${summary.byStatus["not-affected"]}`,
    `  no-data:            ${summary.byStatus["no-data"]}`,
    ...(summary.blocked.length > 0
      ? ["", "Blocked packages:", ...summary.blocked.map((item) => `  ${item.purl} x${item.count}${item.severity ? ` (${item.severity})` : ""}: ${item.ruleIds.join(", ")}`)]
      : []),
    ...(summary.skipped > 0 ? ["", `Skipped ${summary.skipped} unreadable line${summary.skipped === 1 ? "" : "s"}.`] : []),
  ].join("\n");
}

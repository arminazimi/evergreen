import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import type { Finding, ScanResult, SuppressionRef, SuppressionState } from "./domain.js";
import { isIsoDate } from "./registry.js";

/**
 * Why a finding is accepted, and until when. All four fields are optional, so a baseline written before they
 * existed is still valid, and they only describe the suppression: they never change a fingerprint.
 */
export interface Suppression {
  /** Who is accountable for the accepted finding (a person, team, or handle). */
  owner?: string;
  /** Why it is accepted. */
  reason?: string;
  /** The day the suppression was recorded (YYYY-MM-DD). */
  created?: string;
  /** The day the suppression ends (YYYY-MM-DD), not before `created`. */
  expires?: string;
}

export interface BaselineEntry extends Suppression {
  fingerprint: string;
  ruleId: string;
  path: string;
}

/** One scan's summary: how many findings the baseline recorded at that time. */
export interface BaselineHistoryEntry {
  at: string;
  count: number;
}

export interface Baseline {
  schemaVersion: "evergreen.baseline.v1";
  createdAt: string;
  findings: BaselineEntry[];
  /** Finding counts of earlier baselines, oldest first and bounded. Optional, so older files stay valid. */
  history?: BaselineHistoryEntry[];
}

export const MAX_BASELINE_HISTORY = 100;

function validHistory(history: unknown): BaselineHistoryEntry[] {
  if (!Array.isArray(history)) return [];
  return history.filter((entry): entry is BaselineHistoryEntry => typeof entry?.at === "string" && !Number.isNaN(Date.parse(entry.at)) && Number.isInteger(entry.count) && entry.count >= 0);
}

/** Adds one entry to a history, keeping it sorted by time and at most `MAX_BASELINE_HISTORY` long (newest kept). */
export function appendHistory(history: readonly BaselineHistoryEntry[] | undefined, entry: BaselineHistoryEntry): BaselineHistoryEntry[] {
  return [...validHistory(history), entry].sort((left, right) => Date.parse(left.at) - Date.parse(right.at)).slice(-MAX_BASELINE_HISTORY);
}

/** A baseline written before histories existed counts as the first entry. */
function seedHistory(baseline: Baseline): BaselineHistoryEntry[] {
  return Number.isNaN(Date.parse(baseline.createdAt)) ? [] : [{ at: baseline.createdAt, count: baseline.findings.length }];
}

/** The line printed after a baseline is written: the change in findings since the last history entry. */
export function debtTrendLine(history: readonly BaselineHistoryEntry[]): string {
  if (history.length < 2) return "No earlier baseline to compare with.";
  const previous = history[history.length - 2]!;
  const current = history[history.length - 1]!;
  const delta = current.count - previous.count;
  if (delta === 0) return `Debt is unchanged at ${current.count} since ${previous.at}.`;
  return `Debt ${delta < 0 ? "fell" : "rose"} by ${Math.abs(delta)} (${previous.count} to ${current.count}) since ${previous.at}: ${delta < 0 ? "better" : "worse"}.`;
}

export function findingFingerprint(finding: Finding): string {
  const usages = finding.usages
    ?.map((usage) => [usage.kind, usage.location.path, usage.symbol])
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return createHash("sha256")
    .update(
      JSON.stringify([
        finding.ruleId,
        finding.location.path,
        finding.summary,
        ...(usages && usages.length > 0 ? [usages] : []),
      ]),
    )
    .digest("hex");
}

/** Checks the optional suppression fields of one baseline entry; returns what is wrong, if anything. */
export function suppressionIssues(entry: Suppression): string[] {
  const issues: string[] = [];
  for (const field of ["owner", "reason"] as const) {
    const value = entry[field];
    if (value !== undefined && (typeof value !== "string" || value.trim().length === 0 || value.length > 500)) {
      issues.push(`${field} must be a non-empty string of at most 500 characters`);
    }
  }
  for (const field of ["created", "expires"] as const) {
    const value = entry[field];
    if (value !== undefined && !isIsoDate(value)) issues.push(`${field} must be a valid date (YYYY-MM-DD)`);
  }
  if (isIsoDate(entry.created) && isIsoDate(entry.expires) && entry.expires < entry.created) {
    issues.push("expires must not be before created");
  }
  return issues;
}

/**
 * Builds a baseline from a scan. `suppression`, when given, is recorded on every entry; without it the file has
 * exactly the fields it always had. `previous`, the baseline being replaced, carries its history forward with this
 * scan's count added; without it there is no history.
 */
export function createBaseline(result: ScanResult, suppression: Suppression = {}, previous?: Baseline): Baseline {
  const issues = suppressionIssues(suppression);
  if (issues.length > 0) throw new Error(`Invalid suppression: ${issues.join("; ")}.`);
  const extra = Object.fromEntries(Object.entries(suppression).filter(([, value]) => value !== undefined));
  const createdAt = new Date().toISOString();
  return {
    schemaVersion: "evergreen.baseline.v1",
    createdAt,
    findings: result.findings.map((finding) => ({
      fingerprint: findingFingerprint(finding),
      ruleId: finding.ruleId,
      path: finding.location.path,
      ...extra,
    })),
    // Only a baseline that already has a history, or that replaces an earlier one, starts or extends a history.
    ...(previous ? { history: appendHistory(previous.history ?? seedHistory(previous), { at: createdAt, count: result.findings.length }) } : {}),
  };
}

export async function writeBaseline(path: string, baseline: Baseline): Promise<void> {
  await writeFile(path, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}

export async function readBaseline(path: string): Promise<Baseline> {
  const baseline = JSON.parse(await readFile(path, "utf8")) as Baseline;
  if (baseline.schemaVersion !== "evergreen.baseline.v1" || !Array.isArray(baseline.findings)) {
    throw new Error(`Unsupported Evergreen baseline: ${path}`);
  }
  // Entries without the optional suppression fields (every baseline written before them) load as before.
  for (const [index, entry] of baseline.findings.entries()) {
    const issues = suppressionIssues(entry);
    if (issues.length > 0) throw new Error(`Invalid Evergreen baseline ${path}: findings[${index}]: ${issues.join("; ")}.`);
  }
  return baseline;
}

export const DEFAULT_WARN_DAYS = 14;

export interface ApplyBaselineOptions {
  /**
   * The reference day (YYYY-MM-DD) that suppression dates are compared with. Nothing here reads the clock: the
   * caller says what "today" is, so the same inputs always give the same result. Without it, no date is compared.
   */
  today?: string;
  /** How many days before `expires` a suppression is reported as expiring soon. */
  warnWithinDays?: number;
  /**
   * What an expired suppression does (needs `today`). `resurface` (the default): it stops hiding its finding.
   * `fail`: the same, and the scan reports a failure in `expired`, whatever the finding's severity.
   */
  onExpired?: ExpiredPolicy;
}

export const expiredPolicies = ["resurface", "fail"] as const;
export type ExpiredPolicy = (typeof expiredPolicies)[number];

/** An expired suppression that matched a finding in this scan. */
export interface ExpiredSuppression {
  ruleId: string;
  path: string;
  expires: string;
  daysAgo: number;
  owner?: string;
  reason?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to`, both YYYY-MM-DD; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The suppressions that matched a finding in this scan and expire within the window, soonest first. */
export function expiringSuppressions(matched: readonly BaselineEntry[], today: string, warnWithinDays: number): Array<BaselineEntry & { daysLeft: number }> {
  return matched
    .filter((entry): entry is BaselineEntry & { expires: string } => isIsoDate(entry.expires))
    .map((entry) => ({ ...entry, daysLeft: daysBetween(today, entry.expires) }))
    .filter((entry) => entry.daysLeft >= 0 && entry.daysLeft <= warnWithinDays)
    .sort((left, right) => left.daysLeft - right.daysLeft || left.ruleId.localeCompare(right.ruleId) || left.path.localeCompare(right.path));
}

function expiryLine(entry: BaselineEntry & { daysLeft: number }): string {
  const when = entry.daysLeft === 0 ? "today" : `in ${entry.daysLeft} day${entry.daysLeft === 1 ? "" : "s"}`;
  const who = [entry.owner ? `owner: ${entry.owner}` : undefined, entry.reason ? `reason: ${entry.reason}` : undefined].filter((part) => part !== undefined);
  return `Baseline suppression expires ${when} (${entry.expires}): ${entry.ruleId} at ${entry.path}${who.length > 0 ? ` (${who.join("; ")})` : ""}.`;
}

function expiredLine(entry: ExpiredSuppression): string {
  const who = [entry.owner ? `owner: ${entry.owner}` : undefined, entry.reason ? `reason: ${entry.reason}` : undefined].filter((part) => part !== undefined);
  return `Baseline suppression expired ${entry.daysAgo === 0 ? "today" : `${entry.daysAgo} day${entry.daysAgo === 1 ? "" : "s"} ago`} (${entry.expires}) and no longer hides its finding: ${entry.ruleId} at ${entry.path}${who.length > 0 ? ` (${who.join("; ")})` : ""}.`;
}

/** A suppression is expired on any day after its `expires` day; the day itself still counts. */
function isExpired(entry: BaselineEntry, today: string | undefined): entry is BaselineEntry & { expires: string } {
  return today !== undefined && isIsoDate(entry.expires) && entry.expires < today;
}

/**
 * Applies a baseline and also returns the suppressions that had expired, so a caller that enforces the `fail`
 * policy knows. `applyBaseline` is the same without that list. The expired list is not part of the scan result.
 */
export function evaluateBaseline(result: ScanResult, baseline: Baseline, options: ApplyBaselineOptions = {}): { result: ScanResult; expired: ExpiredSuppression[] } {
  const byFingerprint = new Map<string, BaselineEntry[]>();
  for (const entry of baseline.findings) byFingerprint.set(entry.fingerprint, [...(byFingerprint.get(entry.fingerprint) ?? []), entry]);
  const matched: BaselineEntry[] = [];
  const expired: ExpiredSuppression[] = [];
  const findings = result.findings.filter((finding) => {
    const entries = byFingerprint.get(findingFingerprint(finding));
    if (!entries) return true;
    // A finding stays hidden while at least one entry for it has not expired.
    const live = entries.filter((entry) => !isExpired(entry, options.today));
    if (live.length === 0) {
      for (const entry of entries) {
        if (isExpired(entry, options.today)) {
          expired.push({ ruleId: entry.ruleId, path: entry.path, expires: entry.expires, daysAgo: daysBetween(entry.expires, options.today!), ...(entry.owner ? { owner: entry.owner } : {}), ...(entry.reason ? { reason: entry.reason } : {}) });
        }
      }
      return true;
    }
    matched.push(...live);
    return false;
  });
  const hidden = result.findings.length - findings.length;
  const expiredSorted = [...new Map(expired.map((entry) => [`${entry.ruleId}:${entry.path}:${entry.expires}`, entry])).values()]
    .sort((left, right) => right.daysAgo - left.daysAgo || left.ruleId.localeCompare(right.ruleId) || left.path.localeCompare(right.path));
  const expiringEntries = options.today === undefined
    ? []
    : expiringSuppressions([...new Map(matched.map((entry) => [`${entry.fingerprint}:${entry.expires}`, entry])).values()], options.today, options.warnWithinDays ?? DEFAULT_WARN_DAYS);
  const ref = (entry: BaselineEntry & { expires: string }, extra: object): SuppressionRef => ({ ruleId: entry.ruleId, path: entry.path, expires: entry.expires, ...(entry.owner ? { owner: entry.owner } : {}), ...(entry.reason ? { reason: entry.reason } : {}), ...extra });
  const suppressions: SuppressionState = {
    suppressed: hidden,
    ...(options.today === undefined ? {} : { today: options.today, warnWithinDays: options.warnWithinDays ?? DEFAULT_WARN_DAYS }),
    expiring: expiringEntries.map((entry) => ref(entry as BaselineEntry & { expires: string }, { daysLeft: entry.daysLeft })),
    expired: expiredSorted.map((entry) => ({ ruleId: entry.ruleId, path: entry.path, expires: entry.expires, ...(entry.owner ? { owner: entry.owner } : {}), ...(entry.reason ? { reason: entry.reason } : {}), daysAgo: entry.daysAgo })),
  };
  return {
    result: {
      ...result,
      findings,
      diagnostics: [
        ...result.diagnostics,
        `Suppressed ${hidden} finding${hidden === 1 ? "" : "s"} from the baseline.`,
        ...expiredSorted.map(expiredLine),
        ...expiringEntries.map(expiryLine),
      ],
      suppressions,
    },
    expired: expiredSorted,
  };
}

export function applyBaseline(result: ScanResult, baseline: Baseline, options: ApplyBaselineOptions = {}): ScanResult {
  return evaluateBaseline(result, baseline, options).result;
}

/** True when the policy is `fail` and at least one suppression had expired. */
export function expiredSuppressionsFail(policy: ExpiredPolicy | undefined, expired: readonly ExpiredSuppression[]): boolean {
  return policy === "fail" && expired.length > 0;
}

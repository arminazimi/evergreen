import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import type { Finding, ScanResult } from "./domain.js";
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

export interface Baseline {
  schemaVersion: "evergreen.baseline.v1";
  createdAt: string;
  findings: BaselineEntry[];
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
 * exactly the fields it always had.
 */
export function createBaseline(result: ScanResult, suppression: Suppression = {}): Baseline {
  const issues = suppressionIssues(suppression);
  if (issues.length > 0) throw new Error(`Invalid suppression: ${issues.join("; ")}.`);
  const extra = Object.fromEntries(Object.entries(suppression).filter(([, value]) => value !== undefined));
  return {
    schemaVersion: "evergreen.baseline.v1",
    createdAt: new Date().toISOString(),
    findings: result.findings.map((finding) => ({
      fingerprint: findingFingerprint(finding),
      ruleId: finding.ruleId,
      path: finding.location.path,
      ...extra,
    })),
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
  const warnings = options.today === undefined
    ? []
    : expiringSuppressions([...new Map(matched.map((entry) => [`${entry.fingerprint}:${entry.expires}`, entry])).values()], options.today, options.warnWithinDays ?? DEFAULT_WARN_DAYS).map(expiryLine);
  const expiredSorted = [...new Map(expired.map((entry) => [`${entry.ruleId}:${entry.path}:${entry.expires}`, entry])).values()]
    .sort((left, right) => right.daysAgo - left.daysAgo || left.ruleId.localeCompare(right.ruleId) || left.path.localeCompare(right.path));
  return {
    result: {
      ...result,
      findings,
      diagnostics: [
        ...result.diagnostics,
        `Suppressed ${hidden} finding${hidden === 1 ? "" : "s"} from the baseline.`,
        ...expiredSorted.map(expiredLine),
        ...warnings,
      ],
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

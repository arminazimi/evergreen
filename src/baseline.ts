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

export function applyBaseline(result: ScanResult, baseline: Baseline): ScanResult {
  const suppressed = new Set(baseline.findings.map((entry) => entry.fingerprint));
  const findings = result.findings.filter(
    (finding) => !suppressed.has(findingFingerprint(finding)),
  );
  const suppressedCount = result.findings.length - findings.length;
  return {
    ...result,
    findings,
    diagnostics: [
      ...result.diagnostics,
      `Suppressed ${suppressedCount} finding${suppressedCount === 1 ? "" : "s"} from the baseline.`,
    ],
  };
}

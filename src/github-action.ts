import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { evaluateBaseline, expiredSuppressionsFail, readBaseline } from "./baseline.js";
import type { ExpiredPolicy } from "./baseline.js";
import { badgeState, renderBadgeSvg } from "./badge.js";
import { builtInDetectors } from "./detectors/index.js";
import type { Finding, ScanResult, Severity, SourceLocation } from "./domain.js";
import { severityValues } from "./domain.js";
import { scanRepository } from "./engine.js";
import { describeData, renderJson, renderSarif } from "./reporters.js";
import type { DataInfo, SuppressionState } from "./domain.js";

export type SeverityGate = Severity | "none";
export type AnnotationLevel = "notice" | "warning" | "error";

export interface GitHubAnnotation {
  level: AnnotationLevel;
  title: string;
  message: string;
  location: SourceLocation;
}

export interface GitHubActionOptions {
  root: string;
  reportPath: string;
  /** When set, also write the findings as SARIF 2.1.0 to this path, for upload to code scanning. */
  sarifPath?: string;
  /** When set, write a Shields.io endpoint JSON file for optional publication. */
  badgePath?: string;
  baselinePath?: string;
  /** The day suppression dates are compared with (YYYY-MM-DD); defaults to today in UTC. */
  today?: string;
  /** Days before a suppression's `expires` to warn (default 14). */
  baselineWarnDays?: number;
  /** What an expired suppression does: `resurface` (default) or `fail`. */
  onExpired?: ExpiredPolicy;
  failOnSeverity?: SeverityGate;
}

export interface GitHubActionOutcome {
  result: ScanResult;
  reportPath: string;
  sarifPath?: string;
  badgePath?: string;
  /** The same badge as an SVG in the Evergreen brand colors, written next to `badgePath`. */
  badgeSvgPath?: string;
  annotations: GitHubAnnotation[];
  /** The job should fail: the severity gate was met, or the `fail` expiry policy applies. */
  failed: boolean;
  /** A finding met the severity gate. */
  gateFailed: boolean;
  gate: SeverityGate;
  /** True when the `fail` policy is set and a baseline suppression had expired. */
  expiredFailure: boolean;
}

type GitHubActionFailure = Pick<GitHubActionOutcome, "result" | "reportPath" | "failed" | "gateFailed" | "gate" | "expiredFailure">;

const severityRank = new Map(severityValues.map((severity, index) => [severity, index]));

function annotationLevel(finding: Finding): AnnotationLevel {
  if (finding.severity === "critical" || finding.severity === "high") return "error";
  if (finding.severity === "medium") return "warning";
  return "notice";
}

function annotationFor(finding: Finding): GitHubAnnotation {
  return {
    level: annotationLevel(finding),
    title: `Evergreen: ${finding.title}`,
    message: [
      finding.summary,
      finding.replacement ? `Replacement: ${finding.replacement}` : undefined,
      `Finding: ${finding.id}`,
    ]
      .filter((value): value is string => value !== undefined)
      .join("\n"),
    location: finding.location,
  };
}

function parseGate(value: SeverityGate | undefined): SeverityGate {
  const gate = value ?? "high";
  if (gate !== "none" && !severityRank.has(gate)) {
    throw new Error(`Invalid severity gate: ${gate}`);
  }
  return gate;
}

export async function runGitHubAction(options: GitHubActionOptions): Promise<GitHubActionOutcome> {
  const root = resolve(options.root);
  const gate = parseGate(options.failOnSeverity);
  let result = await scanRepository(root, builtInDetectors);
  let expiredFailure = false;
  if (options.baselinePath) {
    const evaluated = evaluateBaseline(result, await readBaseline(resolve(root, options.baselinePath)), {
      today: options.today ?? new Date().toISOString().slice(0, 10),
      ...(options.baselineWarnDays === undefined ? {} : { warnWithinDays: options.baselineWarnDays }),
      ...(options.onExpired === undefined ? {} : { onExpired: options.onExpired }),
    });
    result = evaluated.result;
    expiredFailure = expiredSuppressionsFail(options.onExpired, evaluated.expired);
  }

  const reportPath = resolve(options.reportPath);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${renderJson(result)}\n`, "utf8");
  let sarifPath: string | undefined;
  if (options.sarifPath) {
    sarifPath = resolve(options.sarifPath);
    await mkdir(dirname(sarifPath), { recursive: true });
    await writeFile(sarifPath, `${renderSarif(result)}\n`, "utf8");
  }

  const gateRank = gate === "none" ? Number.POSITIVE_INFINITY : severityRank.get(gate)!;
  const gateFailed = result.findings.some((finding) => severityRank.get(finding.severity)! >= gateRank);
  let badgePath: string | undefined;
  let badgeSvgPath: string | undefined;
  if (options.badgePath) {
    badgePath = resolve(options.badgePath);
    badgeSvgPath = badgePath.replace(/\.json$/, "") + ".svg";
    await mkdir(dirname(badgePath), { recursive: true });
    await writeFile(badgePath, `${renderBadge(result, expiredFailure)}\n`, "utf8");
    await writeFile(badgeSvgPath, `${renderBadgeSvg(result, expiredFailure)}\n`, "utf8");
  }
  return {
    result,
    reportPath,
    ...(badgePath ? { badgePath } : {}),
    ...(badgeSvgPath ? { badgeSvgPath } : {}),
    ...(sarifPath ? { sarifPath } : {}),
    annotations: result.findings.map(annotationFor),
    failed: expiredFailure || gateFailed,
    gateFailed,
    gate,
    expiredFailure,
  };
}

/** Shields.io endpoint schema v1; contains aggregate counts only, after baseline comparison. */
export function renderBadge(result: Pick<ScanResult, "findings" | "data">, expiredFailure = false): string {
  const { message, color } = badgeState(result, expiredFailure);
  return JSON.stringify({ schemaVersion: 1, label: "evergreen", message, color, labelColor: "#23423A" });
}

/**
 * The actionable error shown when an Action policy gate fails. Keep this separate from the job
 * summary so the reason and report location remain visible in the failed step's annotations.
 */
export function renderFailure(outcome: GitHubActionFailure): string | undefined {
  if (!outcome.failed) return undefined;

  const reasons: string[] = [];
  if (outcome.gateFailed) {
    const gateRank = severityRank.get(outcome.gate as Severity)!;
    const count = outcome.result.findings.filter((finding) => severityRank.get(finding.severity)! >= gateRank).length;
    reasons.push(`${count} finding${count === 1 ? "" : "s"} met or exceeded the ${outcome.gate} severity gate`);
  }
  if (outcome.expiredFailure) {
    const count = outcome.result.suppressions?.expired.length ?? 0;
    reasons.push(`${count} baseline suppression${count === 1 ? "" : "s"} expired while on-expired is fail`);
  }

  return `Evergreen failed: ${reasons.join("; ")}. JSON report: ${outcome.reportPath}. Next steps: review the annotations and JSON report, then fix the findings or update the baseline and rerun Evergreen.`;
}

export const ATTRIBUTION_LINE = "<sub>Scanned by [Evergreen](https://github.com/arminazimi/evergreen)</sub>";

const SUMMARY_FINDINGS = 10;

const cell = (text: string): string => text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();

/**
 * The job summary the Action writes: a count per severity, the most severe findings with a link to their
 * evidence, the age of the lifecycle data, and (when `attribution` is on) one small line linking to Evergreen.
 */
export function renderSummary(findings: readonly Finding[], failed: boolean, gate: SeverityGate, data: DataInfo | undefined, attribution: boolean, suppressions?: SuppressionState): string {
  const status = failed ? `failed the **${gate}** severity gate` : "passed the severity gate";
  const lines = ["## Evergreen", "", `Found **${findings.length}** new lifecycle finding${findings.length === 1 ? "" : "s"}; ${status}.`, ""];

  if (findings.length > 0) {
    const counts = new Map<Severity, number>();
    for (const finding of findings) counts.set(finding.severity, (counts.get(finding.severity) ?? 0) + 1);
    lines.push("| Severity | Findings |", "|---|---|");
    for (const severity of [...severityValues].reverse()) {
      const count = counts.get(severity);
      if (count) lines.push(`| ${severity} | ${count} |`);
    }
    lines.push("");

    const top = [...findings].sort((left, right) => (severityRank.get(right.severity) ?? 0) - (severityRank.get(left.severity) ?? 0) || left.id.localeCompare(right.id)).slice(0, SUMMARY_FINDINGS);
    lines.push("| Severity | Finding | Location | Evidence |", "|---|---|---|---|");
    for (const finding of top) {
      const source = finding.sources[0];
      const location = `${finding.location.path}${finding.location.line ? `:${finding.location.line}` : ""}`;
      lines.push(`| ${finding.severity} | ${cell(finding.title)} | \`${cell(location)}\` | ${source ? `[${cell(source.title)}](${source.url})` : "—"} |`);
    }
    if (findings.length > top.length) lines.push("", `…and ${findings.length - top.length} more; the JSON report artifact lists every finding.`);
    lines.push("");
  }

  if (suppressions) {
    lines.push(`Baseline: ${suppressions.suppressed} finding${suppressions.suppressed === 1 ? "" : "s"} suppressed, ${suppressions.expiring.length} expiring${suppressions.warnWithinDays === undefined ? "" : ` within ${suppressions.warnWithinDays} days`}, ${suppressions.expired.length} expired.`, "");
    const rows = [...suppressions.expired.map((ref) => ({ ref, when: `expired ${ref.daysAgo === 0 ? "today" : `${ref.daysAgo} day${ref.daysAgo === 1 ? "" : "s"} ago`}` })), ...suppressions.expiring.map((ref) => ({ ref, when: ref.daysLeft === 0 ? "expires today" : `expires in ${ref.daysLeft} day${ref.daysLeft === 1 ? "" : "s"}` }))];
    if (rows.length > 0) {
      lines.push("| Suppression | Location | When | Owner |", "|---|---|---|---|");
      for (const { ref, when } of rows.slice(0, SUMMARY_FINDINGS)) lines.push(`| ${cell(ref.ruleId)} | \`${cell(ref.path)}\` | ${when} (${ref.expires}) | ${ref.owner ? cell(ref.owner) : "—"} |`);
      if (rows.length > SUMMARY_FINDINGS) lines.push("", `…and ${rows.length - SUMMARY_FINDINGS} more.`);
      lines.push("");
    }
  }

  if (data) {
    lines.push(describeData(data));
    if (data.stale) lines.push("", "> **Warning:** the lifecycle data is stale, so findings may miss recent changes.");
    lines.push("");
  }
  if (attribution) lines.push(ATTRIBUTION_LINE, "");
  return lines.join("\n");
}

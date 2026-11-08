import { renderAgentSection } from "../agent-pr.js";
import type { AgentIntroducedFindings } from "../agent-pr.js";
import { badgeState } from "../badge.js";
import type { DiffResult } from "../diff.js";
import type { DataInfo, Finding, ScanResult, Severity, SuppressionRef, SuppressionState } from "../domain.js";
import { severityValues } from "../domain.js";
import { buildForecast } from "@velella/ebb/forecast";
import { required } from "../required.js";
import { describeData } from "../reporters.js";
import { severityRank } from "./inputs.js";
import type {
  GitHubActionFailure,
  GitHubAnnotation,
  PackageScanSummary,
  SeverityGate,
  UnannotatedFindings,
} from "./types.js";

type DiffSummary = Pick<DiffResult, "base" | "head" | "fixed" | "unchanged">;

function annotationLevel(finding: Finding): GitHubAnnotation["level"] {
  if (finding.severity === "critical" || finding.severity === "high") return "error";
  if (finding.severity === "medium") return "warning";
  return "notice";
}

export function annotationFor(finding: Finding): GitHubAnnotation {
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
    const gateRank = required(severityRank.get(outcome.gate as Severity), "gate severity rank");
    const count = outcome.result.findings.filter(
      (finding) => required(severityRank.get(finding.severity), "finding severity rank") >= gateRank,
    ).length;
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
const SUMMARY_TIMELINE_EVENTS = 10;
const DAY_MS = 86_400_000;

const cell = (text: string): string => text.replace(/\r?\n/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").trim();

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * What reaches a dated end of life in the next twelve months, earliest first, with how many days are
 * left. The forecast is built from the findings themselves — no registry rules are loaded here — so it
 * lists exactly the dated findings the scan reports. Capped like the findings table, so a large report
 * stays inside GitHub's summary size limit.
 */
function renderTimeline(findings: readonly Finding[]): string[] {
  const today = new Date().toISOString().slice(0, 10);
  const forecast = buildForecast({ root: ".", findings }, [], today);
  if (forecast.total === 0) return [];

  const events = forecast.groups.flatMap((group) => group.events);
  const lines = [
    "### Timeline",
    "",
    `**Next ${plural(forecast.months, "month")}:** ${plural(events.length, "dated lifecycle event")} affect${events.length === 1 ? "s" : ""} this repository (${forecast.today} to ${forecast.until}).`,
    "",
    "| Ends | Left | Severity | Lifecycle event | Location |",
    "|---|---|---|---|---|",
  ];
  for (const event of events.slice(0, SUMMARY_TIMELINE_EVENTS)) {
    const left = daysBetween(today, event.date);
    const [first, ...rest] = event.findings;
    const location =
      first === undefined
        ? "—"
        : `\`${cell(first.path)}${first.line === undefined ? "" : `:${first.line}`}\`${rest.length === 0 ? "" : ` +${rest.length} more`}`;
    lines.push(
      `| ${event.date} | ${left === 0 ? "today" : `${plural(left, "day")} left`} | ${event.severity} | ${cell(event.title)} | ${location} |`,
    );
  }
  if (events.length > SUMMARY_TIMELINE_EVENTS)
    lines.push(
      "",
      `…and ${events.length - SUMMARY_TIMELINE_EVENTS} more dated events; the JSON report artifact lists every deadline.`,
    );
  lines.push("");
  return lines;
}

function appendFindingTables(lines: string[], findings: readonly Finding[]): void {
  if (findings.length === 0) return;

  const counts = new Map<Severity, number>();
  for (const finding of findings) counts.set(finding.severity, (counts.get(finding.severity) ?? 0) + 1);
  lines.push("| Severity | Findings |", "|---|---|");
  for (const severity of [...severityValues].reverse()) {
    const count = counts.get(severity);
    if (count) lines.push(`| ${severity} | ${count} |`);
  }
  lines.push("");

  const top = [...findings]
    .sort(
      (left, right) =>
        (severityRank.get(right.severity) ?? 0) - (severityRank.get(left.severity) ?? 0) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, SUMMARY_FINDINGS);
  lines.push("| Severity | Finding | Location | Evidence |", "|---|---|---|---|");
  for (const finding of top) {
    const source = finding.sources[0];
    const location = `${finding.location.path}${finding.location.line ? `:${finding.location.line}` : ""}`;
    lines.push(
      `| ${finding.severity} | ${cell(finding.title)} | \`${cell(location)}\` | ${source ? `[${cell(source.title)}](${source.url})` : "—"} |`,
    );
  }
  if (findings.length > top.length)
    lines.push("", `…and ${findings.length - top.length} more; the JSON report artifact lists every finding.`);
  lines.push("");
}

function renderOverview(
  findings: readonly Finding[],
  failed: boolean,
  gate: SeverityGate,
  diff: DiffSummary | undefined,
  packages: readonly PackageScanSummary[] | undefined,
): string {
  const status = failed ? `failed the **${gate}** severity gate` : "passed the severity gate";
  if (diff) {
    return `Found **${findings.length}** lifecycle finding${findings.length === 1 ? "" : "s"} introduced by this pull request (${diff.base}..${diff.head}); ${status}.`;
  }
  const scope =
    packages && packages.length > 0 ? ` across **${packages.length}** package${packages.length === 1 ? "" : "s"}` : "";
  return `Found **${findings.length}** new lifecycle finding${findings.length === 1 ? "" : "s"}${scope}; ${status}.`;
}

function appendFindingSections(
  lines: string[],
  findings: readonly Finding[],
  packages: readonly PackageScanSummary[] | undefined,
): void {
  if (!packages || packages.length === 0) {
    appendFindingTables(lines, findings);
    return;
  }
  for (const pkg of packages) {
    lines.push(`## \`${pkg.path}\``, "");
    lines.push(`Found **${pkg.findings.length}** new lifecycle finding${pkg.findings.length === 1 ? "" : "s"}.`, "");
    appendFindingTables(lines, pkg.findings);
  }
}

function appendDiffSection(lines: string[], diff: DiffSummary | undefined): void {
  if (!diff) return;
  lines.push(
    `Fixed by this pull request: **${diff.fixed.length}** finding${diff.fixed.length === 1 ? "" : "s"} (${diff.unchanged} unchanged).`,
    "",
  );
  if (diff.fixed.length === 0) return;
  lines.push("| Severity | Fixed finding | Location |", "|---|---|---|");
  for (const finding of diff.fixed.slice(0, SUMMARY_FINDINGS)) {
    const location = `${finding.location.path}${finding.location.line ? `:${finding.location.line}` : ""}`;
    lines.push(`| ${finding.severity} | ${cell(finding.title)} | \`${cell(location)}\` |`);
  }
  if (diff.fixed.length > SUMMARY_FINDINGS) lines.push("", `…and ${diff.fixed.length - SUMMARY_FINDINGS} more.`);
  lines.push("");
}

function appendUnannotatedSection(lines: string[], unannotated: UnannotatedFindings | undefined): void {
  if (!unannotated || unannotated.count === 0) return;
  const report = unannotated.reportUrl ? `[JSON report](${unannotated.reportUrl})` : "JSON report";
  lines.push(
    `Not annotated: **${unannotated.count}** finding${unannotated.count === 1 ? "" : "s"} not on lines this pull request changed; the ${report} lists every finding.`,
    "",
  );
}

interface SuppressionRow {
  ref: SuppressionRef;
  when: string;
}

function suppressionRows(suppressions: SuppressionState): SuppressionRow[] {
  return [
    ...suppressions.expired.map((ref) => ({
      ref,
      when: `expired ${ref.daysAgo === 0 ? "today" : `${ref.daysAgo} day${ref.daysAgo === 1 ? "" : "s"} ago`}`,
    })),
    ...suppressions.expiring.map((ref) => ({
      ref,
      when: ref.daysLeft === 0 ? "expires today" : `expires in ${ref.daysLeft} day${ref.daysLeft === 1 ? "" : "s"}`,
    })),
  ];
}

function appendSuppressionSection(lines: string[], suppressions: SuppressionState | undefined): void {
  if (!suppressions) return;
  lines.push(
    `Baseline: ${suppressions.suppressed} finding${suppressions.suppressed === 1 ? "" : "s"} suppressed, ${suppressions.expiring.length} expiring${suppressions.warnWithinDays === undefined ? "" : ` within ${suppressions.warnWithinDays} days`}, ${suppressions.expired.length} expired.`,
    "",
  );
  const rows = suppressionRows(suppressions);
  if (rows.length === 0) return;
  lines.push("| Suppression | Location | When | Owner |", "|---|---|---|---|");
  for (const { ref, when } of rows.slice(0, SUMMARY_FINDINGS))
    lines.push(
      `| ${cell(ref.ruleId)} | \`${cell(ref.path)}\` | ${when} (${ref.expires}) | ${ref.owner ? cell(ref.owner) : "—"} |`,
    );
  if (rows.length > SUMMARY_FINDINGS) lines.push("", `…and ${rows.length - SUMMARY_FINDINGS} more.`);
  lines.push("");
}

function appendDataSection(lines: string[], data: DataInfo | undefined): void {
  if (!data) return;
  lines.push(describeData(data));
  if (data.stale) lines.push("", "> **Warning:** the lifecycle data is stale, so findings may miss recent changes.");
  lines.push("");
}

/**
 * The job summary the Action writes: a count per severity, the most severe findings with a link to their
 * evidence, the age of the lifecycle data, and (when `attribution` is on) one small line linking to Evergreen.
 * When `diff` is set the scan covered a pull request range: the header and a fixed-findings table say so.
 * When `packages` is set, one section is written per package after the overview.
 * `unannotated` counts the findings that are not on a line the pull request changed, with a link to the full report.
 * `agent` adds the stale choices an agent-authored pull request introduced, with the replacements.
 */
export function renderSummary(
  findings: readonly Finding[],
  failed: boolean,
  gate: SeverityGate,
  data: DataInfo | undefined,
  attribution: boolean,
  suppressions?: SuppressionState,
  diff?: DiffSummary,
  packages?: readonly PackageScanSummary[],
  unannotated?: UnannotatedFindings,
  agent?: AgentIntroducedFindings,
): string {
  const lines = ["## Evergreen", "", renderOverview(findings, failed, gate, diff, packages), ""];
  if (agent) lines.push(...renderAgentSection(agent.findings));
  lines.push(...renderTimeline(findings));
  appendFindingSections(lines, findings, packages);
  appendDiffSection(lines, diff);
  appendUnannotatedSection(lines, unannotated);
  appendSuppressionSection(lines, suppressions);
  appendDataSection(lines, data);
  if (attribution) lines.push(ATTRIBUTION_LINE, "");
  return lines.join("\n");
}

/** Hidden marker that identifies the one comment Evergreen owns on a pull request, so re-runs update it. */
export const PR_COMMENT_MARKER = "<!-- evergreen-pr-comment -->";

/** The pull-request comment: the marker, then the same counts and top findings as the job summary. */
export function renderComment(
  findings: readonly Finding[],
  failed: boolean,
  gate: SeverityGate,
  data: DataInfo | undefined,
  attribution: boolean,
  suppressions?: SuppressionState,
  diff?: DiffSummary,
  packages?: readonly PackageScanSummary[],
  unannotated?: UnannotatedFindings,
  agent?: AgentIntroducedFindings,
): string {
  return `${PR_COMMENT_MARKER}\n${renderSummary(findings, failed, gate, data, attribution, suppressions, diff, packages, unannotated, agent)}`;
}

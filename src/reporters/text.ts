import type { DependencyCheck } from "../check-dependency.js";
import { COVERAGE_WALK_LIMIT, type ScanCoverage, type ScanResult } from "../domain.js";
import type { MigrationPacket, UpgradePath } from "../migration-packet.js";
import { compare, describeData } from "./shared.js";

/** How many paths the empty-scan text report lists before saying "... and N more". JSON coverage stays complete. */
export const EMPTY_SCAN_PATH_LIST_LIMIT = 10;

export interface TextOptions {
  /** No Evergreen config exists yet: lead with a short summary and the next command to run. */
  firstRun?: boolean;
  /**
   * What a zero-finding scan checked. When omitted, uses `result.coverage`, then unclassified
   * references on the result (or reports none).
   */
  coverage?: ScanCoverage;
}

function formatCoverageList(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

/** Path lists in the text report stay short; the JSON `coverage` field keeps every path. */
function formatCoveragePaths(values: readonly string[]): string {
  if (values.length === 0) return "none";
  if (values.length <= EMPTY_SCAN_PATH_LIST_LIMIT) return values.join(", ");
  const shown = values.slice(0, EMPTY_SCAN_PATH_LIST_LIMIT);
  const more = values.length - EMPTY_SCAN_PATH_LIST_LIMIT;
  return `${shown.join(", ")}, ... and ${more} more`;
}

/** Ecosystems and paths implied by unclassified pins when the scan result has no coverage block. */
export function deriveScanCoverage(result: ScanResult): ScanCoverage {
  const references = result.unclassified?.references ?? [];
  const ecosystems = [...new Set(references.map((reference) => reference.detector))].sort(compare);
  const filesRead = [...new Set(references.map((reference) => reference.location.path))].sort(compare);
  const unsupportedFiles = [...filesRead];
  return { ecosystems, filesRead, unsupportedFiles };
}

function resolveCoverage(result: ScanResult, coverage?: ScanCoverage): ScanCoverage {
  return coverage ?? result.coverage ?? deriveScanCoverage(result);
}

/**
 * The empty-scan footer: what was checked, the data version, and what to try next. Printed only in the
 * text report so machine-readable formats stay focused on findings. Path lists are capped at
 * {@link EMPTY_SCAN_PATH_LIST_LIMIT}; JSON coverage is not.
 */
export function renderEmptyScanHelp(result: ScanResult, coverage?: ScanCoverage): string[] {
  const resolved = resolveCoverage(result, coverage);
  return [
    "",
    "No lifecycle risks found.",
    `Ecosystems detected: ${formatCoverageList(resolved.ecosystems)}`,
    `Files read: ${formatCoveragePaths(resolved.filesRead)}`,
    `Data version: ${result.data?.version ?? "none"}`,
    `Unsupported files: ${formatCoveragePaths(resolved.unsupportedFiles)}`,
    ...(resolved.truncated ? [`Coverage is partial: only the first ${COVERAGE_WALK_LIMIT} entries were checked.`] : []),
    "",
    "Next: run `evergreen scan --demo` to see what a finding looks like.",
    "Next: after a scan reports findings, run `evergreen explain <finding-id>` for details.",
  ];
}

/** A headline, the top three findings, and the next command, for a user who has not set Evergreen up yet. */
export function renderFirstRunSummary(result: ScanResult): string[] {
  const count = result.findings.length;
  if (count === 0) {
    return [
      "No lifecycle risks found. Evergreen checked this repository and it looks healthy.",
      "Next: run `evergreen init --personal` to check every repository before you push.",
      "",
    ];
  }
  const lines = [`Found ${count} lifecycle risk${count === 1 ? "" : "s"}. The most urgent:`];
  for (const finding of result.findings.slice(0, 3)) {
    const line = finding.location.line ? `:${finding.location.line}` : "";
    lines.push(`  ${finding.severity.toUpperCase()} ${finding.title} (${finding.location.path}${line})`);
  }
  if (count > 3) lines.push(`  …and ${count - 3} more below.`);
  lines.push("Next: run `evergreen init --personal` to check every repository before you push.", "");
  return lines;
}

/** One finding's body for the text report; kept separate so `renderText` stays under the complexity ceiling. */
function findingTextLines(finding: ScanResult["findings"][number]): string[] {
  const line = finding.location.line ? `:${finding.location.line}` : "";
  const lines = [
    "",
    `${finding.severity.toUpperCase()} ${finding.title}`,
    `${finding.location.path}${line}`,
    `Confidence: ${finding.confidence}`,
    finding.summary,
  ];
  if (finding.dependencyPath) lines.push(`Path: ${finding.dependencyPath.join(" > ")}`);
  if (finding.replacement) lines.push(`Replacement: ${finding.replacement}`);
  if (finding.deadline) lines.push(`Deadline: ${finding.deadline}`);
  if (finding.advisoryIds?.length) lines.push(`Advisories: ${finding.advisoryIds.join(", ")}`);
  if (finding.impact) {
    lines.push(
      `Impact: ${finding.impact.level} (${finding.impact.usageCount} usages across ${finding.impact.affectedFiles} files)`,
    );
  }
  for (const usage of finding.usages ?? []) {
    const usageLine = usage.location.line ? `:${usage.location.line}` : "";
    lines.push(`Usage: ${usage.location.path}${usageLine} — ${usage.kind} ${usage.symbol}`);
  }
  for (const source of finding.sources) lines.push(`Source: ${source.url}`);
  return lines;
}

export function renderText(result: ScanResult, options: TextOptions = {}): string {
  const lines = [
    ...(options.firstRun ? renderFirstRunSummary(result) : []),
    "Evergreen scan",
    `Repository: ${result.root}`,
    `Findings: ${result.findings.length}`,
    ...(result.selection?.only?.length ? [`Only: ${result.selection.only.join(", ")}`] : []),
    ...(result.selection?.exclude?.length ? [`Excluded: ${result.selection.exclude.join(", ")}`] : []),
    ...(result.data ? [describeData(result.data)] : []),
  ];
  const unclassified = result.unclassified?.count ?? 0;
  if (unclassified > 0) {
    lines.push(
      `Unclassified: ${unclassified} pinned reference${unclassified === 1 ? "" : "s"} (use JSON output for details)`,
    );
  }

  if (result.findings.length === 0) {
    lines.push(...renderEmptyScanHelp(result, options.coverage));
  }

  for (const finding of result.findings) lines.push(...findingTextLines(finding));

  if (result.suppressions) {
    const state = result.suppressions;
    lines.push(
      "",
      `Baseline: ${state.suppressed} finding${state.suppressed === 1 ? "" : "s"} suppressed, ${state.expiring.length} expiring${state.warnWithinDays === undefined ? "" : ` within ${state.warnWithinDays} days`}, ${state.expired.length} expired.`,
    );
  }

  for (const diagnostic of result.diagnostics) {
    lines.push("", `Note: ${diagnostic}`);
  }

  return lines.join("\n");
}

export function renderCheckText(check: DependencyCheck): string {
  const lines = [
    "Evergreen check",
    check.version ? `${check.purl}@${check.version}` : check.purl,
    `Status: ${check.status}${check.severity ? ` (${check.severity})` : ""}`,
    ...(check.data ? [describeData(check.data)] : []),
    "",
    check.message,
  ];
  if (check.data?.stale)
    lines.push(
      "",
      `Warning: The lifecycle data is ${check.data.ageDays} days old (stale after 30), so this answer may miss recent changes. Run "evergreen data update".`,
    );
  for (const finding of check.findings) {
    lines.push("", `${finding.severity.toUpperCase()} ${finding.title}`, finding.summary);
    lines.push(`Event: ${finding.event}`, `Affected versions: ${finding.affectedVersions}`);
    if (finding.replacement) lines.push(`Replacement: ${finding.replacement}`);
    if (finding.deadline) lines.push(`Deadline: ${finding.deadline}`);
    for (const source of finding.sources) lines.push(`Source: ${source.url}`);
  }
  return lines.join("\n");
}

export function renderFindingText(finding: ScanResult["findings"][number]): string {
  const line = finding.location.line ? `:${finding.location.line}` : "";
  const lines = [
    `${finding.severity.toUpperCase()} ${finding.title}`,
    `ID: ${finding.id}`,
    `Rule: ${finding.ruleId}`,
    `Location: ${finding.location.path}${line}`,
    "",
    finding.summary,
  ];
  if (finding.dependencyPath) lines.push("", `Path: ${finding.dependencyPath.join(" > ")}`);
  if (finding.replacement) lines.push("", `Replacement: ${finding.replacement}`);
  if (finding.deadline) lines.push(`Deadline: ${finding.deadline}`);
  if (finding.advisoryIds?.length) lines.push(`Advisories: ${finding.advisoryIds.join(", ")}`);
  if (finding.impact) {
    lines.push(
      `Impact: ${finding.impact.level} (${finding.impact.usageCount} usages across ${finding.impact.affectedFiles} files)`,
    );
  }
  if (finding.usages?.length) {
    lines.push(
      "",
      "Affected usages:",
      ...finding.usages.map((usage) => {
        const usageLine = usage.location.line ? `:${usage.location.line}` : "";
        return `- ${usage.location.path}${usageLine} — ${usage.kind} ${usage.symbol}`;
      }),
    );
  }
  lines.push("", "Sources:", ...finding.sources.map((source) => `- ${source.title}: ${source.url}`));
  return lines.join("\n");
}

function renderUpgradePath(path: UpgradePath): string[] {
  const target = path.target.replacement
    ? path.target.replacement
    : `${path.target.title} (${path.target.versions}${path.target.endsOn ? `, supported until ${path.target.endsOn}` : ""})`;
  return [
    "Upgrade path:",
    `- From: ${path.from.title} (${path.from.versions})`,
    ...path.skipped.map(
      (line) =>
        `- Skip: ${line.title} (${line.versions}) — ${line.status === "ended" ? "support has ended" : `support ends ${line.endsOn}`}`,
    ),
    `- Land on: ${target}`,
  ];
}

export function renderMigrationPacketText(packet: MigrationPacket): string {
  const lines = [
    `Migration context: ${packet.finding.title}`,
    `Finding: ${packet.finding.id}`,
    `Severity: ${packet.finding.severity}`,
    "",
    "Affected files:",
    ...packet.affectedFiles.map((path) => `- ${path}`),
    "",
    "Constraints:",
    ...packet.constraints.map((constraint) => `- ${constraint}`),
    "",
    "Migration steps:",
    ...packet.steps.map((step, index) => `${index + 1}. ${step.title}: ${step.instructions}`),
    ...(packet.upgradePath ? ["", ...renderUpgradePath(packet.upgradePath)] : []),
    "",
    "Verification:",
    ...packet.verification.map((verification) => `- ${verification.command} — ${verification.purpose}`),
    "",
    "Sources:",
    ...packet.sources.map((source) => `- ${source.title}: ${source.url}`),
  ];
  return lines.join("\n");
}

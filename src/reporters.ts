import type { DependencyCheck } from "./check-dependency.js";
import type { DataInfo, Finding, ScanResult, Severity } from "./domain.js";
import type { MigrationPacket } from "./migration-packet.js";
import { VERSION } from "./version.js";

export function renderJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";
const SARIF_LEVEL: Record<Severity, "error" | "warning" | "note"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
  info: "note",
};

/** Help for a rule in code scanning: what to move to, by when, how, and the evidence behind the claim. */
function sarifHelp(finding: Finding): { text: string; markdown: string } {
  const text: string[] = [finding.title];
  const markdown: string[] = [`**${finding.title}**`];
  const add = (plain: string, rich = plain) => {
    text.push(plain);
    markdown.push(rich);
  };
  if (finding.replacement) add(`Replacement: ${finding.replacement}`, `**Replacement:** ${finding.replacement}`);
  if (finding.deadline) add(`Deadline: ${finding.deadline}`, `**Deadline:** ${finding.deadline}`);
  const migration = finding.migration;
  if (migration && migration.steps.length > 0) {
    const steps = migration.steps.map((step, index) => `${index + 1}. ${step.title}: ${step.instructions}`);
    add(["Migration:", ...steps].join("\n"), ["**Migration**", "", ...steps].join("\n"));
  }
  if (migration && migration.verification.length > 0) {
    add(
      ["Verify:", ...migration.verification.map((item) => `- ${item.command} (${item.purpose})`)].join("\n"),
      ["**Verify**", "", ...migration.verification.map((item) => `- \`${item.command}\`: ${item.purpose}`)].join("\n"),
    );
  }
  if (finding.sources.length > 0) {
    add(
      ["Sources:", ...finding.sources.map((source) => `- ${source.title}: ${source.url}`)].join("\n"),
      ["**Sources**", "", ...finding.sources.map((source) => `- [${source.title}](${source.url})`)].join("\n"),
    );
  }
  return { text: text.join("\n\n"), markdown: markdown.join("\n\n") };
}

/** One line saying which lifecycle data a result used and how fresh its evidence is. */
export function describeData(data: DataInfo): string {
  const age = data.ageDays === 0 ? "today" : `${data.ageDays} day${data.ageDays === 1 ? "" : "s"} ago`;
  return `Data: ${data.source} ${data.version}, evidence reviewed through ${data.reviewedThrough} (${age})${data.stale ? ", stale" : ""}`;
}

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

function sarifOrder(left: Finding, right: Finding): number {
  return (
    compare(left.location.path, right.location.path) ||
    (left.location.line ?? 0) - (right.location.line ?? 0) ||
    compare(left.ruleId, right.ruleId) ||
    compare(left.id, right.id)
  );
}

/**
 * Renders a scan as one SARIF 2.1.0 run. Output is deterministic: rules and results are sorted, paths are
 * repository-relative with forward slashes, and nothing machine-specific (root, time) is included. Only
 * locations and Evergreen's own rule text are written; no source content is uploaded.
 */
export function renderSarif(result: ScanResult): string {
  const findings = [...result.findings].sort(sarifOrder);
  const ruleIds = [...new Set(findings.map((finding) => finding.ruleId))].sort(compare);
  const rules = ruleIds.map((ruleId) => {
    const finding = findings.find((candidate) => candidate.ruleId === ruleId)!;
    return {
      id: ruleId,
      name: ruleId,
      shortDescription: { text: finding.title },
      help: sarifHelp(finding),
      ...(finding.sources[0] ? { helpUri: finding.sources[0].url } : {}),
      defaultConfiguration: { level: SARIF_LEVEL[finding.severity] },
      properties: { tags: ["lifecycle", finding.detector] },
    };
  });

  const sarif = {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Evergreen",
            version: VERSION,
            informationUri: "https://github.com/arminazimi/evergreen",
            rules,
          },
        },
        // Only fixed facts about the data are written, so the same data always gives the same file.
        ...(result.data ? { properties: { evergreenData: { source: result.data.source, version: result.data.version, reviewedThrough: result.data.reviewedThrough } } } : {}),
        results: findings.map((finding) => ({
          ruleId: finding.ruleId,
          ruleIndex: ruleIds.indexOf(finding.ruleId),
          level: SARIF_LEVEL[finding.severity],
          message: { text: finding.summary },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: finding.location.path, uriBaseId: "%SRCROOT%" },
                ...(finding.location.line ? { region: { startLine: finding.location.line } } : {}),
              },
            },
          ],
          partialFingerprints: { "evergreenFindingId/v1": finding.id },
        })),
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}

export function renderText(result: ScanResult): string {
  const lines = [
    "Evergreen scan",
    `Repository: ${result.root}`,
    `Findings: ${result.findings.length}`,
    ...(result.data ? [describeData(result.data)] : []),
  ];
  const unclassified = result.unclassified?.count ?? 0;
  if (unclassified > 0) {
    lines.push(
      `Unclassified: ${unclassified} pinned reference${unclassified === 1 ? "" : "s"} (use JSON output for details)`,
    );
  }

  for (const finding of result.findings) {
    const line = finding.location.line ? `:${finding.location.line}` : "";
    lines.push("", `${finding.severity.toUpperCase()} ${finding.title}`);
    lines.push(`${finding.location.path}${line}`);
    lines.push(finding.summary);
    if (finding.replacement) {
      lines.push(`Replacement: ${finding.replacement}`);
    }
    if (finding.deadline) {
      lines.push(`Deadline: ${finding.deadline}`);
    }
    if (finding.impact) {
      lines.push(
        `Impact: ${finding.impact.level} (${finding.impact.usageCount} usages across ${finding.impact.affectedFiles} files)`,
      );
    }
    for (const usage of finding.usages ?? []) {
      const usageLine = usage.location.line ? `:${usage.location.line}` : "";
      lines.push(`Usage: ${usage.location.path}${usageLine} — ${usage.kind} ${usage.symbol}`);
    }
    for (const source of finding.sources) {
      lines.push(`Source: ${source.url}`);
    }
  }

  if (result.suppressions) {
    const state = result.suppressions;
    lines.push("", `Baseline: ${state.suppressed} finding${state.suppressed === 1 ? "" : "s"} suppressed, ${state.expiring.length} expiring${state.warnWithinDays === undefined ? "" : ` within ${state.warnWithinDays} days`}, ${state.expired.length} expired.`);
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
  if (check.data?.stale) lines.push("", `Warning: The lifecycle data is ${check.data.ageDays} days old (stale after 30), so this answer may miss recent changes. Run "evergreen data update".`);
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
  if (finding.replacement) lines.push("", `Replacement: ${finding.replacement}`);
  if (finding.deadline) lines.push(`Deadline: ${finding.deadline}`);
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
    "",
    "Verification:",
    ...packet.verification.map((verification) =>
      `- ${verification.command} — ${verification.purpose}`
    ),
    "",
    "Sources:",
    ...packet.sources.map((source) => `- ${source.title}: ${source.url}`),
  ];
  return lines.join("\n");
}

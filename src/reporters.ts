import type { ScanResult } from "./domain.js";
import type { MigrationPacket } from "./migration-packet.js";

export function renderJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderText(result: ScanResult): string {
  const lines = [
    "Evergreen scan",
    `Repository: ${result.root}`,
    `Findings: ${result.findings.length}`,
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

  for (const diagnostic of result.diagnostics) {
    lines.push("", `Note: ${diagnostic}`);
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

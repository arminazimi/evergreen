// Turning engine findings into LSP diagnostics, hover cards, and plain-text explanations.

import type { Finding, Severity } from "../domain.js";
import { DIAGNOSTIC_SOURCE } from "./protocol.js";
import type { LspRange } from "./protocol.js";

export interface LspDiagnostic {
  range: LspRange;
  severity: number;
  code: string;
  codeDescription?: { href: string };
  source: string;
  message: string;
  data: { findingId: string; ruleId: string };
}

const DIAGNOSTIC_SEVERITY: Record<Severity, number> = {
  critical: 1,
  high: 1,
  medium: 2,
  low: 3,
  info: 3,
};

export function diagnosticFor(text: string, finding: Finding): LspDiagnostic {
  const url = firstSourceUrl(finding);
  return {
    range: findingRange(finding, text),
    severity: DIAGNOSTIC_SEVERITY[finding.severity],
    code: finding.ruleId,
    ...(url ? { codeDescription: { href: url } } : {}),
    source: DIAGNOSTIC_SOURCE,
    message: finding.summary.length > 0 ? `${finding.title}\n\n${finding.summary}` : finding.title,
    data: { findingId: finding.id, ruleId: finding.ruleId },
  };
}

export function documentRange(text: string): LspRange {
  const lines = text.split(/\r\n|\r|\n/);
  const lastLine = Math.max(lines.length - 1, 0);
  return {
    start: { line: 0, character: 0 },
    end: { line: lastLine, character: (lines[lastLine] ?? "").length },
  };
}

export function positionInRange(position: { line: number; character: number }, range: LspRange): boolean {
  if (position.line < range.start.line || position.line > range.end.line) return false;
  if (position.line === range.start.line && position.character < range.start.character) return false;
  if (position.line === range.end.line && position.character > range.end.character) return false;
  return true;
}

export function rangesOverlap(left: LspRange, right: LspRange): boolean {
  return !(
    left.end.line < right.start.line ||
    right.end.line < left.start.line ||
    (left.end.line === right.start.line && left.end.character < right.start.character) ||
    (right.end.line === left.start.line && right.end.character < left.start.character)
  );
}

export function hoverMarkdown(finding: Finding, range: LspRange): string {
  const lines = [
    `**${finding.title}**`,
    "",
    finding.summary,
    "",
    `- **Severity:** ${finding.severity}`,
    `- **Confidence:** ${finding.confidence}`,
    `- **Rule:** \`${finding.ruleId}\``,
    `- **Location:** line ${range.start.line + 1}`,
  ];
  if (finding.replacement) lines.push(`- **Replacement:** ${finding.replacement}`);
  if (finding.deadline) lines.push(`- **Deadline:** ${finding.deadline}`);
  if (finding.impact)
    lines.push(`- **Usages:** ${finding.impact.usageCount} in ${finding.impact.affectedFiles} file(s)`);

  if (finding.sources.length > 0) {
    lines.push("", "**Evidence**");
    for (const source of finding.sources) lines.push(`- [${source.title}](${source.url})`);
  }
  if (finding.migration?.verification.length) {
    lines.push("", "**Verify after changing**");
    for (const command of finding.migration.verification) lines.push(`- \`${command.command}\` — ${command.purpose}`);
  }
  return lines.join("\n");
}

export function explainMessage(finding: Finding): string {
  const parts = [`Evergreen: ${finding.title}`, finding.summary];
  if (finding.replacement) parts.push(`Replacement: ${finding.replacement}`);
  if (finding.deadline) parts.push(`Deadline: ${finding.deadline}`);
  const urls = finding.sources.map((source) => source.url).filter(isHttpUrl);
  if (urls.length > 0) parts.push(`Evidence: ${urls.join(" ")}`);
  return parts.join("\n");
}

export function firstSourceUrl(finding: Finding): string | undefined {
  return finding.sources.map((source) => source.url).find(isHttpUrl);
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function findingRange(finding: Finding, text: string): LspRange {
  const lines = text.split(/\r\n|\r|\n/);
  const line = clamp((finding.location.line ?? 1) - 1, 0, Math.max(lines.length - 1, 0));
  const lineText = lines[line] ?? "";
  const column = finding.location.column;
  if (column === undefined) {
    const start = Math.max(lineText.search(/\S/), 0);
    return { start: { line, character: start }, end: { line, character: Math.max(lineText.trimEnd().length, start) } };
  }
  const start = clamp(column - 1, 0, lineText.length);
  const firstToken = lineText.slice(start).search(/\S/);
  const tokenStart = firstToken >= 0 ? start + firstToken : start;
  const token = /^\S+/.exec(lineText.slice(tokenStart));
  const end = token ? tokenStart + token[0].length : Math.min(tokenStart + 1, lineText.length);
  return { start: { line, character: tokenStart }, end: { line, character: Math.max(end, tokenStart) } };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

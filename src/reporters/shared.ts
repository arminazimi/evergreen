import type { DataInfo, Finding, Severity } from "../domain.js";
import { severityValues } from "../domain.js";

export const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/** The one order every machine-readable reporter uses, so the same scan always lists findings the same way. */
export function findingOrder(left: Finding, right: Finding): number {
  return (
    compare(left.location.path, right.location.path) ||
    (left.location.line ?? 0) - (right.location.line ?? 0) ||
    compare(left.ruleId, right.ruleId) ||
    compare(left.id, right.id)
  );
}

/** One line saying which lifecycle data a result used and how fresh its evidence is. */
export function describeData(data: DataInfo): string {
  const age = data.ageDays === 0 ? "today" : `${data.ageDays} day${data.ageDays === 1 ? "" : "s"} ago`;
  return `Data: ${data.source} ${data.version}, evidence reviewed through ${data.reviewedThrough} (${age})${data.stale ? ", stale" : ""}`;
}

export const severityRank = (severity: Severity) => severityValues.indexOf(severity);

/** Escapes untrusted text for a Markdown table cell while keeping the report on one physical line per row. */
export function escapeMarkdown(value: string | number): string {
  const escapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "|": "&#124;",
    "\\": "&#92;",
  };
  return String(value)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[&<>|\\\x60*_{}\[\]()#+\-.!]/g, (character) => escapes[character] ?? "\\" + character))
    .join("<br>");
}

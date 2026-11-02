import type { ScanResult } from "../domain.js";
import { findingOrder, severityRank } from "./shared.js";

/** The most findings `--format compact` lists. The rest are counted, not listed. */
export const COMPACT_MAX_FINDINGS = 25;
/** The longest one compact line gets, in characters; longer lines end in an ellipsis. */
export const COMPACT_MAX_LINE = 240;
/** The documented ceiling on compact output: the header, {@link COMPACT_MAX_FINDINGS} lines, and the omitted note. */
export const COMPACT_MAX_BYTES = 8192;

/**
 * Renders a scan for an agent's context window: one line per finding with its id, location, severity, and replacement,
 * most severe first, capped at {@link COMPACT_MAX_FINDINGS} findings with a count of the ones left out. Findings keep
 * the order the other machine-readable reporters use within a severity, so the same scan always renders the same way.
 */
export function renderCompact(result: ScanResult): string {
  const findings = [...result.findings].sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || findingOrder(left, right));
  const lines = [`Evergreen: ${findings.length} finding${findings.length === 1 ? "" : "s"}`];
  for (const finding of findings.slice(0, COMPACT_MAX_FINDINGS)) {
    const line = finding.location.line ? `:${finding.location.line}` : "";
    const text = `${finding.id} ${finding.location.path}${line} ${finding.severity} ${finding.replacement ?? "-"}`.replace(/\s+/g, " ");
    lines.push(text.length > COMPACT_MAX_LINE ? `${text.slice(0, COMPACT_MAX_LINE - 1)}…` : text);
  }
  const omitted = findings.length - COMPACT_MAX_FINDINGS;
  if (omitted > 0) lines.push(`${omitted} more finding${omitted === 1 ? "" : "s"} omitted; use --format json for all.`);
  return lines.join("\n");
}

import type { ScanResult } from "../domain.js";
import { findingOrder } from "./shared.js";

/** Strips characters XML 1.0 cannot represent, then escapes the rest for use in text or attribute values. */
function escapeXml(value: string | number): string {
  return String(value)
    .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/[&<>"']/g, (character) => {
      const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
      return escapes[character] ?? character;
    });
}

/**
 * Renders a scan as JUnit XML: one testsuite, one failed testcase per finding. The failure carries the
 * severity, location, replacement, and evidence sources. Output is deterministic (same order as the other
 * machine-readable reporters, no timestamps or machine-specific paths), and all finding text is escaped.
 */
export function renderJunit(result: ScanResult): string {
  const findings = [...result.findings].sort(findingOrder);
  const cases = findings.map((finding) => {
    const location = finding.location.line ? finding.location.path + ":" + finding.location.line : finding.location.path;
    const body = [
      "Severity: " + finding.severity,
      "Location: " + location,
      finding.summary,
      ...(finding.replacement ? ["Replacement: " + finding.replacement] : []),
      ...finding.sources.map((source) => "Evidence: " + source.title + " (" + source.url + ")"),
    ].join("\n");
    return [
      `    <testcase classname="${escapeXml(finding.ruleId)}" name="${escapeXml(finding.title + " (" + location + ")")}" file="${escapeXml(finding.location.path)}"${finding.location.line ? ` line="${finding.location.line}"` : ""}>`,
      `      <failure message="${escapeXml(finding.summary)}" type="${escapeXml(finding.severity)}">${escapeXml(body)}</failure>`,
      "    </testcase>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="Evergreen" tests="${findings.length}" failures="${findings.length}" errors="0">`,
    `  <testsuite name="Evergreen scan" tests="${findings.length}" failures="${findings.length}" errors="0" skipped="0">`,
    ...cases,
    ...(result.diagnostics.length > 0 ? ["    <system-out>" + escapeXml(result.diagnostics.join("\n")) + "</system-out>"] : []),
    "  </testsuite>",
    "</testsuites>",
  ].join("\n");
}

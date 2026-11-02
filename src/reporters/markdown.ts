import type { ScanResult } from "../domain.js";
import { describeData, escapeMarkdown, findingOrder } from "./shared.js";

/** Only trusted web schemes become Markdown links; unsafe or malformed URLs stay plain text. */
function markdownSource(source: { title: string; url: string }): string {
  const title = escapeMarkdown(source.title);
  try {
    const url = new URL(source.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return title + " (" + escapeMarkdown(source.url) + ")";
    const destination = url.href.replace(/[()<>\s]/g, (character) => "%" + character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
    return "[" + title + "](" + destination + ")";
  } catch {
    return title + " (" + escapeMarkdown(source.url) + ")";
  }
}

/**
 * Renders a paste-ready Markdown report with a stable table and evidence links.
 * Findings use the same deterministic location/rule ordering as the machine-readable reporters.
 * All finding-controlled text is escaped, and only HTTP(S) evidence URLs become links.
 */
export function renderMarkdown(result: ScanResult): string {
  const findings = [...result.findings].sort(findingOrder);
  const lines = [
    "# Evergreen scan report",
    "",
    "- **Repository:** " + escapeMarkdown(result.root),
    "- **Scanned:** " + escapeMarkdown(result.scannedAt),
    "- **Findings:** " + findings.length,
    ...(result.data ? ["- " + escapeMarkdown(describeData(result.data))] : []),
    "",
    "## Findings",
    "",
    "| Severity | Finding | Location | Summary | Replacement | Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...(findings.length === 0
      ? ["| — | No findings | — | No lifecycle risks found. | — | — |"]
      : findings.map((finding) => {
          const location = finding.location.line
            ? finding.location.path + ":" + finding.location.line
            : finding.location.path;
          const evidence = finding.sources.length > 0
            ? finding.sources.map(markdownSource).join("<br>")
            : "—";
          return "| " + escapeMarkdown(finding.severity) + " | " + escapeMarkdown(finding.title) + " | " +
            escapeMarkdown(location) + " | " + escapeMarkdown(finding.summary) + " | " +
            escapeMarkdown(finding.replacement ?? "—") + " | " + evidence + " |";
        })),
  ];
  if (result.diagnostics.length > 0) {
    lines.push("", "## Notes", "", ...result.diagnostics.map((diagnostic) => "- " + escapeMarkdown(diagnostic)));
  }
  return lines.join("\n");
}

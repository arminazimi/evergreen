import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { severityValues } from "./domain.js";
import type { ScanResult } from "./domain.js";
import { renderCompact } from "./reporters.js";

export const STATUS_FILE_NAME = "EVERGREEN_STATUS.md";

/**
 * Renders the repository's lifecycle state as a short Markdown file an agent can read before it plans a change. The
 * text depends only on the findings, the baseline's accepted count, and the data version, so it is the same on every
 * run of an unchanged repository: it has no root path, timestamp, or data age, and it lists at most the findings
 * `--format compact` lists.
 */
export function renderStatusFile(result: ScanResult): string {
  const bySeverity = [...severityValues].reverse().map((severity) => `${severity} ${result.findings.filter((finding) => finding.severity === severity).length}`);
  const unclassified = result.unclassified?.count ?? 0;
  const lines = [
    "# Evergreen lifecycle status",
    "",
    `<!-- Written by \`evergreen scan --write-status\`. Do not edit; run it again to refresh. -->`,
    "",
    `- Findings: ${result.findings.length} (${bySeverity.join(", ")})`,
    result.suppressions ? `- Accepted by baseline: ${result.suppressions.suppressed}` : "- Accepted by baseline: none (no baseline was used)",
    ...(unclassified > 0 ? [`- Unclassified pinned references: ${unclassified}`] : []),
    ...(result.data ? [`- Lifecycle data: ${result.data.version}, evidence reviewed through ${result.data.reviewedThrough}`] : []),
    "",
    "## Findings",
    "",
    "```text",
    renderCompact(result),
    "```",
    "",
    "Details for one finding: `npx evergreen-deprecation explain <finding-id>`. Migration steps: `npx evergreen-deprecation context <finding-id>`. This file is a snapshot, not a substitute for scanning after you edit.",
    "",
  ];
  return lines.join("\n");
}

/** Writes {@link STATUS_FILE_NAME} at the root of the scanned repository and returns its path. */
export async function writeStatusFile(root: string, result: ScanResult): Promise<string> {
  const path = join(root, STATUS_FILE_NAME);
  await writeFile(path, renderStatusFile(result), "utf8");
  return path;
}

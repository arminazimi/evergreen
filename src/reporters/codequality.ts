import { createHash } from "node:crypto";

import type { ScanResult, Severity } from "../domain.js";
import { REPORTER_API_VERSION, findingOrder, type Reporter } from "./shared.js";

const CODE_QUALITY_SEVERITY: Record<Severity, "blocker" | "critical" | "major" | "minor" | "info"> = {
  critical: "blocker",
  high: "critical",
  medium: "major",
  low: "minor",
  info: "info",
};

/**
 * Renders a scan as a GitLab Code Quality report (the CodeClimate-style JSON array GitLab shows in merge requests).
 * Findings use the same order as SARIF. The fingerprint is a hash of the finding ID, so GitLab can match the same
 * finding across pipelines. A finding without a line is reported at line 1, which GitLab requires. Like SARIF, the
 * output has no root path or timestamp, so it is deterministic.
 */
export function renderCodeQuality(result: ScanResult): string {
  const issues = [...result.findings].sort(findingOrder).map((finding) => ({
    description: finding.summary,
    check_name: finding.ruleId,
    fingerprint: createHash("sha256").update(finding.id).digest("hex"),
    severity: CODE_QUALITY_SEVERITY[finding.severity],
    location: { path: finding.location.path, lines: { begin: finding.location.line ?? 1 } },
  }));
  return JSON.stringify(issues, null, 2);
}

/** `--format codequality`: GitLab Code Quality / CodeClimate JSON. */
export const codeQualityReporter: Reporter = {
  apiVersion: REPORTER_API_VERSION,
  id: "codequality",
  render: renderCodeQuality,
};

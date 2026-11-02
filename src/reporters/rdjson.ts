import type { ScanResult, Severity } from "../domain.js";
import { findingOrder } from "./shared.js";

const RDJSON_SEVERITY: Record<Severity, "ERROR" | "WARNING" | "INFO"> = {
  critical: "ERROR",
  high: "ERROR",
  medium: "WARNING",
  low: "INFO",
  info: "INFO",
};

/**
 * Renders a scan as one reviewdog Diagnostic Format (rdjson) result, the input `reviewdog -f=rdjson` reads. Findings use
 * the same order as SARIF. Lines and columns are written only when the finding has them, and only Evergreen's own rule
 * text and locations are included. Like SARIF, the output has no root path or timestamp, so it is deterministic.
 */
export function renderRdjson(result: ScanResult): string {
  const diagnostics = [...result.findings].sort(findingOrder).map((finding) => {
    const { line, column } = finding.location;
    return {
      message: finding.summary,
      location: {
        path: finding.location.path,
        ...(line ? { range: { start: { line, ...(column ? { column } : {}) } } } : {}),
      },
      severity: RDJSON_SEVERITY[finding.severity],
      code: {
        value: finding.ruleId,
        ...(finding.sources[0] ? { url: finding.sources[0].url } : {}),
      },
    };
  });
  const rdjson = {
    source: { name: "Evergreen", url: "https://github.com/arminazimi/evergreen" },
    diagnostics,
  };
  return JSON.stringify(rdjson, null, 2);
}

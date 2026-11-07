import type { ScanResult } from "../domain.js";
import { severityValues } from "../domain.js";
import { sortedFindings } from "./chat.js";
import { REPORTER_API_VERSION, type Reporter } from "./shared.js";

/** The schema tag of the generic webhook payload. Consumers can check it before reading the rest. */
export const WEBHOOK_SCHEMA_VERSION = "evergreen.webhook.v1";

/**
 * Renders a scan as a generic webhook payload for any system that accepts JSON: the schema tag, the scan time, a count
 * per severity (zeros included, so the shape never changes), and every finding with its rule, location, replacement,
 * deadline, and evidence. Findings are ordered like the other machine-readable reporters, so the same scan always renders the same bytes.
 */
export function renderWebhook(result: ScanResult): string {
  const findings = sortedFindings(result);
  const payload = {
    schemaVersion: WEBHOOK_SCHEMA_VERSION,
    source: "evergreen",
    scannedAt: result.scannedAt,
    summary: {
      findings: findings.length,
      bySeverity: Object.fromEntries(
        severityValues.map((severity) => [
          severity,
          findings.filter((finding) => finding.severity === severity).length,
        ]),
      ),
    },
    findings: findings.map((finding) => ({
      id: finding.id,
      ruleId: finding.ruleId,
      severity: finding.severity,
      title: finding.title,
      summary: finding.summary,
      location: finding.location,
      ...(finding.replacement ? { replacement: finding.replacement } : {}),
      ...(finding.deadline ? { deadline: finding.deadline } : {}),
      sources: finding.sources,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

/** `--format webhook`: generic JSON payload for any HTTP webhook consumer. */
export const webhookReporter: Reporter = {
  apiVersion: REPORTER_API_VERSION,
  id: "webhook",
  render: renderWebhook,
};

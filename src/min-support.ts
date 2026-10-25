import type { ScanResult, Severity } from "./domain.js";
import { severityValues } from "./domain.js";

/** The severity a line ending inside the window is raised to: a warning, below the default `--fail-on high` gate. */
const WARNING_SEVERITY: Severity = "medium";

const DAY_MS = 86_400_000;

/** The ISO day `days` after `day`, in UTC. */
function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Warns before a line expires: each finding whose deadline falls from `today` through `today + days` is raised
 * to warning severity unless it is already at least that severe. Finding identity never changes, so baselines
 * still match. The scan itself stays clock-free; the caller passes the day.
 */
export function applyMinSupport(result: ScanResult, days: number, today: string): ScanResult {
  const limit = addDays(today, days);
  const floor = severityValues.indexOf(WARNING_SEVERITY);
  return {
    ...result,
    findings: result.findings.map((finding) =>
      finding.deadline !== undefined && finding.deadline >= today && finding.deadline <= limit && severityValues.indexOf(finding.severity) < floor
        ? { ...finding, severity: WARNING_SEVERITY, summary: `Support ends ${finding.deadline}, within ${days} days. ${finding.summary}` }
        : finding
    ),
  };
}

/** Parses a `--min-support-days` value: a whole number of days from 0 to 3650. */
export function parseMinSupportDays(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const days = Number(value);
  return days <= 3650 ? days : undefined;
}

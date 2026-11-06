import { severityValues } from "../domain.js";
import type { Finding } from "../domain.js";

/** The most severe of the remaining findings, so a later step can branch without reading the report. */
export function highestSeverity(findings: readonly Finding[]): string {
  let highest: Finding["severity"] | undefined;
  for (const finding of findings) {
    if (highest === undefined || severityValues.indexOf(finding.severity) > severityValues.indexOf(highest))
      highest = finding.severity;
  }
  return highest ?? "";
}

/** The earliest deadline among the remaining findings, as YYYY-MM-DD; empty when none carries a date. */
export function nextEndOfLife(findings: readonly Finding[]): string {
  let next: string | undefined;
  for (const finding of findings) {
    const deadline = finding.deadline;
    if (deadline === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) continue;
    if (next === undefined || deadline < next) next = deadline;
  }
  return next ?? "";
}

/**
 * The remaining findings as one compact JSON line for later steps: the fields a workflow branches on,
 * in the order the report lists them, and no summary or evidence to keep the value small.
 */
export function renderFindingsJson(findings: readonly Finding[]): string {
  return JSON.stringify(
    findings.map((finding) => ({
      id: finding.id,
      ruleId: finding.ruleId,
      severity: finding.severity,
      title: finding.title,
      path: finding.location.path,
      ...(finding.location.line === undefined ? {} : { line: finding.location.line }),
      ...(finding.deadline === undefined ? {} : { deadline: finding.deadline }),
    })),
  );
}

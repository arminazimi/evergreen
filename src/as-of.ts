import { bundledRules } from "./check-dependency.js";
import type { ScanResult } from "./domain.js";
import type { RegistryV2Rule } from "./registry.js";

/** The severity a scheduled end of life returns to once its date has come (decision 0010). */
const REACHED_SEVERITY = "high" as const;

/**
 * Projects a scan onto a future day: each announced end of life whose deadline is on or before `asOf` is
 * reported as the ended line it will be, at end-of-life severity. Finding identity never changes, so
 * baselines still match. The scan itself stays clock-free; this is an explicit, deterministic step.
 */
export async function applyAsOf(
  result: ScanResult,
  asOf: string,
  rules: readonly RegistryV2Rule[] | Promise<readonly RegistryV2Rule[]> = bundledRules(),
): Promise<ScanResult> {
  const reached = new Set(
    (await rules)
      .filter((rule) => rule.event === "scheduled-end-of-life" && rule.deadline !== undefined && rule.deadline <= asOf)
      .map((rule) => rule.id),
  );
  return {
    ...result,
    asOf,
    findings: result.findings.map((finding) =>
      reached.has(finding.ruleId)
        ? { ...finding, severity: REACHED_SEVERITY, summary: `As of ${asOf}, this has ended (deadline ${finding.deadline}). ${finding.summary}` }
        : finding
    ),
  };
}

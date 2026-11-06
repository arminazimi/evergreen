import type { Finding, ScanResult, Severity, SourceUsage, SourceUsageContract, UsageMatcher } from "../../../domain.js";
import { required } from "../../../required.js";
import { analyzeSourceUsage } from "../../../source-usage.js";

/** A rule, one usage it covers, and the finding a refusal is reported against. */
export interface UsageTarget<Rule> {
  rule: Rule;
  usage: SourceUsage;
  finding: Finding;
}

/** A finding for a symbol-only rule the scan did not report, named after the usage it covers. */
export function syntheticFinding(
  rule: { id: string; title: string; severity: Severity },
  usage: SourceUsage,
  columnInId = false,
): Finding {
  const line = usage.location.line ?? 1;
  const column = columnInId ? `:${usage.location.column ?? 1}` : "";
  return {
    id: `${rule.id}:${usage.location.path}:${line}${column}`,
    ruleId: rule.id,
    detector: "codemod",
    title: rule.title,
    summary: "",
    severity: rule.severity,
    confidence: "exact",
    location: usage.location,
    sources: [],
  };
}

/** What one analysis pass found: the rule targets and every contract the pass read. */
export interface TargetAnalysis<Rule> {
  targets: UsageTarget<Rule>[];
  contracts: ReadonlyMap<string, SourceUsage[]>;
}

export interface TargetOptions<Rule> {
  /** The matchers that find a rule's usages when the scan reported no finding for it. */
  matchers: (rule: Rule) => UsageMatcher[];
  /** The finding a refusal is reported against when the scan reported none. */
  finding: (rule: Rule, usage: SourceUsage) => Finding;
  /** The analysis contract that holds a rule's usages. Defaults to the rule id. */
  contractId?: (rule: Rule) => string;
  /** Contracts to analyze beside the rules, such as an import matcher per module. */
  extraContracts?: readonly SourceUsageContract[];
}

/**
 * Pairs each rule with the findings the scan reported, and for a rule it did not report falls back to the same
 * parser-backed usage analysis the detectors use. A rule is analyzed only when it has no reported finding, so a
 * scan that already answered it is not repeated.
 */
export async function analyzeTargets<Rule extends { id: string }>(
  result: ScanResult,
  rules: readonly Rule[],
  options: TargetOptions<Rule>,
): Promise<TargetAnalysis<Rule>> {
  const contractId = options.contractId ?? ((rule: Rule) => rule.id);
  const reported = new Map(
    rules.map((rule) => [rule.id, result.findings.filter((finding) => finding.ruleId === rule.id)]),
  );
  const missing = rules.filter((rule) => required(reported.get(rule.id), "reported findings").length === 0);
  const contracts: SourceUsageContract[] = [
    ...missing.map((rule) => ({ id: contractId(rule), matchers: options.matchers(rule) })),
    ...(options.extraContracts ?? []),
  ];
  const analyses = contracts.length === 0 ? [] : await analyzeSourceUsage(result.root, contracts);
  const byContract = new Map(analyses.map((analysis) => [analysis.contractId, analysis.usages]));

  const targets: UsageTarget<Rule>[] = [];
  for (const rule of rules) {
    const findings = required(reported.get(rule.id), "reported findings");
    if (findings.length > 0) {
      for (const finding of findings) {
        for (const usage of finding.usages ?? []) targets.push({ rule, usage, finding });
      }
      continue;
    }
    for (const usage of byContract.get(contractId(rule)) ?? []) {
      targets.push({ rule, usage, finding: options.finding(rule, usage) });
    }
  }
  return { targets, contracts: byContract };
}

import { loadDataFile } from "@velella/ebb/data-source";
import type { RegistryV2Rule } from "@velella/ebb/registry";
import { validateRegistryV2 } from "@velella/ebb/registry";
import { analyzeSourceUsage } from "../source-usage.js";
import type { SourceUsageAnalysis } from "../domain.js";
import { versContains } from "@velella/ebb/vers/index";
import type { UpgradeAnalyzer, UpgradeIssue, UpgradeTarget } from "./types.js";

const ID = "node-apis";
const NODE_PURL = "pkg:generic/nodejs";
const SYMBOL_PREFIX = "nodejs.symbol.";

/** A removed API is a blocker; a deprecated one is a warning. Other events are not judged here. */
function levelFor(rule: RegistryV2Rule): UpgradeIssue["level"] | undefined {
  if (rule.event === "removed") return "blocker";
  if (rule.event === "deprecated") return "warning";
  return undefined;
}

/** True when the target release is inside the rule's range. A release the scheme cannot read matches nothing. */
function appliesToTarget(rule: RegistryV2Rule, target: UpgradeTarget): boolean {
  try {
    return versContains(rule.vers, target.version);
  } catch {
    return false;
  }
}

/** The Node.js core-API symbol rules, read from the registry data only. */
async function symbolRules(): Promise<RegistryV2Rule[]> {
  const registry = validateRegistryV2(await loadDataFile("registry/nodejs.json"));
  return registry.rules.filter(
    (rule) => rule.purl === NODE_PURL && rule.id.startsWith(SYMBOL_PREFIX) && (rule.usage ?? []).length > 0,
  );
}

async function analyzeSymbols(root: string, rules: readonly RegistryV2Rule[]): Promise<SourceUsageAnalysis[]> {
  if (rules.length === 0) return [];
  const matchers = rules.flatMap((rule) => (rule.usage === undefined ? [] : [{ id: rule.id, matchers: rule.usage }]));
  return analyzeSourceUsage(root, matchers);
}

/**
 * The Node.js core APIs the source uses that the target release removed or deprecated, taken from the
 * symbol rules in `registry/nodejs.json`. Levels come from each rule's `event` and `vers` data fields;
 * summaries and titles are never parsed for versions. Reads source files and bundled rules only.
 */
export const nodeApisAnalyzer: UpgradeAnalyzer = {
  id: ID,
  runtimes: ["nodejs"],
  async applies(root) {
    const analyses = await analyzeSymbols(root, await symbolRules());
    return analyses.some((analysis) => analysis.usages.length > 0);
  },
  async analyze(root, target) {
    const matching = (await symbolRules()).filter(
      (rule) => levelFor(rule) !== undefined && appliesToTarget(rule, target),
    );
    if (matching.length === 0) return [];

    const analyses = await analyzeSymbols(root, matching);
    const byRule = new Map(matching.map((rule) => [rule.id, rule]));
    const issues: UpgradeIssue[] = [];
    for (const analysis of analyses) {
      const rule = byRule.get(analysis.contractId);
      if (rule === undefined) continue;
      const level: UpgradeIssue["level"] = rule.event === "removed" ? "blocker" : "warning";
      for (const usage of analysis.usages) {
        issues.push({
          analyzer: ID,
          level,
          subject: usage.symbol,
          path: usage.location.path,
          ...(usage.location.line === undefined ? {} : { line: usage.location.line }),
          reason: rule.summary,
          evidence: { kind: "rule", value: rule.id },
        });
      }
    }
    return issues;
  },
};

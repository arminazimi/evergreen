import { loadDataFile } from "@velella/ebb/data-source";
import type { RegistryV2Rule } from "@velella/ebb/registry";
import { validateRegistryV2 } from "@velella/ebb/registry";
import { hasSourceFiles } from "../source-files.js";
import { analyzeSourceUsage } from "../source-usage.js";
import { versContains } from "@velella/ebb/vers/index";
import type { UpgradeAnalyzer, UpgradeIssue, UpgradeTarget } from "./types.js";

const ID = "python-stdlib";
const PYTHON_PURL = "pkg:generic/python";

/** A removed standard-library API is a blocker; a deprecated one is a warning. Other events are not judged here. */
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

/**
 * The standard-library modules and functions the code uses that the target Python release removed or deprecated,
 * taken from the Python registry's module-import and symbol rules. Reads source files and bundled rules only.
 */
export const pythonStdlibAnalyzer: UpgradeAnalyzer = {
  id: ID,
  runtimes: ["python"],
  async applies(root) {
    return hasSourceFiles(root, "python");
  },
  async analyze(root, target) {
    const registry = validateRegistryV2(await loadDataFile("registry/python.json"));
    const matching = registry.rules.filter(
      (rule) =>
        rule.purl === PYTHON_PURL &&
        (rule.usage ?? []).some((matcher) => matcher.language === "python") &&
        levelFor(rule) !== undefined &&
        appliesToTarget(rule, target),
    );
    if (matching.length === 0) return [];

    const analyses = await analyzeSourceUsage(
      root,
      matching.flatMap((rule) => (rule.usage === undefined ? [] : [{ id: rule.id, matchers: rule.usage }])),
    );
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

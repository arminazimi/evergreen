import { loadDataFile } from "@velella/ebb/data-source";
import { loadRegistryRules, validateRegistryV2 } from "@velella/ebb/registry";
import { isDeprecationRule, isUsageMatcher } from "../../sdk.js";

import { asRecord } from "./shared.js";
import type { PythonRule } from "./types.js";

function isPythonRule(value: unknown): value is PythonRule {
  if (!isDeprecationRule(value)) return false;
  const candidate = value as Partial<PythonRule>;
  return (
    (candidate.kind === "runtime" && typeof candidate.maximumVersion === "string") ||
    (candidate.kind === "package" &&
      typeof candidate.package === "string" &&
      (candidate.usage === undefined || candidate.usage.every(isUsageMatcher)))
  );
}

/**
 * Rules the detector reads: runtime pins and declared packages. Symbol and module-import rules are read by
 * parser-backed usage analysis and the upgrade check, and carry no detector hints.
 */
function detectorRules(document: unknown): unknown {
  if (typeof document !== "object" || document === null || !("rules" in document) || !Array.isArray(document.rules)) {
    return document;
  }
  return {
    ...document,
    rules: document.rules.filter((rule) => {
      const hints = asRecord(asRecord(rule)?.["x-python"]);
      return hints?.kind === "runtime" || hints?.kind === "package";
    }),
  };
}

export async function loadRules(): Promise<readonly PythonRule[]> {
  const document = await loadDataFile("registry/python.json");
  // The detector view drops `vers`, which version-bounded package rules are matched on, so it is read from the v2 rule.
  const versions = new Map(validateRegistryV2(document).rules.map((rule) => [rule.id, rule.vers]));
  return loadRegistryRules(detectorRules(document), {
    schemaVersion: "evergreen.python-registry.v1",
    isRule: isPythonRule,
  }).rules.map((rule) => (rule.kind === "package" ? { ...rule, vers: versions.get(rule.id) } : rule));
}

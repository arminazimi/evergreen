import type { MigrationImpact, SourceUsage } from "../domain.js";

export function impactFor(usages: readonly SourceUsage[]): MigrationImpact {
  const usageCount = usages.length;
  return {
    usageCount,
    affectedFiles: new Set(usages.map((usage) => usage.location.path)).size,
    level: usageCount === 0 ? "none" : usageCount <= 3 ? "low" : usageCount <= 10 ? "medium" : "high",
  };
}

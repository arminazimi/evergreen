import { getActiveData } from "./data-source.js";
import { validateRegistryV2 } from "./registry.js";

const OSV_REGISTRY_PATH = "registry/osv.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads unfixed OSV advisory ids keyed by lifecycle rule id from the active data bundle. */
export async function advisoryIdsByRuleId(): Promise<Map<string, string[]>> {
  const active = await getActiveData();
  let document: unknown;
  try {
    document = await active.read(OSV_REGISTRY_PATH);
  } catch {
    return new Map();
  }
  if (!isRecord(document)) return new Map();
  let registry;
  try {
    registry = validateRegistryV2(document);
  } catch {
    return new Map();
  }
  const map = new Map<string, string[]>();
  for (const rule of registry.rules) {
    const extension = (rule as unknown as Record<string, unknown>)["x-osv"];
    if (!isRecord(extension)) continue;
    const lifecycleRuleId = typeof extension.ruleId === "string" ? extension.ruleId : rule.id;
    const ids = Array.isArray(extension.ids) ? extension.ids : [];
    const cleaned = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0))].sort((left, right) =>
      left.localeCompare(right),
    );
    if (cleaned.length > 0) map.set(lifecycleRuleId, cleaned);
  }
  return map;
}

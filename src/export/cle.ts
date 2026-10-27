import { BUNDLED_ECOSYSTEMS } from "../data-bundle.js";
import { getActiveData } from "../data-source.js";
import type { ActiveData } from "../data-source.js";
import { validateRegistryV2 } from "../registry.js";
import type { RegistryV2Rule } from "../registry.js";

export const CLE_SCHEMA = "https://tc54.org/schemas/cle/cle-1.0.0.schema.json";

export interface CleEvent {
  id: number;
  type: "endOfSupport" | "endOfLife";
  effective: string;
  published: string;
  versions: Array<{ range: string }>;
  supportId?: string;
}

export interface CleDocument {
  $schema: string;
  identifier: string;
  updatedAt: string;
  events: CleEvent[];
  definitions?: { support: Array<{ id: string; description: string }> };
}

/**
 * A deterministic CLE snapshot per component, rather than aliases for unrelated PURLs.
 * Only dated, component-level support/life events have a faithful CLE equivalent:
 * deprecation does not establish cessation of development, and removal (often of an API)
 * does not establish cessation of distribution. Do not invent those lifecycle claims.
 * `published` records Evergreen's first observation; `updatedAt` its latest review.
 * IDs are snapshot-local, not an append-only publisher's event history.
 */
export function exportCle(rules: readonly RegistryV2Rule[]): { documents: CleDocument[]; skipped: number } {
  const groups = new Map<string, RegistryV2Rule[]>();
  let skipped = 0;
  for (const rule of rules) {
    if (!rule.deadline || rule.usage?.some((usage) => usage.kind === "symbol") ||
      (rule.event !== "end-of-support" && rule.event !== "end-of-life" && rule.event !== "scheduled-end-of-life")) {
      skipped++;
      continue;
    }
    const group = groups.get(rule.purl) ?? [];
    group.push(rule);
    groups.set(rule.purl, group);
  }
  const documents = [...groups.keys()].sort().map((identifier): CleDocument => {
    const group = groups.get(identifier)!;
    group.sort((a, b) => a.provenance.observedAt < b.provenance.observedAt ? -1 :
      a.provenance.observedAt > b.provenance.observedAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const events = group.map((rule, index): CleEvent => ({
      id: index + 1,
      type: rule.event === "end-of-support" ? "endOfSupport" : "endOfLife",
      effective: `${rule.deadline}T00:00:00Z`,
      published: `${rule.provenance.observedAt}T00:00:00Z`,
      versions: [{ range: rule.vers }],
      ...(rule.event === "end-of-support" ? { supportId: "evergreen" } : {}),
    })).reverse();
    return {
      $schema: CLE_SCHEMA,
      identifier,
      updatedAt: `${group.map((rule) => rule.provenance.reviewedAt).sort().at(-1)}T00:00:00Z`,
      events,
      ...(events.some((event) => event.supportId) ? {
        definitions: { support: [{ id: "evergreen", description: "Support covered by the Evergreen end-of-support rules for this component." }] },
      } : {}),
    };
  });
  return { documents, skipped };
}

/** Reads every registry from the same offline, optionally pinned data source as scans. */
export async function exportActiveCle(data?: ActiveData): Promise<ReturnType<typeof exportCle>> {
  const active = data ?? await getActiveData();
  const registries = await Promise.all(BUNDLED_ECOSYSTEMS.map(async (ecosystem) =>
    validateRegistryV2(await active.read(`registry/${ecosystem}.json`))));
  return exportCle(registries.flatMap((registry) => registry.rules));
}

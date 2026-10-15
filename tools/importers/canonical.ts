import type { RegistryV2Rule } from "../../src/registry.js";

const FIELD_ORDER = [
  "id", "ecosystem", "purl", "vers", "event", "title", "summary", "severity", "replacement",
  "deadline", "sources", "provenance", "migration", "usage",
];

/** A rule with its fields in the order registry files use, so drafts and registry rules diff cleanly. */
export function canonicalRule<Rule extends object>(rule: Rule): Rule {
  const entries = Object.entries(rule).filter(([, value]) => value !== undefined);
  const rank = (key: string) => {
    const index = FIELD_ORDER.indexOf(key);
    return index === -1 ? FIELD_ORDER.length : index;
  };
  entries.sort(([left], [right]) => rank(left) - rank(right) || left.localeCompare(right));
  return Object.fromEntries(entries) as Rule;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type { RegistryV2Rule };

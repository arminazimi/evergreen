import type { EvidenceSource, MigrationGuidance, Severity } from "./domain.js";
import type { LifecycleEvent, RegistryV2Rule } from "./registry.js";

export const RULE_SCHEMA_VERSION = "evergreen.rule.v1" as const;
export const RULE_URI_PREFIX = "evergreen://rules/";

/** A lifecycle rule as an agent reads it: the claim, who it applies to, the evidence, and the way out. */
export interface RuleDocument {
  schemaVersion: typeof RULE_SCHEMA_VERSION;
  id: string;
  ecosystem: string;
  /** Version-less Package URL of the affected component. */
  purl: string;
  /** VERS range of the affected versions. */
  affectedVersions: string;
  event: LifecycleEvent;
  severity: Severity;
  title: string;
  summary: string;
  replacement?: string;
  deadline?: string;
  sources: EvidenceSource[];
  /** When the claim was last seen at its source and last reviewed, and by whom. */
  provenance: { observedAt: string; reviewedAt: string; reviewer: string };
  migration?: MigrationGuidance;
}

export const ruleUri = (id: string): string => `${RULE_URI_PREFIX}${id}`;

export function toRuleDocument(rule: RegistryV2Rule): RuleDocument {
  return {
    schemaVersion: RULE_SCHEMA_VERSION,
    id: rule.id,
    ecosystem: rule.ecosystem,
    purl: rule.purl,
    affectedVersions: rule.vers,
    event: rule.event,
    severity: rule.severity,
    title: rule.title,
    summary: rule.summary,
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    sources: rule.sources,
    provenance: {
      observedAt: rule.provenance.observedAt,
      reviewedAt: rule.provenance.reviewedAt,
      reviewer: rule.provenance.reviewer,
    },
    ...(rule.migration ? { migration: rule.migration } : {}),
  };
}

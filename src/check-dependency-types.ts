import type { DataInfo, EvidenceSource, MigrationGuidance, Severity } from "./domain.js";
import type { LifecycleEvent } from "./registry.js";

/** Identifies the schema a dependency check result conforms to. */
export const CHECK_SCHEMA_VERSION = "evergreen.check.v1" as const;

/** How a package or version relates to the lifecycle rules Evergreen holds for it. */
export type CheckStatus =
  /** A rule says this package (and version, when given) has a lifecycle problem. */
  | "affected"
  /** Rules exist for the package, but they apply to versions the caller has not named. */
  | "version-dependent"
  /** Rules exist for the package, and none of them covers the named version. */
  | "not-affected"
  /** Evergreen has no rule for this package. That is not a statement that it is safe. */
  | "no-data";

/** One lifecycle rule that applies to the checked package, flattened for the check result. */
export interface DependencyFinding {
  ruleId: string;
  ecosystem: string;
  event: LifecycleEvent;
  severity: Severity;
  title: string;
  summary: string;
  replacement?: string;
  deadline?: string;
  /** The VERS range the rule applies to. */
  affectedVersions: string;
  sources: EvidenceSource[];
  migration?: MigrationGuidance;
}

/** The answer returned for one package and optional version, with the rules that produced it. */
export interface DependencyCheck {
  schemaVersion: typeof CHECK_SCHEMA_VERSION;
  /** Version-less canonical PURL, the identity rules are written against. */
  purl: string;
  version?: string;
  status: CheckStatus;
  findings: DependencyFinding[];
  /** Highest severity among the findings, when there are any. */
  severity?: Severity;
  /** One sentence a person or an agent can show as is. */
  message: string;
  /** The lifecycle data the answer comes from, and how fresh it is. */
  data?: DataInfo;
}

// Types shared by the Renovate comparison: the raw record one repository produces, and the aggregated result.
// The comparison itself (what counts as agreement) lives in benchmarks/differential/renovate.ts and is reused as is.

import type { Comparison, EvergreenFinding, Family, RenovateDependency } from "../../differential/renovate.js";

export const RAW_SCHEMA_VERSION = "evergreen.comparison.renovate.raw.v1" as const;
export const RESULT_SCHEMA_VERSION = "evergreen.comparison.renovate.v1" as const;

export type Selection = "blind" | "targeted";
export type RenovateStatus = "ok" | "failed" | "timeout";

/** What one run recorded for one pinned repository. Written by collect.ts; never edited by hand. */
export interface RawRecord {
  schemaVersion: typeof RAW_SCHEMA_VERSION;
  repository: string;
  commit: string;
  ecosystem: string;
  selection: Selection;
  /** True for a repository that already has a committed differential report (docs/COMPARISON_METHOD.md, section 4). */
  continuity: boolean;
  /** Repositories processed at the same time while this one was timed. */
  concurrency: number;
  evergreen: { version: string; commit: string; durationMs: number; findings: EvergreenFinding[] };
  renovate: {
    version: string;
    durationMs: number;
    status: RenovateStatus;
    /** Exit code or signal text when the run did not finish cleanly. */
    detail?: string;
    /** Dependencies Renovate listed in the three comparable families only. */
    dependencies: RenovateDependency[];
  };
}

export interface OutcomeCounts {
  agree: number;
  "evergreen-only": number;
  "renovate-only": number;
  inconclusive: number;
}

export interface TimingSummary {
  totalMs: number;
  medianMs: number;
  maxMs: number;
}

export interface GroupResult {
  selection: Selection;
  repositories: number;
  /** Repositories whose Renovate run did not finish; they contribute no comparison. */
  renovateUnfinished: string[];
  evergreenFindings: number;
  /** Findings whose rule family Renovate has no model for. */
  notComparableFindings: number;
  outcomes: OutcomeCounts;
  byFamily: Record<Family, OutcomeCounts>;
  evergreenTime: TimingSummary;
  renovateTime: TimingSummary;
}

export interface DisagreementRow
  extends Pick<Comparison, "family" | "path" | "name" | "evergreen" | "renovate" | "outcome"> {
  repository: string;
  commit: string;
  selection: Selection;
}

export interface ComparisonResult {
  schemaVersion: typeof RESULT_SCHEMA_VERSION;
  method: "docs/COMPARISON_METHOD.md";
  renovateVersions: string[];
  evergreenVersions: string[];
  evergreenCommits: string[];
  concurrency: number[];
  groups: GroupResult[];
  continuity: string[];
  notComparableRules: Array<{ family: string; findings: number }>;
  disagreements: DisagreementRow[];
}

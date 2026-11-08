import type {
  DataInfo,
  EvidenceSource,
  MigrationGuidance,
  ReplacementRequirements,
  Severity,
  SourceLanguage,
  UsageMatcher,
} from "@velella/ebb/domain";

export { severityValues, sourceLanguageValues } from "@velella/ebb/domain";
export type {
  CallUsageMatcher,
  ConfigUsageMatcher,
  DataInfo,
  EvidenceSource,
  ImportUsageMatcher,
  MigrationGuidance,
  MigrationGuidanceStep,
  ReplacementRequirements,
  Severity,
  SourceLanguage,
  SymbolUsageMatcher,
  UsageMatcher,
  VerificationCommand,
} from "@velella/ebb/domain";

/**
 * How the version behind a finding was read: `exact` from a pinned declaration, `range` from a compatibility
 * range that merely allows it, `inferred-from-lock` from a lockfile entry.
 */
export const confidenceValues = ["exact", "range", "inferred-from-lock"] as const;

export type Confidence = (typeof confidenceValues)[number];

/** Where a finding or usage was observed, as a repository-relative path and optional position. */
export interface SourceLocation {
  path: string;
  line?: number;
  column?: number;
}

/** A named set of matchers that together describe how one deprecated API is used. */
export interface SourceUsageContract {
  id: string;
  matchers: UsageMatcher[];
}

/** One place a deprecated API was found, with a short excerpt around it. */
export interface SourceUsage {
  kind: "import" | "call" | "config-key" | "symbol";
  language: SourceLanguage;
  symbol: string;
  location: SourceLocation;
  excerpt: string;
}

/** How far a deprecated API has spread through the repository, counted in usages and files. */
export interface MigrationImpact {
  usageCount: number;
  affectedFiles: number;
  level: "none" | "low" | "medium" | "high";
}

/** The usages and impact found for one contract during a scan. */
export interface SourceUsageAnalysis {
  contractId: string;
  usages: SourceUsage[];
  impact: MigrationImpact;
}

/** A reviewed lifecycle rule: what is deprecated, when, why, and what replaces it. */
export interface DeprecationRule {
  id: string;
  ecosystem: string;
  title: string;
  summary: string;
  severity: Severity;
  replacement?: string;
  requires?: ReplacementRequirements;
  deadline?: string;
  sources: EvidenceSource[];
  migration?: MigrationGuidance;
}

/** One confirmed lifecycle risk in the scanned repository, with its evidence and location. */
export interface Finding {
  id: string;
  ruleId: string;
  detector: string;
  title: string;
  summary: string;
  severity: Severity;
  confidence: Confidence;
  location: SourceLocation;
  /** For a package that is pulled in rather than declared: the shortest chain from a declared dependency to it. */
  dependencyPath?: string[];
  replacement?: string;
  requires?: ReplacementRequirements;
  deadline?: string;
  sources: EvidenceSource[];
  /**
   * OSV advisory identifiers that apply to this finding's package and have no fixed version in OSV.
   * Filled offline from the bundled `registry/osv.json`; omitted when none were imported.
   */
  advisoryIds?: string[];
  usages?: SourceUsage[];
  impact?: MigrationImpact;
  migration?: MigrationGuidance;
}

/** The `--only`/`--exclude` selectors that were applied to a scan. Present only when one was given. */
export interface ScanSelection {
  /** Ecosystem ids or rule-id prefixes the scan kept. */
  only?: string[];
  /** Ecosystem ids or rule-id prefixes the scan dropped. */
  exclude?: string[];
}

/** A dependency declaration a detector could not match to a rule, and why. */
export interface UnclassifiedReference {
  detector: string;
  component: string;
  reference: string;
  reason: string;
  location: SourceLocation;
}

/** The unclassified references from a scan, with how many there were. */
export interface UnclassifiedSummary {
  count: number;
  references: UnclassifiedReference[];
}

/** One baseline suppression that matched a finding in a scan, with the dates that matter. */
export interface SuppressionRef {
  ruleId: string;
  path: string;
  /** The day the suppression ends (YYYY-MM-DD). */
  expires: string;
  owner?: string;
  reason?: string;
  /** Days left, for an expiring suppression. */
  daysLeft?: number;
  /** Days since it expired, for an expired one. */
  daysAgo?: number;
}

/** What a baseline did to this scan. Present only when a baseline was applied. */
export interface SuppressionState {
  /** Findings the baseline hid. */
  suppressed: number;
  /** The day suppression dates were compared with, when one was given. */
  today?: string;
  /** The warning window in days, when a reference day was given. */
  warnWithinDays?: number;
  /** Suppressions in force that end within the window, soonest first. */
  expiring: SuppressionRef[];
  /** Suppressions that have ended and no longer hide their finding, longest ago first. */
  expired: SuppressionRef[];
}

/** Cap on how many directory entries the empty-scan coverage walk opens. */
export const COVERAGE_WALK_LIMIT = 20_000;

/** What a scan checked, so a zero-finding report can say what was covered and what was not. */
export interface ScanCoverage {
  /** Detector ids that matched at least one input file in the repository, sorted. */
  ecosystems: string[];
  /** Repository-relative paths matched by detector inputs, sorted. Complete in JSON; the text report may shorten the list. */
  filesRead: string[];
  /** Paths of unclassified pins or other unsupported declarations, sorted. Complete in JSON; the text report may shorten the list. */
  unsupportedFiles: string[];
  /** True when the coverage walk stopped early at {@link COVERAGE_WALK_LIMIT} (or a lower test limit), so ecosystems may be incomplete. */
  truncated?: boolean;
}

/** The complete result of scanning one repository. */
export interface ScanResult {
  schemaVersion: "evergreen.scan.v1";
  root: string;
  scannedAt: string;
  findings: Finding[];
  unclassified?: UnclassifiedSummary;
  diagnostics: string[];
  /** The `--only`/`--exclude` selectors applied. Present only when one was given. */
  selection?: ScanSelection;
  data?: DataInfo;
  suppressions?: SuppressionState;
  /** The day the scan was projected onto with `--as-of`. Present only when one was given. */
  asOf?: string;
  /** Present when the engine recorded what the scan checked. */
  coverage?: ScanCoverage;
}

/** The most points each input of a risk score can add; they sum to 100. */
export const RISK_SCORE_CAPS = { endOfLife: 50, usage: 25, advisories: 25 } as const;

/** What a risk score was computed from. Every field is data Evergreen already holds. */
export interface RiskInputs {
  /** Whole days between the finding's `deadline` and the day scored; 0 before the deadline or when it has none. */
  daysPastEndOfLife: number;
  /** Source usages reported for the finding; 0 when none were found or usage analysis did not run. */
  usageCount: number;
  /** Imported advisories that apply to the finding; 0 when none were imported. */
  advisories: number;
}

export interface RiskScore {
  /** 0 to 100, higher means fix sooner. */
  score: number;
  inputs: RiskInputs;
  /** The points each input contributed; they add up to `score`. */
  points: { endOfLife: number; usage: number; advisories: number };
}

const DAY_MS = 86_400_000;

/**
 * Scores how urgent a finding is from three inputs: time since its end of life (1 point per 14.6 days, up to
 * 50, reached at two years), source usages (5 points each, up to 25), and imported advisories (5 points each,
 * up to 25). Popularity is never an input. Reads no clock: the caller passes `today` (YYYY-MM-DD), so the same
 * finding scores the same everywhere. Documented in docs/RULES.md.
 */
export function riskScore(
  finding: Pick<Finding, "deadline" | "usages" | "impact">,
  today: string,
  advisories = 0,
): RiskScore {
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(todayMs))
    throw new Error(`"${today}" is not a date (YYYY-MM-DD).`);
  const deadlineMs = finding.deadline === undefined ? Number.NaN : Date.parse(`${finding.deadline}T00:00:00Z`);
  const daysPastEndOfLife = Number.isNaN(deadlineMs) ? 0 : Math.max(0, Math.floor((todayMs - deadlineMs) / DAY_MS));
  const usageCount = finding.impact?.usageCount ?? finding.usages?.length ?? 0;
  const inputs: RiskInputs = { daysPastEndOfLife, usageCount, advisories: Math.max(0, Math.floor(advisories)) };
  const points = {
    endOfLife: Math.min(RISK_SCORE_CAPS.endOfLife, Math.floor((daysPastEndOfLife * RISK_SCORE_CAPS.endOfLife) / 730)),
    usage: Math.min(RISK_SCORE_CAPS.usage, usageCount * 5),
    advisories: Math.min(RISK_SCORE_CAPS.advisories, inputs.advisories * 5),
  };
  return { score: points.endOfLife + points.usage + points.advisories, inputs, points };
}

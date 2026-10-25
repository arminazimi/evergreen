export const severityValues = ["info", "low", "medium", "high", "critical"] as const;

export type Severity = (typeof severityValues)[number];

/**
 * How the version behind a finding was read: `exact` from a pinned declaration, `range` from a compatibility
 * range that merely allows it, `inferred-from-lock` from a lockfile entry.
 */
export const confidenceValues = ["exact", "range", "inferred-from-lock"] as const;

export type Confidence = (typeof confidenceValues)[number];

export interface EvidenceSource {
  title: string;
  url: string;
  accessedAt?: string;
}

export interface SourceLocation {
  path: string;
  line?: number;
  column?: number;
}

export const sourceLanguageValues = [
  "javascript",
  "typescript",
  "python",
  "go",
  "rust",
  "csharp",
  "java",
  "kotlin",
  "ruby",
  "json",
  "yaml",
  "toml",
  "ini",
  "php",
  "swift",
  "dart",
] as const;

export type SourceLanguage = (typeof sourceLanguageValues)[number];

export interface ImportUsageMatcher {
  kind: "import";
  language: "javascript" | "typescript" | "python" | "go" | "java" | "kotlin" | "rust" | "csharp" | "ruby" | "php" | "swift" | "dart";
  module: string;
}

export interface CallUsageMatcher {
  kind: "call";
  language: "javascript" | "typescript" | "python" | "go" | "rust" | "csharp" | "ruby" | "php" | "swift" | "dart";
  module: string;
  targets: string[];
}

export interface ConfigUsageMatcher {
  kind: "config-key";
  language: SourceLanguage;
  key: string;
  valueIncludes?: string;
}

export const symbolShapeValues = ["call", "construct", "reference", "option"] as const;
export type SymbolShape = (typeof symbolShapeValues)[number];

/**
 * A deprecated function, method, class, or option inside a module. Evaluated by parser-backed usage
 * analysis only; the regex scanner ignores it.
 */
export interface SymbolUsageMatcher {
  kind: "symbol";
  language: "javascript" | "typescript" | "python";
  /** Module that exports the symbol. Omit for globals and builtins such as `Buffer` or `open`. */
  module?: string;
  /** Dotted path from the module, for example `parse`, `Buffer.alloc`, or `datetime.utcnow`. */
  symbol: string;
  /** How the symbol is used: called, constructed with `new`, referenced, or passed an option. */
  shape: SymbolShape;
  /** For `option`: the property name the deprecated option uses in the call's options object. */
  option?: string;
  /** For `option`: zero-based position of the options argument. Defaults to the last argument. */
  argument?: number;
  /** What to use instead of this symbol; overrides the rule's `replacement` in reports. */
  replacement?: string;
}

export type UsageMatcher = ImportUsageMatcher | CallUsageMatcher | ConfigUsageMatcher | SymbolUsageMatcher;

export interface SourceUsageContract {
  id: string;
  matchers: UsageMatcher[];
}

export interface SourceUsage {
  kind: "import" | "call" | "config-key" | "symbol";
  language: SourceLanguage;
  symbol: string;
  location: SourceLocation;
  excerpt: string;
}

export interface MigrationImpact {
  usageCount: number;
  affectedFiles: number;
  level: "none" | "low" | "medium" | "high";
}

export interface SourceUsageAnalysis {
  contractId: string;
  usages: SourceUsage[];
  impact: MigrationImpact;
}

export interface MigrationGuidanceStep {
  id: string;
  title: string;
  instructions: string;
  targets: "declaration" | "usages" | "all";
}

export interface VerificationCommand {
  command: string;
  purpose: string;
}

export interface MigrationGuidance {
  constraints: string[];
  steps: MigrationGuidanceStep[];
  verification: VerificationCommand[];
}

/** The lowest runtime versions a rule's replacement works on. */
export interface ReplacementRequirements {
  node?: string;
  python?: string;
}

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

export interface Finding {
  id: string;
  ruleId: string;
  detector: string;
  title: string;
  summary: string;
  severity: Severity;
  confidence: Confidence;
  location: SourceLocation;
  replacement?: string;
  requires?: ReplacementRequirements;
  deadline?: string;
  sources: EvidenceSource[];
  usages?: SourceUsage[];
  impact?: MigrationImpact;
  migration?: MigrationGuidance;
}

export interface UnclassifiedReference {
  detector: string;
  component: string;
  reference: string;
  reason: string;
  location: SourceLocation;
}

export interface UnclassifiedSummary {
  count: number;
  references: UnclassifiedReference[];
}

/** Which lifecycle data a result was produced with, and how fresh its evidence is. */
export interface DataInfo {
  source: "bundled" | "cache" | "pinned";
  version: string;
  /** When a downloaded bundle was built; null for the data shipped with the release. */
  createdAt: string | null;
  /** The most recent review date among the rules in use. */
  reviewedThrough: string;
  /** Days since the bundle was built, or since the evidence was last reviewed for bundled data. */
  ageDays: number;
  /** True when the data is older than 30 days. */
  stale: boolean;
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

export interface ScanResult {
  schemaVersion: "evergreen.scan.v1";
  root: string;
  scannedAt: string;
  findings: Finding[];
  unclassified?: UnclassifiedSummary;
  diagnostics: string[];
  data?: DataInfo;
  suppressions?: SuppressionState;
  /** The day the scan was projected onto with `--as-of`. Present only when one was given. */
  asOf?: string;
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
export function riskScore(finding: Pick<Finding, "deadline" | "usages" | "impact">, today: string, advisories = 0): RiskScore {
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(todayMs)) throw new Error(`"${today}" is not a date (YYYY-MM-DD).`);
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

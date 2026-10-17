export const severityValues = ["info", "low", "medium", "high", "critical"] as const;

export type Severity = (typeof severityValues)[number];

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
  "java",
  "kotlin",
  "json",
  "yaml",
  "toml",
  "ini",
] as const;

export type SourceLanguage = (typeof sourceLanguageValues)[number];

export interface ImportUsageMatcher {
  kind: "import";
  language: "javascript" | "typescript" | "python" | "go" | "java" | "kotlin";
  module: string;
}

export interface CallUsageMatcher {
  kind: "call";
  language: "javascript" | "typescript" | "python" | "go";
  module: string;
  targets: string[];
}

export interface ConfigUsageMatcher {
  kind: "config-key";
  language: SourceLanguage;
  key: string;
  valueIncludes?: string;
}

export type UsageMatcher = ImportUsageMatcher | CallUsageMatcher | ConfigUsageMatcher;

export interface SourceUsageContract {
  id: string;
  matchers: UsageMatcher[];
}

export interface SourceUsage {
  kind: "import" | "call" | "config-key";
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

export interface DeprecationRule {
  id: string;
  ecosystem: string;
  title: string;
  summary: string;
  severity: Severity;
  replacement?: string;
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
  location: SourceLocation;
  replacement?: string;
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
}

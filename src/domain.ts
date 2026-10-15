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
  "json",
  "yaml",
  "toml",
  "ini",
] as const;

export type SourceLanguage = (typeof sourceLanguageValues)[number];

export interface ImportUsageMatcher {
  kind: "import";
  language: "javascript" | "typescript" | "python";
  module: string;
}

export interface CallUsageMatcher {
  kind: "call";
  language: "javascript" | "typescript" | "python";
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

export interface ScanResult {
  schemaVersion: "evergreen.scan.v1";
  root: string;
  scannedAt: string;
  findings: Finding[];
  unclassified?: UnclassifiedSummary;
  diagnostics: string[];
}

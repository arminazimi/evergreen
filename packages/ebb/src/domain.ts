/**
 * The lifecycle data types: severities, evidence sources, usage matchers, migration guidance and data info.
 * Offing re-exports these from its own `domain.ts`.
 */

export const severityValues = ["info", "low", "medium", "high", "critical"] as const;

/** How much attention a finding or rule deserves, from informational to critical. */
export type Severity = (typeof severityValues)[number];

/** An authoritative page a lifecycle claim was read from, with the day it was reviewed. */
export interface EvidenceSource {
  title: string;
  url: string;
  accessedAt?: string;
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

/** A language or data format the source-usage scanner can read. */
export type SourceLanguage = (typeof sourceLanguageValues)[number];

export interface ImportUsageMatcher {
  kind: "import";
  language:
    | "javascript"
    | "typescript"
    | "python"
    | "go"
    | "java"
    | "kotlin"
    | "rust"
    | "csharp"
    | "ruby"
    | "php"
    | "swift"
    | "dart";
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

export const symbolShapeValues = ["call", "construct", "reference", "method", "option"] as const;
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
  /**
   * How the symbol is used: called, constructed with `new`, referenced, called as a method of any receiver
   * inside a `unittest.TestCase` subclass (Python only), or passed an option.
   */
  shape: SymbolShape;
  /** For `option`: the property name the deprecated option uses in the call's options object. */
  option?: string;
  /** For `option`: zero-based position of the options argument. Defaults to the last argument. */
  argument?: number;
  /** What to use instead of this symbol; overrides the rule's `replacement` in reports. */
  replacement?: string;
}

/** One way a deprecated API can appear in source, selected by import, call, config key, or symbol. */
export type UsageMatcher = ImportUsageMatcher | CallUsageMatcher | ConfigUsageMatcher | SymbolUsageMatcher;

/** One ordered action in a migration, and whether it changes the declaration, its usages, or both. */
export interface MigrationGuidanceStep {
  id: string;
  title: string;
  instructions: string;
  targets: "declaration" | "usages" | "all";
}

/** A command a person can run to confirm a migration, with the reason for running it. */
export interface VerificationCommand {
  command: string;
  purpose: string;
}

/** Reviewed constraints, steps, and verification commands for replacing a deprecated API. */
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

/** The parts of a scan finding the lifecycle helpers (forecast, as-of, min-support) read. */
export interface LifecycleFinding {
  id: string;
  ruleId: string;
  detector: string;
  title: string;
  summary: string;
  severity: Severity;
  location: { path: string; line?: number };
  deadline?: string;
  sources: EvidenceSource[];
}

/** The parts of a scan result the lifecycle helpers read. */
export interface LifecycleScan {
  root: string;
  findings: readonly LifecycleFinding[];
}

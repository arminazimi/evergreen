// Types shared by the Dependabot comparison: the record one pinned repository produces, and the
// aggregated result.
//
// Dependabot is not run. docs/COMPARISON_METHOD.md section 7 records that it runs inside GitHub's
// service against a default branch, not against a pinned commit, and this repository has no runner.
// The raw record therefore holds what can be checked offline: the repository's committed Dependabot
// configuration and the update entry the bridge maps each Evergreen finding to.

export const RAW_SCHEMA_VERSION = "evergreen.comparison.dependabot.raw.v1" as const;
export const RESULT_SCHEMA_VERSION = "evergreen.comparison.dependabot.v1" as const;

export type Selection = "blind" | "targeted";

/** The `updates` entry Evergreen's Dependabot bridge maps a finding to. */
export interface DependabotTarget {
  packageEcosystem: string;
  directory: string;
}

/** One finding, with its bridge target or `null` when the bridge has no Dependabot mapping for it. */
export interface RawFinding {
  ruleId: string;
  path: string;
  line?: number;
  dependabot: DependabotTarget | null;
}

/** One `updates` entry as declared in the repository's `dependabot.yml`, at the pinned commit. */
export interface ConfigEntry {
  packageEcosystem: string;
  /** The directory as declared; matching normalizes it. */
  directory: string;
  /** The entry declares an `ignore` list, so a matching finding is not scored as covered. */
  ignore: boolean;
  /** The entry declares an `allow` list, so a matching finding is not scored as covered. */
  allow: boolean;
}

/** What one run recorded for one pinned repository. Written by `collect.ts`; never edited by hand. */
export interface RawRecord {
  schemaVersion: typeof RAW_SCHEMA_VERSION;
  repository: string;
  commit: string;
  ecosystem: string;
  selection: Selection;
  continuity: boolean;
  evergreen: {
    version: string;
    commit: string;
    durationMs: number;
    findings: RawFinding[];
  };
  dependabot: {
    /** Recorded so a reader never assumes Dependabot ran against the pinned commit. */
    run: "not-run";
    /** `.github/dependabot.yml` or `.github/dependabot.yaml` when the repository commits one. */
    configPath?: string;
    entries: ConfigEntry[];
    /** The parser's message when the committed file is not a readable Dependabot configuration. */
    parseError?: string;
  };
}

/** Where one finding stands against the repository's declared Dependabot update surface. */
export type Standing = "covered" | "uncovered" | "filtered" | "not-comparable";

export interface OutcomeCounts {
  covered: number;
  uncovered: number;
  filtered: number;
  "not-comparable": number;
}

/** Counts for findings the bridge maps to a Dependabot package-ecosystem. */
export interface SurfaceCounts {
  covered: number;
  uncovered: number;
  filtered: number;
}

export interface EcosystemResult {
  packageEcosystem: string;
  counts: SurfaceCounts;
}

export interface GroupResult {
  selection: Selection;
  repositories: number;
  repositoriesWithConfig: number;
  repositoriesWithoutConfig: number;
  configEntries: number;
  /** Entries that declare `ignore` or `allow`; their findings are counted as filtered, never covered. */
  filteredConfigEntries: number;
  evergreenFindings: number;
  outcomes: OutcomeCounts;
  /** Uncovered findings split by whether the repository commits a Dependabot configuration at all. */
  uncoveredWithoutConfig: number;
  uncoveredWithConfig: number;
  byEcosystem: EcosystemResult[];
  /** Findings the bridge cannot map, grouped by the first two rule-id segments. */
  notComparableRules: Array<{ family: string; findings: number }>;
}

/** One repository that commits a Dependabot configuration, for the auditable per-repository table. */
export interface ConfiguredRepository {
  repository: string;
  commit: string;
  selection: Selection;
  configPath: string;
  entries: number;
  findings: number;
  covered: number;
  uncovered: number;
  filtered: number;
  notComparable: number;
}

export interface ConfigError {
  repository: string;
  detail: string;
}

export interface ComparisonResult {
  schemaVersion: typeof RESULT_SCHEMA_VERSION;
  method: "docs/COMPARISON_METHOD.md";
  dependabot: { run: "not-run"; reason: string };
  evergreenVersions: string[];
  evergreenCommits: string[];
  groups: GroupResult[];
  continuity: string[];
  configuredRepositories: ConfiguredRepository[];
  configErrors: ConfigError[];
}

/** The runtime and release a repository wants to move to, such as `nodejs` and `22`. */
export interface UpgradeTarget {
  runtime: string;
  version: string;
}

export interface UpgradeIssue {
  /** Id of the analyzer that reported it. */
  analyzer: string;
  /** `blocker`: will not install or run on the target. `warning`: works but is deprecated there. `unknown`: the evidence needed is missing. */
  level: "blocker" | "warning" | "unknown";
  /** What is affected, such as `sharp@0.30.7` or `util.isArray`. */
  subject: string;
  path: string;
  line?: number;
  /** One sentence a person or an agent can show as is. */
  reason: string;
  /** The exact evidence: a lockfile or manifest value as written, or a lifecycle rule id. */
  evidence: { kind: "lockfile" | "manifest" | "rule"; value: string };
}

/** Reads repository files and bundled lifecycle data only: no network, no commands. */
export interface UpgradeAnalyzer {
  id: string;
  /** Runtime ids this analyzer can judge, matching `src/capabilities.ts`. */
  runtimes: readonly string[];
  /** True when the repository has the files this analyzer reads. */
  applies(root: string): Promise<boolean>;
  analyze(root: string, target: UpgradeTarget): Promise<UpgradeIssue[]>;
}

export interface UpgradeReport {
  schemaVersion: "evergreen.upgrade.v1";
  target: UpgradeTarget;
  /** `blocked` when any blocker; `unknown` when no analyzer applied; else `ready`. */
  verdict: "ready" | "blocked" | "unknown";
  analyzers: string[];
  issues: UpgradeIssue[];
}

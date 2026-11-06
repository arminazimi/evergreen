import type { AgentIntroducedFindings } from "../agent-pr.js";
import type { ExpiredPolicy } from "../baseline.js";
import type { DiffResult } from "../diff.js";
import type { Finding, ScanResult, Severity, SourceLocation } from "../domain.js";

/** The severity threshold that fails an Action run; `none` never fails on a finding. */
export type SeverityGate = Severity | "none";
/** The level a workflow annotation is shown at. */
export type AnnotationLevel = "notice" | "warning" | "error";

/** A finding rendered as one GitHub Actions workflow annotation. */
export interface GitHubAnnotation {
  level: AnnotationLevel;
  title: string;
  message: string;
  location: SourceLocation;
}

/** One package directory scanned in a multi-path Action run, with its findings relocated under the workspace. */
export interface PackageScanSummary {
  /** Repository-relative POSIX path of the package (`.` for the scan base itself). */
  path: string;
  findings: Finding[];
}

/** Which findings become workflow annotations: `changed` those on lines the pull request changed, `all` every finding, `none` no finding. */
export type AnnotationScope = "changed" | "all" | "none";

export interface LineRange {
  start: number;
  end: number;
}

/** The count of findings left out of the annotations, and a link to the report that lists them all. */
export interface UnannotatedFindings {
  count: number;
  reportUrl?: string;
}

/** One applyable suggestion: the head-file lines it replaces and the lines that replace them. */
export interface FixSuggestion {
  /** Repository-relative POSIX path of the file the fix rewrites. */
  path: string;
  /** First head-file line (1-based) the suggestion replaces. */
  startLine: number;
  /** Last head-file line it replaces; equal to `startLine` for a one-line change. */
  line: number;
  /** The replacement lines, without the surrounding `suggestion` fence. */
  replacement: string[];
}

/** One inline review comment in the shape the GitHub reviews API takes. */
export interface SuggestionComment {
  path: string;
  line: number;
  start_line?: number;
  side: "RIGHT";
  start_side?: "RIGHT";
  body: string;
}

/** Inputs for one Action run: what to scan, which report files to write, and which gate to apply. */
export interface GitHubActionOptions {
  root: string;
  reportPath: string;
  /**
   * Absolute directories to scan in one run (monorepo). Each is scanned separately; findings are
   * relocated under `root`, combined into one report and SARIF, and summarised per package.
   * Ignored in diff mode.
   */
  paths?: readonly string[];
  /** When set, also write the findings as SARIF 2.1.0 to this path, for upload to code scanning. */
  sarifPath?: string;
  /** When set, write a Shields.io endpoint JSON file for optional publication. */
  badgePath?: string;
  baselinePath?: string;
  /** The day suppression dates are compared with (YYYY-MM-DD); defaults to today in UTC. */
  today?: string;
  /** Days before a suppression's `expires` to warn (default 14). */
  baselineWarnDays?: number;
  /** What an expired suppression does: `resurface` (default) or `fail`. */
  onExpired?: ExpiredPolicy;
  /** Warn on lines whose support ends within this many days; off when unset. */
  minSupportDays?: number;
  failOnSeverity?: SeverityGate;
  /** `"diff"` scans the pull request `base..head` refs and judges only what the PR introduces; `"scan"` (default) scans the checked-out tree. */
  mode?: "scan" | "diff";
  /** The `<base>..<head>` refs compared when `mode` is `"diff"`; the pull request event's base and head SHAs. */
  diffRange?: string;
  /** Which findings become annotations; defaults to `changed` in diff mode and `all` otherwise. */
  annotations?: AnnotationScope;
  /**
   * Plan the deterministic fixes for findings on lines the pull request changed, so the runner can
   * post them as one review of `suggestion` comments. Only meaningful in diff mode.
   */
  suggestFixes?: boolean;
  /** Raw `agent-authors` input: comma-separated logins whose pull requests get the agent section, or `none`. */
  agentAuthors?: string;
  /** Login of the pull request author; the agent section appears only when it matches `agentAuthors`. */
  pullRequestAuthor?: string;
}

/** What an Action run produced, including the report, annotations, and whether the job should fail. */
export interface GitHubActionOutcome {
  result: ScanResult;
  reportPath: string;
  sarifPath?: string;
  badgePath?: string;
  /** The same badge as an SVG in the Evergreen brand colors, written next to `badgePath`. */
  badgeSvgPath?: string;
  annotations: GitHubAnnotation[];
  /** Findings left out of the annotations by `annotations: changed`; 0 for `all` and `none`. */
  unannotated: number;
  /** The fixes `suggest-fixes` planned as review suggestions; empty when the input is off. */
  suggestions: FixSuggestion[];
  /** Present in diff mode when the pull request author is an agent that introduced findings. */
  agent?: AgentIntroducedFindings;
  /** The job should fail: the severity gate was met, or the `fail` expiry policy applies. */
  failed: boolean;
  /** A finding met the severity gate. */
  gateFailed: boolean;
  gate: SeverityGate;
  /** True when the `fail` policy is set and a baseline suppression had expired. */
  expiredFailure: boolean;
  /** Present in diff mode: the compared range, the findings the PR fixed, and how many were unchanged. */
  diff?: Pick<DiffResult, "base" | "head" | "fixed" | "unchanged">;
  /** Present when `paths` scanned one or more packages: one entry per package, in path order. */
  packages?: PackageScanSummary[];
}

export type GitHubActionFailure = Pick<
  GitHubActionOutcome,
  "result" | "reportPath" | "failed" | "gateFailed" | "gate" | "expiredFailure"
>;

import { execFileSync } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { evaluateBaseline, expiredSuppressionsFail, readBaseline } from "./baseline.js";
import type { ExpiredPolicy } from "./baseline.js";
import { badgeState, renderBadgeSvg } from "./badge.js";
import { applyMinSupport } from "./min-support.js";
import { builtInDetectors } from "./detectors/index.js";
import type { Finding, ScanResult, Severity, SourceLocation, SuppressionRef } from "./domain.js";
import { severityValues } from "./domain.js";
import { scanRepository } from "./engine.js";
import { DiffError, diffRefs } from "./diff.js";
import { planFixReport } from "./fix/index.js";
import type { DiffResult } from "./diff.js";
import { relativePosix } from "./paths.js";
import { describeData, renderJson, renderSarif } from "./reporters.js";
import type { DataInfo, SuppressionState } from "./domain.js";
import { MAXIMUM_WORKSPACE_DEPTH, SKIPPED_DIRECTORIES, globToRegExp } from "./workspaces.js";

export type SeverityGate = Severity | "none";
export type AnnotationLevel = "notice" | "warning" | "error";

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

function unquotePath(header: string): string {
  if (!header.startsWith('"') || !header.endsWith('"')) return header;
  const named: Record<string, string> = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", '"': '"', "\\": "\\" };
  return header.slice(1, -1).replace(/\\([0-7]{1,3}|.)/g, (_, escape: string) =>
    /^[0-7]+$/.test(escape) ? String.fromCharCode(parseInt(escape, 8)) : (named[escape] ?? escape),
  );
}

/** Parses `git diff --unified=0` into the new-side line ranges it added or changed, keyed by repository-relative path. */
export function parseChangedLines(diff: string): Map<string, LineRange[]> {
  const changed = new Map<string, LineRange[]>();
  let path: string | undefined;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const header = unquotePath(line.slice(4).trim());
      path = header === "/dev/null" ? undefined : header.replace(/^b\//, "");
      continue;
    }
    if (path === undefined || !line.startsWith("@@ ")) continue;
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) continue;
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count > 0) changed.set(path, [...(changed.get(path) ?? []), { start, end: start + count - 1 }]);
  }
  return changed;
}

/** Splits findings into those on a line the range changed and the rest; a finding without a line is never on a changed line. */
export function selectChangedAnnotations(findings: readonly Finding[], changed: ReadonlyMap<string, readonly LineRange[]>): { annotated: Finding[]; unannotated: Finding[] } {
  const annotated: Finding[] = [];
  const unannotated: Finding[] = [];
  for (const finding of findings) {
    const line = finding.location.line;
    const ranges = changed.get(finding.location.path) ?? [];
    if (line !== undefined && ranges.some((range) => line >= range.start && line <= range.end)) annotated.push(finding);
    else unannotated.push(finding);
  }
  return { annotated, unannotated };
}

function changedLines(root: string, range: string): Map<string, LineRange[]> {
  try {
    const output = execFileSync("git", ["-c", "core.quotePath=false", "diff", "--unified=0", "--no-color", "--no-ext-diff", "--no-textconv", range], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 1024,
      windowsHide: true,
    });
    return parseChangedLines(output);
  } catch (error) {
    const stderr = (error as { stderr?: string | Buffer }).stderr?.toString().trim();
    throw new DiffError(stderr || "git diff failed.");
  }
}

/**
 * Turns the unified diff a fixer returns into the replacements it proposes. Each run of removed lines
 * followed by added lines becomes one suggestion; a run that only inserts or deletes lines cannot be
 * expressed as one, so it is left out.
 */
export function suggestionsFromPatch(path: string, patch: string): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];
  let headLine = 0;
  let inHunk = false;
  let removed: number[] = [];
  let added: string[] = [];

  const flush = (): void => {
    if (removed.length > 0 && added.length > 0) {
      suggestions.push({ path, startLine: removed[0]!, line: removed[removed.length - 1]!, replacement: added });
    }
    removed = [];
    added = [];
  };

  for (const line of patch.split("\n")) {
    if (line.startsWith("@@ ")) {
      flush();
      inHunk = true;
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match) headLine = Number(match[1]);
      continue;
    }
    if (!inHunk && (line.startsWith("--- ") || line.startsWith("+++ "))) continue;
    if (line.startsWith("+")) {
      added.push(line.slice(1));
      continue;
    }
    if (line.startsWith("-")) {
      removed.push(headLine);
      headLine += 1;
      continue;
    }
    if (line.startsWith(" ")) {
      flush();
      headLine += 1;
    }
  }
  flush();
  return suggestions;
}

/**
 * Plans the `suggestion` blocks for a diff-mode scan: every fixer runs over the introduced findings,
 * and a replacement is kept only when every line it rewrites was added or changed by the pull request.
 * Findings without a deterministic fix, and patches that only insert or delete lines, produce nothing.
 */
export async function planFixSuggestions(result: ScanResult, changed: ReadonlyMap<string, readonly LineRange[]>): Promise<FixSuggestion[]> {
  const plan = await planFixReport(result);
  const suggestions: FixSuggestion[] = [];
  for (const patch of plan.patches) {
    const ranges = changed.get(patch.path) ?? [];
    for (const suggestion of suggestionsFromPatch(patch.path, patch.diff)) {
      const replacedLines = Array.from({ length: suggestion.line - suggestion.startLine + 1 }, (_, offset) => suggestion.startLine + offset);
      const touchesOnlyChangedLines = replacedLines.every((line) => ranges.some((range) => line >= range.start && line <= range.end));
      if (touchesOnlyChangedLines) suggestions.push(suggestion);
    }
  }
  return suggestions.sort((left, right) =>
    left.path.localeCompare(right.path) || left.startLine - right.startLine || left.line - right.line);
}

/** A `suggestion` block: the lines GitHub replaces the commented lines with. */
export function renderSuggestion(replacement: readonly string[]): string {
  return ["```suggestion", ...replacement, "```"].join("\n");
}

/** One inline review comment that applies a planned fix. */
export function suggestionComment(suggestion: FixSuggestion): SuggestionComment {
  return {
    path: suggestion.path,
    ...(suggestion.startLine === suggestion.line ? {} : { start_line: suggestion.startLine, start_side: "RIGHT" as const }),
    line: suggestion.line,
    side: "RIGHT",
    body: renderSuggestion(suggestion.replacement),
  };
}

/** Hidden marker that identifies the one review Evergreen owns on a pull request, so re-runs update it. */
export const FIX_SUGGESTION_MARKER = "<!-- evergreen-fix-suggestions -->";

/** The review body: the marker, then what the review offers and how to make the same change locally. */
export function renderSuggestionReview(count: number): string {
  return `${FIX_SUGGESTION_MARKER}\nEvergreen can fix ${count} lifecycle finding${count === 1 ? "" : "s"} on lines this pull request changed. Apply a suggestion, or run \`npx evergreen-deprecation fix\` to make every change locally.`;
}

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
}

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

type GitHubActionFailure = Pick<GitHubActionOutcome, "result" | "reportPath" | "failed" | "gateFailed" | "gate" | "expiredFailure">;

const severityRank = new Map(severityValues.map((severity, index) => [severity, index]));

function annotationLevel(finding: Finding): AnnotationLevel {
  if (finding.severity === "critical" || finding.severity === "high") return "error";
  if (finding.severity === "medium") return "warning";
  return "notice";
}

function annotationFor(finding: Finding): GitHubAnnotation {
  return {
    level: annotationLevel(finding),
    title: `Evergreen: ${finding.title}`,
    message: [
      finding.summary,
      finding.replacement ? `Replacement: ${finding.replacement}` : undefined,
      `Finding: ${finding.id}`,
    ]
      .filter((value): value is string => value !== undefined)
      .join("\n"),
    location: finding.location,
  };
}

function parseGate(value: SeverityGate | undefined): SeverityGate {
  const gate = value ?? "high";
  if (gate !== "none" && !severityRank.has(gate)) {
    throw new Error(`Invalid severity gate: ${gate}`);
  }
  return gate;
}

/** Split a multi-line Action `paths` input into non-empty trimmed entries. */
export function parsePathsInput(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isGlobPattern(pattern: string): boolean {
  return /[*?]/.test(pattern);
}

/**
 * Expand a directory glob under `base` into absolute paths. `*` and `?` stay inside one segment;
 * `**` crosses segments. Skips the same vendored trees as workspace discovery. Deterministic order.
 */
async function expandDirectoryGlob(base: string, pattern: string): Promise<string[]> {
  const matcher = globToRegExp(pattern);
  const found: string[] = [];
  let visited = 0;
  const visitLimit = 20_000;

  async function walk(directory: string, relative: string, depth: number): Promise<void> {
    if (depth > MAXIMUM_WORKSPACE_DEPTH || visited >= visitLimit) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith(".")) continue;
      visited += 1;
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      if (matcher.test(path)) found.push(absolute);
      // A match can still contain deeper matches when the pattern has `**`.
      if (depth < MAXIMUM_WORKSPACE_DEPTH) await walk(absolute, path, depth + 1);
    }
  }

  await walk(base, "", 1);
  return found;
}

/**
 * Resolve `paths` entries (literals and globs) under `base` to absolute directories.
 * Literals that are missing or not directories fail; globs that match nothing fail.
 */
export async function resolveScanPaths(base: string, patterns: readonly string[]): Promise<string[]> {
  if (patterns.length === 0) throw new Error("paths must list at least one path or glob.");
  const baseResolved = resolve(base);
  const resolved = new Set<string>();

  for (const raw of patterns) {
    const pattern = raw.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (pattern.length === 0 || pattern === ".") {
      resolved.add(baseResolved);
      continue;
    }
    if (isGlobPattern(pattern)) {
      const matches = await expandDirectoryGlob(baseResolved, pattern);
      if (matches.length === 0) throw new Error(`paths glob matched no directories: ${raw}`);
      for (const match of matches) resolved.add(match);
      continue;
    }
    const absolute = resolve(baseResolved, pattern);
    let info;
    try {
      info = await stat(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`paths entry does not exist: ${raw}`);
      throw error;
    }
    if (!info.isDirectory()) throw new Error(`paths entry is not a directory: ${raw}`);
    resolved.add(absolute);
  }

  return [...resolved].sort((left, right) => relativePosix(baseResolved, left).localeCompare(relativePosix(baseResolved, right)));
}

function prefixPath(prefix: string, path: string): string {
  if (!prefix || prefix === ".") return path;
  return `${prefix}/${path}`;
}

/** Relocate finding paths (and ids that embed them) from a package root to the workspace. */
function relocateFinding(finding: Finding, prefix: string): Finding {
  if (!prefix || prefix === ".") return finding;
  const oldPath = finding.location.path;
  const location = { ...finding.location, path: prefixPath(prefix, oldPath) };
  const idPrefix = `${finding.ruleId}:${oldPath}`;
  const id = finding.id.startsWith(idPrefix) ? `${finding.ruleId}:${location.path}${finding.id.slice(idPrefix.length)}` : finding.id;
  const usages = finding.usages?.map((usage) => ({
    ...usage,
    location: { ...usage.location, path: prefixPath(prefix, usage.location.path) },
  }));
  return { ...finding, id, location, ...(usages ? { usages } : {}) };
}

function relocateSuppressionRef(ref: SuppressionRef, prefix: string): SuppressionRef {
  if (!prefix || prefix === ".") return ref;
  return { ...ref, path: prefixPath(prefix, ref.path) };
}

function mergeSuppressions(states: readonly SuppressionState[]): SuppressionState | undefined {
  if (states.length === 0) return undefined;
  const first = states[0]!;
  return {
    suppressed: states.reduce((sum, state) => sum + state.suppressed, 0),
    ...(first.today !== undefined ? { today: first.today } : {}),
    ...(first.warnWithinDays !== undefined ? { warnWithinDays: first.warnWithinDays } : {}),
    expiring: states.flatMap((state) => state.expiring),
    expired: states.flatMap((state) => state.expired),
  };
}

async function scanOneRoot(
  root: string,
  options: Pick<GitHubActionOptions, "baselinePath" | "today" | "baselineWarnDays" | "onExpired" | "minSupportDays">,
): Promise<{ result: ScanResult; expiredFailure: boolean }> {
  let result = await scanRepository(root, builtInDetectors);
  let expiredFailure = false;
  if (options.minSupportDays !== undefined) {
    result = applyMinSupport(result, options.minSupportDays, options.today ?? new Date().toISOString().slice(0, 10));
  }
  if (options.baselinePath) {
    const evaluated = evaluateBaseline(result, await readBaseline(resolve(root, options.baselinePath)), {
      today: options.today ?? new Date().toISOString().slice(0, 10),
      ...(options.baselineWarnDays === undefined ? {} : { warnWithinDays: options.baselineWarnDays }),
      ...(options.onExpired === undefined ? {} : { onExpired: options.onExpired }),
    });
    result = evaluated.result;
    expiredFailure = expiredSuppressionsFail(options.onExpired, evaluated.expired);
  }
  return { result, expiredFailure };
}

function parseAnnotations(value: AnnotationScope | undefined, mode: "scan" | "diff"): AnnotationScope {
  if (value === undefined) return mode === "diff" ? "changed" : "all";
  if (value !== "all" && value !== "changed" && value !== "none") {
    throw new Error(`Invalid annotations: ${value}. Use "changed", "all", or "none".`);
  }
  return value;
}

export async function runGitHubAction(options: GitHubActionOptions): Promise<GitHubActionOutcome> {
  const root = resolve(options.root);
  const gate = parseGate(options.failOnSeverity);
  let expiredFailure = false;
  let result: ScanResult;
  let diff: Pick<DiffResult, "base" | "head" | "fixed" | "unchanged"> | undefined;
  let packages: PackageScanSummary[] | undefined;

  if (options.mode === "diff") {
    if (!options.diffRange) throw new Error("mode: diff needs the base and head refs of the pull request.");
    const compared = await diffRefs(root, options.diffRange, builtInDetectors);
    // The diff gate judges only what the PR introduces, so no baseline and no min-support run over the whole backlog.
    result = { schemaVersion: "evergreen.scan.v1", root, scannedAt: new Date().toISOString(), findings: compared.introduced, diagnostics: [] };
    diff = { base: compared.base, head: compared.head, fixed: compared.fixed, unchanged: compared.unchanged };
  } else if (options.paths && options.paths.length > 0) {
    const scannedAt = new Date().toISOString();
    const packageResults: PackageScanSummary[] = [];
    const allFindings: Finding[] = [];
    const allDiagnostics: string[] = [];
    const suppressionStates: SuppressionState[] = [];
    let data: DataInfo | undefined;

    for (const packageRoot of options.paths) {
      const absolute = resolve(packageRoot);
      const prefix = relativePosix(root, absolute) || ".";
      const scanned = await scanOneRoot(absolute, options);
      expiredFailure = expiredFailure || scanned.expiredFailure;
      const findings = scanned.result.findings.map((finding) => relocateFinding(finding, prefix));
      packageResults.push({ path: prefix, findings });
      allFindings.push(...findings);
      allDiagnostics.push(...scanned.result.diagnostics.map((line) => (prefix === "." ? line : `${prefix}: ${line}`)));
      if (scanned.result.suppressions) {
        suppressionStates.push({
          ...scanned.result.suppressions,
          expiring: scanned.result.suppressions.expiring.map((ref) => relocateSuppressionRef(ref, prefix)),
          expired: scanned.result.suppressions.expired.map((ref) => relocateSuppressionRef(ref, prefix)),
        });
      }
      data ??= scanned.result.data;
    }

    allFindings.sort((left, right) => left.id.localeCompare(right.id));
    packages = packageResults;
    const suppressions = mergeSuppressions(suppressionStates);
    result = {
      schemaVersion: "evergreen.scan.v1",
      root,
      scannedAt,
      findings: allFindings,
      diagnostics: allDiagnostics,
      ...(data ? { data } : {}),
      ...(suppressions ? { suppressions } : {}),
    };
  } else {
    const scanned = await scanOneRoot(root, options);
    result = scanned.result;
    expiredFailure = scanned.expiredFailure;
  }

  const reportPath = resolve(options.reportPath);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${renderJson(result)}\n`, "utf8");
  let sarifPath: string | undefined;
  if (options.sarifPath) {
    sarifPath = resolve(options.sarifPath);
    await mkdir(dirname(sarifPath), { recursive: true });
    await writeFile(sarifPath, `${renderSarif(result)}\n`, "utf8");
  }

  const gateRank = gate === "none" ? Number.POSITIVE_INFINITY : severityRank.get(gate)!;
  const gateFailed = result.findings.some((finding) => severityRank.get(finding.severity)! >= gateRank);
  let badgePath: string | undefined;
  let badgeSvgPath: string | undefined;
  if (options.badgePath) {
    badgePath = resolve(options.badgePath);
    badgeSvgPath = badgePath.replace(/\.json$/, "") + ".svg";
    await mkdir(dirname(badgePath), { recursive: true });
    await writeFile(badgePath, `${renderBadge(result, expiredFailure)}\n`, "utf8");
    await writeFile(badgeSvgPath, `${renderBadgeSvg(result, expiredFailure)}\n`, "utf8");
  }
  const scope = parseAnnotations(options.annotations, options.mode === "diff" ? "diff" : "scan");
  const diffRange = options.mode === "diff" ? options.diffRange : undefined;
  const changed = diffRange !== undefined && (scope === "changed" || options.suggestFixes === true)
    ? changedLines(root, diffRange)
    : undefined;
  let annotatedFindings: readonly Finding[] = result.findings;
  let unannotated = 0;
  if (scope === "none") {
    annotatedFindings = [];
  } else if (scope === "changed" && changed) {
    const selected = selectChangedAnnotations(result.findings, changed);
    annotatedFindings = selected.annotated;
    unannotated = selected.unannotated.length;
  }
  const suggestions = options.suggestFixes === true && changed ? await planFixSuggestions(result, changed) : [];
  return {
    result,
    reportPath,
    ...(badgePath ? { badgePath } : {}),
    ...(badgeSvgPath ? { badgeSvgPath } : {}),
    ...(sarifPath ? { sarifPath } : {}),
    annotations: annotatedFindings.map(annotationFor),
    unannotated,
    suggestions,
    failed: expiredFailure || gateFailed,
    gateFailed,
    gate,
    expiredFailure,
    ...(diff ? { diff } : {}),
    ...(packages ? { packages } : {}),
  };
}

/** Shields.io endpoint schema v1; contains aggregate counts only, after baseline comparison. */
export function renderBadge(result: Pick<ScanResult, "findings" | "data">, expiredFailure = false): string {
  const { message, color } = badgeState(result, expiredFailure);
  return JSON.stringify({ schemaVersion: 1, label: "evergreen", message, color, labelColor: "#23423A" });
}

/**
 * The actionable error shown when an Action policy gate fails. Keep this separate from the job
 * summary so the reason and report location remain visible in the failed step's annotations.
 */
export function renderFailure(outcome: GitHubActionFailure): string | undefined {
  if (!outcome.failed) return undefined;

  const reasons: string[] = [];
  if (outcome.gateFailed) {
    const gateRank = severityRank.get(outcome.gate as Severity)!;
    const count = outcome.result.findings.filter((finding) => severityRank.get(finding.severity)! >= gateRank).length;
    reasons.push(`${count} finding${count === 1 ? "" : "s"} met or exceeded the ${outcome.gate} severity gate`);
  }
  if (outcome.expiredFailure) {
    const count = outcome.result.suppressions?.expired.length ?? 0;
    reasons.push(`${count} baseline suppression${count === 1 ? "" : "s"} expired while on-expired is fail`);
  }

  return `Evergreen failed: ${reasons.join("; ")}. JSON report: ${outcome.reportPath}. Next steps: review the annotations and JSON report, then fix the findings or update the baseline and rerun Evergreen.`;
}

export const ATTRIBUTION_LINE = "<sub>Scanned by [Evergreen](https://github.com/arminazimi/evergreen)</sub>";

const SUMMARY_FINDINGS = 10;

const cell = (text: string): string => text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();

function appendFindingTables(lines: string[], findings: readonly Finding[]): void {
  if (findings.length === 0) return;

  const counts = new Map<Severity, number>();
  for (const finding of findings) counts.set(finding.severity, (counts.get(finding.severity) ?? 0) + 1);
  lines.push("| Severity | Findings |", "|---|---|");
  for (const severity of [...severityValues].reverse()) {
    const count = counts.get(severity);
    if (count) lines.push(`| ${severity} | ${count} |`);
  }
  lines.push("");

  const top = [...findings].sort((left, right) => (severityRank.get(right.severity) ?? 0) - (severityRank.get(left.severity) ?? 0) || left.id.localeCompare(right.id)).slice(0, SUMMARY_FINDINGS);
  lines.push("| Severity | Finding | Location | Evidence |", "|---|---|---|---|");
  for (const finding of top) {
    const source = finding.sources[0];
    const location = `${finding.location.path}${finding.location.line ? `:${finding.location.line}` : ""}`;
    lines.push(`| ${finding.severity} | ${cell(finding.title)} | \`${cell(location)}\` | ${source ? `[${cell(source.title)}](${source.url})` : "—"} |`);
  }
  if (findings.length > top.length) lines.push("", `…and ${findings.length - top.length} more; the JSON report artifact lists every finding.`);
  lines.push("");
}

/**
 * The job summary the Action writes: a count per severity, the most severe findings with a link to their
 * evidence, the age of the lifecycle data, and (when `attribution` is on) one small line linking to Evergreen.
 * When `diff` is set the scan covered a pull request range: the header and a fixed-findings table say so.
 * When `packages` is set, one section is written per package after the overview.
 * `unannotated` counts the findings that are not on a line the pull request changed, with a link to the full report.
 */
export function renderSummary(
  findings: readonly Finding[],
  failed: boolean,
  gate: SeverityGate,
  data: DataInfo | undefined,
  attribution: boolean,
  suppressions?: SuppressionState,
  diff?: Pick<DiffResult, "base" | "head" | "fixed" | "unchanged">,
  packages?: readonly PackageScanSummary[],
  unannotated?: UnannotatedFindings,
): string {
  const status = failed ? `failed the **${gate}** severity gate` : "passed the severity gate";
  const counts = !diff
    ? packages && packages.length > 0
      ? `Found **${findings.length}** new lifecycle finding${findings.length === 1 ? "" : "s"} across **${packages.length}** package${packages.length === 1 ? "" : "s"}; ${status}.`
      : `Found **${findings.length}** new lifecycle finding${findings.length === 1 ? "" : "s"}; ${status}.`
    : `Found **${findings.length}** lifecycle finding${findings.length === 1 ? "" : "s"} introduced by this pull request (${diff.base}..${diff.head}); ${status}.`;
  const lines = ["## Evergreen", "", counts, ""];

  if (packages && packages.length > 0) {
    for (const pkg of packages) {
      lines.push(`## \`${pkg.path}\``, "");
      lines.push(`Found **${pkg.findings.length}** new lifecycle finding${pkg.findings.length === 1 ? "" : "s"}.`, "");
      appendFindingTables(lines, pkg.findings);
    }
  } else {
    appendFindingTables(lines, findings);
  }

  if (diff) {
    lines.push(`Fixed by this pull request: **${diff.fixed.length}** finding${diff.fixed.length === 1 ? "" : "s"} (${diff.unchanged} unchanged).`, "");
    if (diff.fixed.length > 0) {
      lines.push("| Severity | Fixed finding | Location |", "|---|---|---|");
      for (const finding of diff.fixed.slice(0, SUMMARY_FINDINGS)) {
        const location = `${finding.location.path}${finding.location.line ? `:${finding.location.line}` : ""}`;
        lines.push(`| ${finding.severity} | ${cell(finding.title)} | \`${cell(location)}\` |`);
      }
      if (diff.fixed.length > SUMMARY_FINDINGS) lines.push("", `…and ${diff.fixed.length - SUMMARY_FINDINGS} more.`);
      lines.push("");
    }
  }

  if (unannotated && unannotated.count > 0) {
    const report = unannotated.reportUrl ? `[JSON report](${unannotated.reportUrl})` : "JSON report";
    lines.push(`Not annotated: **${unannotated.count}** finding${unannotated.count === 1 ? "" : "s"} not on lines this pull request changed; the ${report} lists every finding.`, "");
  }

  if (suppressions) {
    lines.push(`Baseline: ${suppressions.suppressed} finding${suppressions.suppressed === 1 ? "" : "s"} suppressed, ${suppressions.expiring.length} expiring${suppressions.warnWithinDays === undefined ? "" : ` within ${suppressions.warnWithinDays} days`}, ${suppressions.expired.length} expired.`, "");
    const rows = [...suppressions.expired.map((ref) => ({ ref, when: `expired ${ref.daysAgo === 0 ? "today" : `${ref.daysAgo} day${ref.daysAgo === 1 ? "" : "s"} ago`}` })), ...suppressions.expiring.map((ref) => ({ ref, when: ref.daysLeft === 0 ? "expires today" : `expires in ${ref.daysLeft} day${ref.daysLeft === 1 ? "" : "s"}` }))];
    if (rows.length > 0) {
      lines.push("| Suppression | Location | When | Owner |", "|---|---|---|---|");
      for (const { ref, when } of rows.slice(0, SUMMARY_FINDINGS)) lines.push(`| ${cell(ref.ruleId)} | \`${cell(ref.path)}\` | ${when} (${ref.expires}) | ${ref.owner ? cell(ref.owner) : "—"} |`);
      if (rows.length > SUMMARY_FINDINGS) lines.push("", `…and ${rows.length - SUMMARY_FINDINGS} more.`);
      lines.push("");
    }
  }

  if (data) {
    lines.push(describeData(data));
    if (data.stale) lines.push("", "> **Warning:** the lifecycle data is stale, so findings may miss recent changes.");
    lines.push("");
  }
  if (attribution) lines.push(ATTRIBUTION_LINE, "");
  return lines.join("\n");
}

/** Hidden marker that identifies the one comment Evergreen owns on a pull request, so re-runs update it. */
export const PR_COMMENT_MARKER = "<!-- evergreen-pr-comment -->";

/** The pull-request comment: the marker, then the same counts and top findings as the job summary. */
export function renderComment(
  findings: readonly Finding[],
  failed: boolean,
  gate: SeverityGate,
  data: DataInfo | undefined,
  attribution: boolean,
  suppressions?: SuppressionState,
  diff?: Pick<DiffResult, "base" | "head" | "fixed" | "unchanged">,
  packages?: readonly PackageScanSummary[],
  unannotated?: UnannotatedFindings,
): string {
  return `${PR_COMMENT_MARKER}\n${renderSummary(findings, failed, gate, data, attribution, suppressions, diff, packages, unannotated)}`;
}

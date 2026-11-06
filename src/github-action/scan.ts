import { resolve } from "node:path";

import { matchesAgentAuthor, parseAgentAuthors } from "../agent-pr.js";
import type { AgentIntroducedFindings } from "../agent-pr.js";
import { evaluateBaseline, expiredSuppressionsFail, readBaseline } from "../baseline.js";
import type { DiffResult } from "../diff.js";
import type { DataInfo, Finding, ScanResult, SuppressionRef, SuppressionState } from "../domain.js";
import { applyMinSupport } from "../min-support.js";
import { relativePosix } from "../paths.js";
import { required } from "../required.js";
import { diffWithBuiltIns, scanWithBuiltIns } from "../scan-builtins.js";
import type { GitHubActionOptions, PackageScanSummary } from "./types.js";

type DiffSummary = Pick<DiffResult, "base" | "head" | "fixed" | "unchanged">;

/** What one Action run scanned, before the reports, annotations, and gates are produced. */
export interface ScanOutcome {
  result: ScanResult;
  expiredFailure: boolean;
  diff?: DiffSummary;
  packages?: PackageScanSummary[];
  agent?: AgentIntroducedFindings;
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
  const id = finding.id.startsWith(idPrefix)
    ? `${finding.ruleId}:${location.path}${finding.id.slice(idPrefix.length)}`
    : finding.id;
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
  const first = required(states[0], "first suppression state");
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
  let result = await scanWithBuiltIns(root);
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

async function scanDiffMode(root: string, options: GitHubActionOptions): Promise<ScanOutcome> {
  if (!options.diffRange) throw new Error("mode: diff needs the base and head refs of the pull request.");
  const compared = await diffWithBuiltIns(root, options.diffRange);
  // The diff gate judges only what the PR introduces, so no baseline and no min-support run over the whole backlog.
  const result: ScanResult = {
    schemaVersion: "evergreen.scan.v1",
    root,
    scannedAt: new Date().toISOString(),
    findings: compared.introduced,
    diagnostics: [],
  };
  const diff = { base: compared.base, head: compared.head, fixed: compared.fixed, unchanged: compared.unchanged };
  const author = options.pullRequestAuthor;
  const agent =
    compared.introduced.length > 0 &&
    author !== undefined &&
    matchesAgentAuthor(author, parseAgentAuthors(options.agentAuthors))
      ? { author, findings: compared.introduced }
      : undefined;
  return { result, expiredFailure: false, diff, ...(agent ? { agent } : {}) };
}

async function scanPathsMode(
  root: string,
  options: GitHubActionOptions,
  paths: readonly string[],
): Promise<ScanOutcome> {
  const scannedAt = new Date().toISOString();
  const packageResults: PackageScanSummary[] = [];
  const allFindings: Finding[] = [];
  const allDiagnostics: string[] = [];
  const suppressionStates: SuppressionState[] = [];
  let expiredFailure = false;
  let data: DataInfo | undefined;

  for (const packageRoot of paths) {
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
  const suppressions = mergeSuppressions(suppressionStates);
  const result: ScanResult = {
    schemaVersion: "evergreen.scan.v1",
    root,
    scannedAt,
    findings: allFindings,
    diagnostics: allDiagnostics,
    ...(data ? { data } : {}),
    ...(suppressions ? { suppressions } : {}),
  };
  return { result, expiredFailure, packages: packageResults };
}

/** Scans the checked-out tree, one package path, or a pull request range, depending on the inputs. */
export async function scanInMode(root: string, options: GitHubActionOptions): Promise<ScanOutcome> {
  if (options.mode === "diff") return scanDiffMode(root, options);
  if (options.paths && options.paths.length > 0) return scanPathsMode(root, options, options.paths);
  const scanned = await scanOneRoot(root, options);
  return { result: scanned.result, expiredFailure: scanned.expiredFailure };
}

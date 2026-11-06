import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { renderBadgeSvg } from "../badge.js";
import type { Finding, ScanResult } from "../domain.js";
import { renderJson, renderSarif } from "../reporters.js";
import { required } from "../required.js";
import { changedLines, planFixSuggestions, selectChangedAnnotations } from "./diff.js";
import { parseAnnotations, parseGate, severityRank } from "./inputs.js";
import { annotationFor, renderBadge } from "./render.js";
import { scanInMode } from "./scan.js";
import type { AnnotationScope, GitHubActionOptions, GitHubActionOutcome, LineRange } from "./types.js";

async function writeReports(
  options: GitHubActionOptions,
  result: ScanResult,
): Promise<{ reportPath: string; sarifPath?: string }> {
  const reportPath = resolve(options.reportPath);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${renderJson(result)}\n`, "utf8");
  if (!options.sarifPath) return { reportPath };
  const sarifPath = resolve(options.sarifPath);
  await mkdir(dirname(sarifPath), { recursive: true });
  await writeFile(sarifPath, `${renderSarif(result)}\n`, "utf8");
  return { reportPath, sarifPath };
}

async function writeBadge(
  options: GitHubActionOptions,
  result: ScanResult,
  expiredFailure: boolean,
): Promise<{ badgePath?: string; badgeSvgPath?: string }> {
  if (!options.badgePath) return {};
  const badgePath = resolve(options.badgePath);
  const badgeSvgPath = badgePath.replace(/\.json$/, "") + ".svg";
  await mkdir(dirname(badgePath), { recursive: true });
  await writeFile(badgePath, `${renderBadge(result, expiredFailure)}\n`, "utf8");
  await writeFile(badgeSvgPath, `${renderBadgeSvg(result, expiredFailure)}\n`, "utf8");
  return { badgePath, badgeSvgPath };
}

function selectAnnotations(
  findings: readonly Finding[],
  scope: AnnotationScope,
  changed: ReadonlyMap<string, readonly LineRange[]> | undefined,
): { annotated: readonly Finding[]; unannotated: number } {
  if (scope === "none") return { annotated: [], unannotated: 0 };
  if (scope === "changed" && changed) {
    const selected = selectChangedAnnotations(findings, changed);
    return { annotated: selected.annotated, unannotated: selected.unannotated.length };
  }
  return { annotated: findings, unannotated: 0 };
}

async function planAnnotations(
  root: string,
  options: GitHubActionOptions,
  result: ScanResult,
): Promise<{
  annotations: GitHubActionOutcome["annotations"];
  unannotated: number;
  suggestions: GitHubActionOutcome["suggestions"];
}> {
  const scope = parseAnnotations(options.annotations, options.mode === "diff" ? "diff" : "scan");
  const diffRange = options.mode === "diff" ? options.diffRange : undefined;
  const changed =
    diffRange !== undefined && (scope === "changed" || options.suggestFixes === true)
      ? changedLines(root, diffRange)
      : undefined;
  const selected = selectAnnotations(result.findings, scope, changed);
  const suggestions = options.suggestFixes === true && changed ? await planFixSuggestions(result, changed) : [];
  return { annotations: selected.annotated.map(annotationFor), unannotated: selected.unannotated, suggestions };
}

/** Scans, writes the requested reports, evaluates the gates, and reports whether the job should fail. */
export async function runGitHubAction(options: GitHubActionOptions): Promise<GitHubActionOutcome> {
  const root = resolve(options.root);
  const gate = parseGate(options.failOnSeverity);
  const scanned = await scanInMode(root, options);
  const { result, expiredFailure, diff, packages, agent } = scanned;
  const { reportPath, sarifPath } = await writeReports(options, result);

  const gateRank = gate === "none" ? Number.POSITIVE_INFINITY : required(severityRank.get(gate), "gate severity rank");
  const gateFailed = result.findings.some(
    (finding) => required(severityRank.get(finding.severity), "finding severity rank") >= gateRank,
  );
  const badge = await writeBadge(options, result, expiredFailure);
  const planned = await planAnnotations(root, options, result);

  return {
    result,
    reportPath,
    ...(badge.badgePath ? { badgePath: badge.badgePath } : {}),
    ...(badge.badgeSvgPath ? { badgeSvgPath: badge.badgeSvgPath } : {}),
    ...(sarifPath ? { sarifPath } : {}),
    annotations: planned.annotations,
    unannotated: planned.unannotated,
    suggestions: planned.suggestions,
    failed: expiredFailure || gateFailed,
    gateFailed,
    gate,
    expiredFailure,
    ...(diff ? { diff } : {}),
    ...(packages ? { packages } : {}),
    ...(agent ? { agent } : {}),
  };
}

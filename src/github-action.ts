import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { applyBaseline, readBaseline } from "./baseline.js";
import { builtInDetectors } from "./detectors/index.js";
import type { Finding, ScanResult, Severity, SourceLocation } from "./domain.js";
import { severityValues } from "./domain.js";
import { scanRepository } from "./engine.js";
import { describeData, renderJson, renderSarif } from "./reporters.js";
import type { DataInfo } from "./domain.js";

export type SeverityGate = Severity | "none";
export type AnnotationLevel = "notice" | "warning" | "error";

export interface GitHubAnnotation {
  level: AnnotationLevel;
  title: string;
  message: string;
  location: SourceLocation;
}

export interface GitHubActionOptions {
  root: string;
  reportPath: string;
  /** When set, also write the findings as SARIF 2.1.0 to this path, for upload to code scanning. */
  sarifPath?: string;
  baselinePath?: string;
  failOnSeverity?: SeverityGate;
}

export interface GitHubActionOutcome {
  result: ScanResult;
  reportPath: string;
  sarifPath?: string;
  annotations: GitHubAnnotation[];
  failed: boolean;
  gate: SeverityGate;
}

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

export async function runGitHubAction(options: GitHubActionOptions): Promise<GitHubActionOutcome> {
  const root = resolve(options.root);
  const gate = parseGate(options.failOnSeverity);
  let result = await scanRepository(root, builtInDetectors);
  if (options.baselinePath) {
    result = applyBaseline(result, await readBaseline(resolve(root, options.baselinePath)));
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
  return {
    result,
    reportPath,
    ...(sarifPath ? { sarifPath } : {}),
    annotations: result.findings.map(annotationFor),
    failed: result.findings.some((finding) => severityRank.get(finding.severity)! >= gateRank),
    gate,
  };
}

export const ATTRIBUTION_LINE = "<sub>Scanned by [Evergreen](https://github.com/arminazimi/evergreen)</sub>";

/** The job summary the Action writes. `attribution` adds one small line linking back to Evergreen. */
export function renderSummary(findings: number, failed: boolean, gate: SeverityGate, data: DataInfo | undefined, attribution: boolean): string {
  const status = failed ? `failed the **${gate}** severity gate` : "passed the severity gate";
  const dataLines = data
    ? `\n${describeData(data)}${data.stale ? "\n\n> **Warning:** the lifecycle data is stale, so findings may miss recent changes." : ""}\n`
    : "";
  return `## Evergreen\n\nFound **${findings}** new lifecycle finding${findings === 1 ? "" : "s"}; ${status}.\n${dataLines}${attribution ? `\n${ATTRIBUTION_LINE}\n` : ""}`;
}

import { basename } from "node:path/posix";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { getActiveData } from "./data-source.js";
import { dataInfoFrom, staleDataWarning } from "./data-status.js";
import type { Confidence, ScanResult } from "./domain.js";
import { assertDetectorCompatible } from "./sdk.js";
import type { Detector, DetectorFinding } from "./sdk.js";

/** Lockfiles whose entries are resolved versions rather than declarations. */
const LOCKFILE_NAME = /(^|[-.])(lock|lockfile)(\.[a-z]+)?$|\.lock$|^(go\.sum|pubspec\.lock|packages\.lock\.json|gemfile\.lock|composer\.lock|cargo\.lock|poetry\.lock|uv\.lock|pipfile\.lock|npm-shrinkwrap\.json)$/i;

/** What a finding is worth when its detector did not say: a lockfile entry is inferred-from-lock, any other read is exact. */
export function defaultConfidence(finding: DetectorFinding): Confidence {
  return finding.confidence ?? (LOCKFILE_NAME.test(basename(finding.location.path)) ? "inferred-from-lock" : "exact");
}

export async function scanRepository(
  root: string,
  detectors: readonly Detector[] = [],
): Promise<ScanResult> {
  const resolvedRoot = resolve(root);
  const analyses = await Promise.all(
      detectors.map(async (detector) => {
        assertDetectorCompatible(detector);
        const analysis = detector.analyze
          ? await detector.analyze({ root: resolvedRoot })
          : { findings: await detector.scan({ root: resolvedRoot }), unclassified: [] };
        return {
          findings: analysis.findings.map((finding) => ({
            ...finding,
            detector: detector.id,
            confidence: defaultConfidence(finding),
          })),
          unclassified: analysis.unclassified.map((reference) => ({
            ...reference,
            detector: detector.id,
          })),
        };
      }),
    );
  const findings = analyses.flatMap((analysis) => analysis.findings);
  const references = analyses
    .flatMap((analysis) => analysis.unclassified)
    .sort((left, right) =>
      [left.detector, left.component, left.location.path, left.location.line ?? 0, left.reference]
        .join(":")
        .localeCompare(
          [right.detector, right.component, right.location.path, right.location.line ?? 0, right.reference]
            .join(":"),
        )
    );

  // Say so when downloaded data was refused and the bundled data was used instead.
  const scannedAt = new Date();
  const active = detectors.length === 0 ? undefined : await getActiveData();
  const data = active ? dataInfoFrom(active, scannedAt) : undefined;
  const dataWarnings = active ? [...active.info.warnings, ...(data?.stale ? [staleDataWarning(data)] : [])] : [];

  return {
    schemaVersion: "evergreen.scan.v1",
    root: resolvedRoot,
    scannedAt: scannedAt.toISOString(),
    findings: findings.sort((left, right) => left.id.localeCompare(right.id)),
    unclassified: { count: references.length, references },
    diagnostics: detectors.length === 0 ? ["No detectors are enabled."] : dataWarnings,
    ...(data ? { data } : {}),
  };
}

export interface ProjectScan {
  path: string;
  result: ScanResult;
}

export interface MultiScanResult {
  schemaVersion: "evergreen.multi-scan.v1";
  projects: Array<{ path: string; findings: number; result: ScanResult }>;
  total: { projects: number; findings: number };
}

/** The immediate subdirectories of `directory` that are Git repositories, sorted by name. */
export async function findRepositories(directory: string): Promise<string[]> {
  const root = resolve(directory);
  const entries = await readdir(root, { withFileTypes: true });
  const repositories: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(root, entry.name);
    if (await stat(join(candidate, ".git")).then(() => true, () => false)) repositories.push(candidate);
  }
  return repositories.sort((left, right) => left.localeCompare(right));
}

/** Scans each path in turn; projects come back sorted by path so the output is deterministic. */
export async function scanProjects(
  paths: readonly string[],
  detectors: readonly Detector[] = [],
): Promise<MultiScanResult> {
  const unique = [...new Set(paths.map((path) => resolve(path)))].sort((left, right) => left.localeCompare(right));
  const projects: MultiScanResult["projects"] = [];
  for (const path of unique) {
    const result = await scanRepository(path, detectors);
    projects.push({ path, findings: result.findings.length, result });
  }
  return {
    schemaVersion: "evergreen.multi-scan.v1",
    projects,
    total: { projects: projects.length, findings: projects.reduce((sum, project) => sum + project.findings, 0) },
  };
}

export function renderMultiScanText(scan: MultiScanResult): string {
  const lines = scan.projects.map((project) => `${project.path}: ${project.findings} ${project.findings === 1 ? "finding" : "findings"}`);
  lines.push("", `Total: ${scan.total.findings} ${scan.total.findings === 1 ? "finding" : "findings"} across ${scan.total.projects} ${scan.total.projects === 1 ? "project" : "projects"}`);
  return lines.join("\n");
}

// Stage 4 — report: assemble the `evergreen.scan.v1` result (including provable coverage) and render
// a multi-repository summary.

import { COVERAGE_WALK_LIMIT } from "../domain.js";
import type { DataInfo, Finding, ScanCoverage, ScanResult, UnclassifiedReference } from "../domain.js";
import type { ScanFileSystem } from "../file-system.js";
import type { Detector } from "../sdk.js";
import { buildScanCoverage } from "./discover.js";

/** The result of scanning several repositories in one invocation. */
export interface MultiScanResult {
  schemaVersion: "evergreen.multi-scan.v1";
  projects: Array<{ path: string; findings: number; result: ScanResult }>;
  total: { projects: number; findings: number };
}

/** Scans that covered several paths show one line per project, then a total. */
export function renderMultiScanText(scan: MultiScanResult): string {
  const lines = scan.projects.map(
    (project) => `${project.path}: ${project.findings} ${project.findings === 1 ? "finding" : "findings"}`,
  );
  lines.push(
    "",
    `Total: ${scan.total.findings} ${scan.total.findings === 1 ? "finding" : "findings"} across ${scan.total.projects} ${scan.total.projects === 1 ? "project" : "projects"}`,
  );
  return lines.join("\n");
}

/** The resolved parts of a scan that the final result is assembled from. */
export interface ScanReport {
  readonly root: string;
  readonly scannedAt: string;
  readonly detectors: readonly Detector[];
  readonly findings: readonly Finding[];
  readonly references: readonly UnclassifiedReference[];
  readonly repoFiles: readonly string[];
  readonly fileSystem: ScanFileSystem;
  readonly diagnostics: readonly string[];
  readonly data?: DataInfo;
}

/** Assembles the stable `evergreen.scan.v1` result, including the coverage it can prove. */
export async function buildScanResult(report: ScanReport): Promise<ScanResult> {
  const coverage = await coverageOf(report);
  return {
    schemaVersion: "evergreen.scan.v1",
    root: report.root,
    scannedAt: report.scannedAt,
    findings: [...report.findings],
    unclassified: { count: report.references.length, references: [...report.references] },
    diagnostics: [...report.diagnostics],
    ...(report.data ? { data: report.data } : {}),
    ...(coverage ? { coverage } : {}),
  };
}

async function coverageOf(report: ScanReport): Promise<ScanCoverage | undefined> {
  if (report.detectors.length === 0) return undefined;
  // Empty scans keep the detector-matched coverage walk (ecosystems + help text). Scans with
  // findings reuse the repository file list so plan touch-sets can attach lockfiles.
  if (report.findings.length > 0) {
    return {
      ecosystems: [...new Set(report.findings.map((finding) => finding.detector))].sort((left, right) =>
        left.localeCompare(right),
      ),
      filesRead: [...report.repoFiles].sort((left, right) => left.localeCompare(right)),
      unsupportedFiles: [...new Set(report.references.map((reference) => reference.location.path))].sort(
        (left, right) => left.localeCompare(right),
      ),
    };
  }
  return buildScanCoverage(
    report.root,
    report.detectors,
    report.references.map((reference) => reference.location.path),
    COVERAGE_WALK_LIMIT,
    report.fileSystem,
  );
}

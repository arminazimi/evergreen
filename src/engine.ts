import { basename } from "node:path/posix";
import { resolve } from "node:path";

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

import { resolve } from "node:path";

import type { ScanResult } from "./domain.js";
import { assertDetectorCompatible } from "./sdk.js";
import type { Detector } from "./sdk.js";

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
          findings: analysis.findings.map((finding) => ({ ...finding, detector: detector.id })),
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

  return {
    schemaVersion: "evergreen.scan.v1",
    root: resolvedRoot,
    scannedAt: new Date().toISOString(),
    findings: findings.sort((left, right) => left.id.localeCompare(right.id)),
    unclassified: { count: references.length, references },
    diagnostics:
      detectors.length === 0
        ? ["No detectors are enabled."]
        : [],
  };
}

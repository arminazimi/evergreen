// Per-detector precision floors for the public corpus. A detector is named by the first segment of
// its rule ids ("npm.package.request.deprecated" belongs to "npm").

export interface DetectorThreshold {
  /** Only stable detectors are enforced; a detector that is still experimental is reported but never fails the run. */
  stable: boolean;
  minPrecision: number;
}

export interface Thresholds {
  schemaVersion: "evergreen.corpus-thresholds.v1";
  detectors: Record<string, DetectorThreshold>;
}

export interface DetectorScore {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  /** 1 when the detector reported nothing, so an empty result never counts as a regression. */
  precision: number;
}

export interface Violation {
  detector: string;
  precision: number;
  minPrecision: number;
}

export const detectorOf = (ruleId: string): string => ruleId.split(".")[0] ?? ruleId;

export interface ScoredResult {
  findings: Array<{ ruleId: string; path: string; line?: number }>;
  /** Keys ("ruleId:path:line") of findings the corpus does not list. */
  unexpected: string[];
  /** Keys of listed findings that were not reported. */
  missing: string[];
}

export const findingKey = (finding: { ruleId: string; path: string; line?: number }): string =>
  [finding.ruleId, finding.path, finding.line ?? ""].join(":");

export function scoreDetectors(results: ScoredResult[]): Record<string, DetectorScore> {
  const scores = new Map<string, { tp: number; fp: number; fn: number }>();
  const entry = (detector: string) => {
    let score = scores.get(detector);
    if (!score) scores.set(detector, (score = { tp: 0, fp: 0, fn: 0 }));
    return score;
  };
  for (const result of results) {
    const unexpected = new Set(result.unexpected);
    for (const finding of result.findings) {
      entry(detectorOf(finding.ruleId))[unexpected.has(findingKey(finding)) ? "fp" : "tp"]++;
    }
    for (const key of result.missing) entry(detectorOf(key)).fn++;
  }
  return Object.fromEntries(
    [...scores.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([detector, { tp, fp, fn }]) => [
      detector,
      {
        truePositives: tp,
        falsePositives: fp,
        falseNegatives: fn,
        precision: Number((tp + fp === 0 ? 1 : tp / (tp + fp)).toFixed(4)),
      },
    ]),
  );
}

export function violations(scores: Record<string, DetectorScore>, thresholds: Thresholds): Violation[] {
  const found: Violation[] = [];
  for (const [detector, threshold] of Object.entries(thresholds.detectors)) {
    if (!threshold.stable) continue;
    const precision = scores[detector]?.precision ?? 1;
    if (precision < threshold.minPrecision) found.push({ detector, precision, minPrecision: threshold.minPrecision });
  }
  return found;
}

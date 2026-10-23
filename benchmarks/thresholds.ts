// Per-detector precision floors for the public corpus. A detector is named by the first segment of
// its rule ids ("npm.package.request.deprecated" belongs to "npm").

import type { CorpusBudget } from "./corpus-cost.js";

export const maturityLevels = ["experimental", "beta", "stable"] as const;
export type MaturityLevel = (typeof maturityLevels)[number];

export interface DetectorThreshold {
  /** What the detector promises (decision 0013). `beta` and `stable` are enforced; `experimental` is reported only. */
  level: MaturityLevel;
  /** Whether the precision floor is enforced: true for `beta` and `stable`, kept in step with `level` by a test. */
  stable: boolean;
  minPrecision: number;
}

/** The last full corpus run a level claim rests on (decision 0013). */
export interface FullRunRecord {
  date: string;
  commit: string;
  repositories: number;
  findings: number;
  precision: number;
  recall: number;
  perDetector: Record<string, { truePositives: number; falsePositives: number; falseNegatives: number }>;
}

export interface Thresholds {
  schemaVersion: "evergreen.corpus-thresholds.v1";
  /** What a corpus run may cost before it warns; see benchmarks/corpus-cost.ts. */
  budget?: CorpusBudget;
  lastFullRun?: FullRunRecord;
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

/** The recall a detector at each enforced level must keep on the whole corpus (decision 0013). */
export const recallFloors: Record<Exclude<MaturityLevel, "experimental">, number> = { beta: 0.8, stable: 0.9 };

export interface RecallViolation {
  detector: string;
  recall: number;
  minRecall: number;
}

/** Detectors at `beta` or `stable` whose recall, true positives over true positives plus false negatives, is below the floor of their level. */
export function recallViolations(scores: Record<string, DetectorScore>, thresholds: Thresholds): RecallViolation[] {
  const found: RecallViolation[] = [];
  for (const [detector, threshold] of Object.entries(thresholds.detectors)) {
    if (threshold.level === "experimental") continue;
    const score = scores[detector];
    if (!score || score.truePositives + score.falseNegatives === 0) continue;
    const recall = Number((score.truePositives / (score.truePositives + score.falseNegatives)).toFixed(4));
    const minRecall = recallFloors[threshold.level];
    if (recall < minRecall) found.push({ detector, recall, minRecall });
  }
  return found;
}

/** What a corpus has to show for a detector to hold a level (decision 0013). */
export interface Evidence {
  repositoriesWithFindings: number;
  expectedFindings: number;
  zeroFindingRepositories: number;
  /** Corpus repositories of the detector's ecosystems, and how many of them record `selection: "blind"`. */
  repositories: number;
  blindRepositories: number;
}

export interface EvidenceMinimum extends Omit<Evidence, "repositories" | "blindRepositories"> {
  /** The share of the ecosystem's corpus repositories that must be blind. */
  blindShare: number;
}

export const evidenceMinimums: Record<Exclude<MaturityLevel, "experimental">, EvidenceMinimum> = {
  beta: { repositoriesWithFindings: 8, expectedFindings: 15, zeroFindingRepositories: 2, blindShare: 1 / 2 },
  stable: { repositoriesWithFindings: 20, expectedFindings: 60, zeroFindingRepositories: 4, blindShare: 2 / 3 },
};

const meets = (evidence: Evidence, minimum: EvidenceMinimum): boolean =>
  evidence.repositoriesWithFindings >= minimum.repositoriesWithFindings &&
  evidence.expectedFindings >= minimum.expectedFindings &&
  evidence.zeroFindingRepositories >= minimum.zeroFindingRepositories &&
  evidence.repositories > 0 &&
  evidence.blindRepositories / evidence.repositories >= minimum.blindShare;

/** The highest level the counted evidence supports. Precision and recall are checked separately. */
export function earnedLevel(evidence: Evidence): MaturityLevel {
  if (meets(evidence, evidenceMinimums.stable)) return "stable";
  if (meets(evidence, evidenceMinimums.beta)) return "beta";
  return "experimental";
}

/** Counts a detector's evidence from the corpus. `ecosystems` are the corpus ecosystems the detector reads. */
export function countEvidence(
  corpus: ReadonlyArray<{ repository: string; ecosystem: string; selection?: "blind" | "targeted"; expected: ReadonlyArray<{ ruleId: string }> }>,
  detector: string,
  ecosystems: readonly string[],
): Evidence {
  const withFindings = new Set<string>();
  let expectedFindings = 0;
  let zeroFindingRepositories = 0;
  let repositories = 0;
  let blindRepositories = 0;
  for (const entry of corpus) {
    const own = entry.expected.filter((finding) => detectorOf(finding.ruleId) === detector);
    if (own.length > 0) {
      withFindings.add(entry.repository);
      expectedFindings += own.length;
    }
    if (!ecosystems.includes(entry.ecosystem)) continue;
    repositories += 1;
    if (entry.selection === "blind") blindRepositories += 1;
    if (entry.expected.length === 0) zeroFindingRepositories += 1;
  }
  return { repositoriesWithFindings: withFindings.size, expectedFindings, zeroFindingRepositories, repositories, blindRepositories };
}

/** The longest a recorded full run may stand before a level claim loses its evidence (decision 0013). */
export const FULL_RUN_MAX_AGE_DAYS = 30;

/** Whole days from the recorded run to `today` (both `YYYY-MM-DD`). */
export function fullRunAgeDays(record: Pick<FullRunRecord, "date">, today: string): number {
  return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${record.date}T00:00:00Z`)) / 86_400_000);
}

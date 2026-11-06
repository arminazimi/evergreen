// The shape of a corpus report and the one function that builds it. Both the harness
// (benchmarks/public-repositories.ts) and the shard merger (benchmarks/corpus-merge.ts) use it, so
// a run split into shards produces the same report as an unsharded run.

import { budgetWarnings } from "./corpus-cost.js";
import type { CorpusBudget, CorpusCost } from "./corpus-cost.js";
import type { CorpusRepositoryResult } from "./corpus-harness.js";
import type { CorpusShard } from "./corpus-shard.js";
import { recallViolations, scoreDetectors, violations } from "./thresholds.js";
import type { DetectorScore, RecallViolation, Thresholds, Violation } from "./thresholds.js";

export const PUBLIC_VALIDATION_SCHEMA_VERSION = "evergreen.public-validation-result.v1" as const;

export interface CorpusSummary {
  repositoryCount: number;
  findingCount: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  medianScanMs: number;
  p95ScanMs: number;
  slowestScanMs: number;
  medianCheckoutMs: number;
  p95CheckoutMs: number;
  slowestCheckoutMs: number;
  /** Repositories whose scan failed; each one is named with its reason in `repositories`. */
  scanErrors: number;
}

export interface CorpusReport {
  schemaVersion: typeof PUBLIC_VALIDATION_SCHEMA_VERSION;
  mode: "observe" | "verify";
  fullRun: boolean;
  filter?: string;
  /** Present when this report covers one shard; a merged report omits it. */
  shard?: CorpusShard;
  repositories: CorpusRepositoryResult[];
  detectors: Record<string, DetectorScore>;
  thresholdViolations: Violation[];
  recallViolations: RecallViolation[];
  summary: CorpusSummary;
  cost: CorpusCost;
  budget?: CorpusBudget;
  budgetWarnings?: string[];
}

function percentile(values: number[], fraction: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(ordered.length * fraction) - 1);
  return ordered[index] ?? 0;
}

const rounded = (value: number): number => Number(value.toFixed(2));

export interface BuildReportInput {
  results: readonly CorpusRepositoryResult[];
  /** True only for a run that covers every corpus entry, whether direct or merged from all shards. */
  full: boolean;
  observeOnly: boolean;
  filter?: string | undefined;
  shard?: CorpusShard | undefined;
  thresholds: Thresholds;
  cost: CorpusCost;
  /** Multiplier for the per-shard fetched-byte limit; a merged report sums every shard. */
  fetchedMultiplier?: number | undefined;
}

/** Scores a run's results and assembles the JSON report every caller writes. */
export function buildReport(input: BuildReportInput): CorpusReport {
  const { results } = input;
  const truePositives = results.reduce((total, result) => total + result.truePositives, 0);
  const falsePositives = results.reduce((total, result) => total + result.falsePositives, 0);
  const falseNegatives = results.reduce((total, result) => total + result.falseNegatives, 0);
  const durations = results.map((result) => result.durationMs);
  const checkoutDurations = results.map((result) => result.checkoutMs);
  const precision = truePositives + falsePositives === 0 ? 1 : truePositives / (truePositives + falsePositives);
  const recall = truePositives + falseNegatives === 0 ? 1 : truePositives / (truePositives + falseNegatives);
  const detectors = scoreDetectors([...results]);
  // Precision floors are calibrated for the whole corpus, so a filtered or single-shard run never enforces them.
  const regressions = input.full ? violations(detectors, input.thresholds) : [];
  const recallRegressions = input.full ? recallViolations(detectors, input.thresholds) : [];
  const warnings = input.thresholds.budget
    ? budgetWarnings(input.cost, input.thresholds.budget, { fetchedMultiplier: input.fetchedMultiplier ?? 1 })
    : [];
  return {
    schemaVersion: PUBLIC_VALIDATION_SCHEMA_VERSION,
    mode: input.observeOnly ? "observe" : "verify",
    fullRun: input.full,
    ...(input.filter === undefined ? {} : { filter: input.filter }),
    ...(input.shard === undefined ? {} : { shard: input.shard }),
    repositories: [...results],
    detectors,
    thresholdViolations: regressions,
    recallViolations: recallRegressions,
    summary: {
      repositoryCount: results.length,
      findingCount: results.reduce((total, result) => total + result.findings.length, 0),
      truePositives,
      falsePositives,
      falseNegatives,
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      medianScanMs: rounded(percentile(durations, 0.5)),
      p95ScanMs: rounded(percentile(durations, 0.95)),
      slowestScanMs: rounded(Math.max(...durations)),
      medianCheckoutMs: rounded(percentile(checkoutDurations, 0.5)),
      p95CheckoutMs: rounded(percentile(checkoutDurations, 0.95)),
      slowestCheckoutMs: rounded(Math.max(...checkoutDurations)),
      scanErrors: results.filter((result) => result.error !== undefined).length,
    },
    cost: input.cost,
    ...(input.thresholds.budget === undefined ? {} : { budget: input.thresholds.budget, budgetWarnings: warnings }),
  };
}

/** True when a report has a mismatch, a failed scan, or a threshold violation. */
export function reportFailed(report: CorpusReport): boolean {
  return (
    report.summary.falsePositives > 0 ||
    report.summary.falseNegatives > 0 ||
    report.summary.scanErrors > 0 ||
    report.thresholdViolations.length > 0 ||
    report.recallViolations.length > 0
  );
}

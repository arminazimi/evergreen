import type { FullRunRecord, Thresholds } from "./thresholds.js";

/** The parts of a corpus report that decide whether it may be recorded as the last full run. */
export interface RecordableReport {
  schemaVersion?: string;
  mode?: string;
  fullRun?: boolean;
  filter?: string;
  repositories?: unknown[];
  detectors?: Record<string, { truePositives: number; falsePositives: number; falseNegatives: number }>;
  thresholdViolations?: unknown[];
  recallViolations?: unknown[];
  summary?: {
    repositoryCount: number;
    findingCount: number;
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    precision: number;
    recall: number;
  };
}

/** Flags that narrow a run; a narrowed run is never recorded. */
export const FILTER_FLAGS = ["--ecosystem", "--repo", "--failed-from", "--changed"] as const;

/** The first filter flag in `argv`, if any. */
export function findFilterFlag(argv: readonly string[]): string | undefined {
  return argv.find((argument) => FILTER_FLAGS.some((flag) => argument === flag || argument.startsWith(`${flag}=`)));
}

/** Throws unless `report` is a complete, passing, verify-mode run over the whole corpus. */
export function assertRecordable(report: RecordableReport, corpusSize: number): asserts report is Required<Pick<RecordableReport, "summary" | "detectors">> & RecordableReport {
  if (report.schemaVersion !== "evergreen.public-validation-result.v1") throw new Error("Refusing to record: this is not a corpus report.");
  if (report.mode !== "verify") throw new Error(`Refusing to record: the run was in "${report.mode}" mode, not verify.`);
  if (report.fullRun !== true || report.filter !== undefined) throw new Error("Refusing to record: the run was filtered, so it is not a full run.");
  if (!report.summary || !report.detectors) throw new Error("Refusing to record: the report has no summary.");
  if (report.summary.repositoryCount !== corpusSize) {
    throw new Error(`Refusing to record: the run covered ${report.summary.repositoryCount} repositories but the corpus has ${corpusSize}.`);
  }
  if (report.summary.falsePositives > 0 || report.summary.falseNegatives > 0) {
    throw new Error(`Refusing to record: the run has ${report.summary.falsePositives} false positives and ${report.summary.falseNegatives} false negatives.`);
  }
  if ((report.thresholdViolations ?? []).length > 0) throw new Error("Refusing to record: a detector is below its precision floor.");
  if ((report.recallViolations ?? []).length > 0) throw new Error("Refusing to record: a detector is below its recall floor.");
}

/** The `lastFullRun` entry for `report`; every detector in `thresholds` appears, with zeros when it reported nothing. */
export function buildFullRunRecord(
  report: Required<Pick<RecordableReport, "summary" | "detectors">>,
  thresholds: Thresholds,
  run: { date: string; commit: string },
): FullRunRecord {
  const perDetector: FullRunRecord["perDetector"] = {};
  for (const name of [...new Set([...Object.keys(thresholds.detectors), ...Object.keys(report.detectors)])].sort()) {
    const score = report.detectors[name];
    perDetector[name] = {
      truePositives: score?.truePositives ?? 0,
      falsePositives: score?.falsePositives ?? 0,
      falseNegatives: score?.falseNegatives ?? 0,
    };
  }
  return {
    date: run.date,
    commit: run.commit,
    repositories: report.summary.repositoryCount,
    findings: report.summary.findingCount,
    precision: report.summary.precision,
    recall: report.summary.recall,
    perDetector,
  };
}

/** `thresholds.json` text with `lastFullRun` replaced; everything else, including key order, is kept. */
export function withLastFullRun(thresholdsText: string, record: FullRunRecord): string {
  const thresholds = JSON.parse(thresholdsText) as Thresholds;
  thresholds.lastFullRun = record;
  return `${JSON.stringify(thresholds, null, 2)}\n`;
}

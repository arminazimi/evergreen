// Builds docs/dashboard/data.json: the numbers behind the public accuracy dashboard, from committed files only.
//
//   npm run build --silent
//   node dist/tools/build-dashboard-data.js --today 2026-10-18     # writes docs/dashboard/data.json
//   node dist/tools/build-dashboard-data.js --today run-date       # the reference day is lastFullRun.date
//   node dist/tools/build-dashboard-data.js --today run-date --check
//
// Inputs are benchmarks/thresholds.json and benchmarks/public-repositories.json. The tool never reads the clock
// and never uses the network: the reference day is the required --today argument, and it is written into the
// output. `run-date` is the same thing for the committed file, so that it does not change with the clock.
// Output is deterministic: the same inputs and the same day give the same bytes.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { countEvidence, earnedLevel, evidenceMinimums } from "../benchmarks/thresholds.js";
import type { Evidence, MaturityLevel, Thresholds } from "../benchmarks/thresholds.js";

export const DASHBOARD_SCHEMA = "evergreen.dashboard-data.v1";
export const THRESHOLDS_FILE = "benchmarks/thresholds.json";
export const CORPUS_FILE = "benchmarks/public-repositories.json";
export const DECISION_FILE = "docs/decisions/0013-detector-maturity.md";
export const OUTPUT_FILE = "docs/dashboard/data.json";

/** The corpus ecosystems each detector reads, which is what its zero-finding repositories are counted over. */
export const detectorEcosystems: Readonly<Record<string, readonly string[]>> = {
  "ci-images": ["ci-images"],
  container: ["container"],
  dotnet: ["dotnet"],
  "github-actions": ["node-actions"],
  go: ["go"],
  java: ["java"],
  kubernetes: ["kubernetes"],
  nodejs: ["node"],
  npm: ["node"],
  python: ["python"],
  ruby: ["ruby"],
  rust: ["rust"],
};

export interface CorpusRepository {
  repository: string;
  ecosystem: string;
  expected: ReadonlyArray<{ ruleId: string }>;
}

export interface DetectorCounts {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  /** truePositives / (truePositives + falsePositives); null when that denominator is zero. */
  precision: number | null;
  /** truePositives / (truePositives + falseNegatives); null when that denominator is zero. */
  recall: number | null;
}

export interface DashboardDetector {
  id: string;
  level: MaturityLevel;
  earnedLevel: MaturityLevel;
  precisionFloor: { value: number; enforced: boolean };
  /** null when the last full run has no entry for the detector. */
  run: DetectorCounts | null;
  evidence: Evidence;
}

export interface DashboardRun {
  date: string;
  commit: string;
  repositories: number;
  findings: number;
  /** Whole days from `date` to the reference day. */
  runAgeDays: number;
  recordedPrecision: number;
  recordedRecall: number;
  timing: { medianScanMs: null; p95ScanMs: null; note: string };
}

export interface MetricDefinition {
  label: string;
  meaning: string;
  computation: string;
  source: string;
}

export interface DashboardData {
  schemaVersion: typeof DASHBOARD_SCHEMA;
  referenceDay: string;
  corpus: { file: string; repositories: number };
  sources: { thresholds: string; corpus: string; decision: string };
  /** null when benchmarks/thresholds.json records no full run. */
  run: DashboardRun | null;
  detectors: DashboardDetector[];
  evidenceMinimums: typeof evidenceMinimums;
  definitions: Record<string, MetricDefinition>;
  limitations: string[];
}

export const limitations: readonly string[] = [
  "A precision of 1.0 means no regression against this corpus. The expected findings were written by reviewing the same commits, so it does not show that the detectors generalize to unseen repositories. See ADR 0013 and issue #740.",
  "Only the last full run is recorded, so there is no trend: the numbers describe one run on one commit.",
  "Scan time is not measured here. Median and p95 scan times are printed by the corpus harness but are not recorded in a committed file, so the dashboard does not show them.",
  "Evidence counts come from the corpus file as it is now, not as it was at the recorded run. The configured level is a promise recorded in benchmarks/thresholds.json; the earned level counts evidence only and does not check recall or blind selection, which the corpus does not record yet.",
  "A detector's configured level can be higher than its earned level: ADR 0013 lets the detectors that held the Supported label before the evidence rules existed keep it until the corpus grows.",
];

export const definitions: Readonly<Record<string, MetricDefinition>> = {
  level: {
    label: "Level",
    meaning: "What the detector promises users: experimental, beta, or stable (shown in the docs as Supported).",
    computation: "Copied from the detector's entry in benchmarks/thresholds.json. A maintainer changes it in a pull request; nothing computes it.",
    source: THRESHOLDS_FILE,
  },
  earnedLevel: {
    label: "Earned level",
    meaning: "The highest level the counted corpus evidence supports.",
    computation: "earnedLevel() in benchmarks/thresholds.ts applied to the three evidence counts below, against the minimums in ADR 0013. It does not check precision, recall, or blind selection.",
    source: DECISION_FILE,
  },
  precisionFloor: {
    label: "Precision floor",
    meaning: "The lowest precision the corpus run may show for the detector before CI fails.",
    computation: "minPrecision from the detector's entry in benchmarks/thresholds.json. It is enforced for beta and stable detectors and only reported for experimental ones.",
    source: THRESHOLDS_FILE,
  },
  precision: {
    label: "Precision",
    meaning: "Of the findings the detector reported in the last full run, the share that the corpus lists as expected.",
    computation: "truePositives / (truePositives + falsePositives), rounded to 4 decimals. Not measured when the denominator is zero. (The corpus harness treats an empty result as 1 so it never counts as a regression; the dashboard does not.)",
    source: THRESHOLDS_FILE,
  },
  recall: {
    label: "Recall",
    meaning: "Of the findings the corpus lists as expected for the detector, the share it reported in the last full run.",
    computation: "truePositives / (truePositives + falseNegatives), rounded to 4 decimals. Not measured when the denominator is zero.",
    source: THRESHOLDS_FILE,
  },
  truePositives: {
    label: "True positives",
    meaning: "Findings the detector reported that the corpus lists as expected.",
    computation: "perDetector.<detector>.truePositives in the lastFullRun record.",
    source: THRESHOLDS_FILE,
  },
  falsePositives: {
    label: "False positives",
    meaning: "Findings the detector reported that the corpus does not list.",
    computation: "perDetector.<detector>.falsePositives in the lastFullRun record.",
    source: THRESHOLDS_FILE,
  },
  falseNegatives: {
    label: "False negatives",
    meaning: "Findings the corpus lists that the detector did not report.",
    computation: "perDetector.<detector>.falseNegatives in the lastFullRun record.",
    source: THRESHOLDS_FILE,
  },
  repositoriesWithFindings: {
    label: "Repositories with findings",
    meaning: "Corpus repositories with at least one expected finding of this detector.",
    computation: "countEvidence() in benchmarks/thresholds.ts over the corpus entries' expected findings, grouped by the first segment of the rule id.",
    source: CORPUS_FILE,
  },
  expectedFindings: {
    label: "Expected findings",
    meaning: "Findings of this detector that the corpus lists as expected.",
    computation: "countEvidence() in benchmarks/thresholds.ts: the number of expected findings whose rule id belongs to the detector.",
    source: CORPUS_FILE,
  },
  zeroFindingRepositories: {
    label: "Zero-finding repositories",
    meaning: "Corpus repositories of the detector's ecosystem that have no expected findings at all, so a report there would be a false positive.",
    computation: "countEvidence() in benchmarks/thresholds.ts: entries of the detector's corpus ecosystems with an empty expected list. Detectors that read the same ecosystem share this count.",
    source: CORPUS_FILE,
  },
  runAge: {
    label: "Run age",
    meaning: "How many days before the reference day the last full run happened.",
    computation: "The whole days between lastFullRun.date and the reference day given to the build with --today. It is fixed when the file is built, never read from a clock.",
    source: THRESHOLDS_FILE,
  },
  scanTime: {
    label: "Scan time",
    meaning: "Median and p95 time of a local scan.",
    computation: "Not measured: the corpus harness prints these numbers but no committed file records them.",
    source: "benchmarks/public-repositories.ts",
  },
};

const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : Number((numerator / denominator).toFixed(4));

export function detectorCounts(counts: { truePositives: number; falsePositives: number; falseNegatives: number }): DetectorCounts {
  return {
    truePositives: counts.truePositives,
    falsePositives: counts.falsePositives,
    falseNegatives: counts.falseNegatives,
    precision: ratio(counts.truePositives, counts.truePositives + counts.falsePositives),
    recall: ratio(counts.truePositives, counts.truePositives + counts.falseNegatives),
  };
}

const parseDay = (value: string, name: string): number => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const time = match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NaN;
  if (!match || new Date(time).toISOString().slice(0, 10) !== value) throw new Error(`${name} must be a calendar day written YYYY-MM-DD, not "${value}".`);
  return time;
};

export function ageInDays(runDate: string, today: string): number {
  const days = (parseDay(today, "--today") - parseDay(runDate, "lastFullRun.date")) / 86_400_000;
  if (days < 0) throw new Error(`--today ${today} is before the last full run on ${runDate}.`);
  return days;
}

const byCodePoint = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

export function buildDashboardData(input: { thresholds: Thresholds; corpus: readonly CorpusRepository[]; today: string }): DashboardData {
  const { thresholds, corpus, today } = input;
  const lastRun = thresholds.lastFullRun;
  const detectors = Object.keys(thresholds.detectors)
    .sort(byCodePoint)
    .map((id): DashboardDetector => {
      const ecosystems = detectorEcosystems[id];
      if (!ecosystems) throw new Error(`Detector "${id}" in ${THRESHOLDS_FILE} has no corpus ecosystem in detectorEcosystems.`);
      const threshold = thresholds.detectors[id]!;
      const evidence = countEvidence(corpus, id, ecosystems);
      const counts = lastRun?.perDetector[id];
      return {
        id,
        level: threshold.level,
        earnedLevel: earnedLevel(evidence),
        precisionFloor: { value: threshold.minPrecision, enforced: threshold.stable },
        run: counts ? detectorCounts(counts) : null,
        evidence,
      };
    });
  const run: DashboardRun | null = lastRun
    ? {
        date: lastRun.date,
        commit: lastRun.commit,
        repositories: lastRun.repositories,
        findings: lastRun.findings,
        runAgeDays: ageInDays(lastRun.date, today),
        recordedPrecision: lastRun.precision,
        recordedRecall: lastRun.recall,
        timing: { medianScanMs: null, p95ScanMs: null, note: "not measured" },
      }
    : (parseDay(today, "--today"), null);
  return {
    schemaVersion: DASHBOARD_SCHEMA,
    referenceDay: today,
    corpus: { file: CORPUS_FILE, repositories: corpus.length },
    sources: { thresholds: THRESHOLDS_FILE, corpus: CORPUS_FILE, decision: DECISION_FILE },
    run,
    detectors,
    evidenceMinimums,
    definitions: { ...definitions },
    limitations: [...limitations],
  };
}

export async function renderDashboardData(root: string, today: string): Promise<string> {
  const thresholds = JSON.parse(await readFile(resolve(root, THRESHOLDS_FILE), "utf8")) as Thresholds;
  const corpus = (JSON.parse(await readFile(resolve(root, CORPUS_FILE), "utf8")) as { repositories: CorpusRepository[] }).repositories;
  const day = today === "run-date" ? thresholds.lastFullRun?.date : today;
  if (day === undefined) throw new Error(`--today run-date needs a lastFullRun in ${THRESHOLDS_FILE}.`);
  return `${JSON.stringify(buildDashboardData({ thresholds, corpus, today: day }), null, 2)}\n`;
}

function todayArgument(args: readonly string[]): string {
  const index = args.indexOf("--today");
  const value = index === -1 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error("--today is required: a day written YYYY-MM-DD, or run-date for the date of the last full run.");
  }
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const target = resolve(OUTPUT_FILE);
  renderDashboardData(".", todayArgument(args)).then(
    async (text) => {
      if (args.includes("--check")) {
        const current = await readFile(target, "utf8").catch(() => "");
        if (current !== text) {
          process.stderr.write(`${OUTPUT_FILE} is out of date. Run: npm run build:dashboard\n`);
          process.exit(1);
        }
        return;
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, text);
      process.stdout.write(`Wrote ${target} (${text.length} characters)\n`);
    },
    (error: unknown) => {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exit(1);
    },
  );
}

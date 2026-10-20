import { readFile } from "node:fs/promises";

import { findingKey, scoreDetectors } from "./thresholds.js";
import type { DetectorScore, FullRunRecord, ScoredResult } from "./thresholds.js";

interface RunRepository extends ScoredResult {
  repository: string;
  commit: string;
}

/** What `--compare` reads: an earlier report, or the `lastFullRun` recorded in thresholds.json. */
export type Baseline =
  | { kind: "report"; path: string; repositories: RunRepository[] }
  | { kind: "last-full-run"; path: string; record: FullRunRecord };

export interface CompareInput {
  repositories: RunRepository[];
  detectors: Record<string, DetectorScore>;
  /** True when the current run covers the whole corpus. */
  full: boolean;
}

export async function loadBaseline(path: string): Promise<Baseline> {
  let parsed: { schemaVersion?: string; repositories?: unknown; lastFullRun?: FullRunRecord };
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as typeof parsed;
  } catch (error) {
    throw new Error(`Cannot read the comparison file ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (Array.isArray(parsed.repositories)) {
    return { kind: "report", path, repositories: parsed.repositories as RunRepository[] };
  }
  if (parsed.schemaVersion === "evergreen.corpus-thresholds.v1") {
    if (!parsed.lastFullRun) throw new Error(`${path} records no lastFullRun to compare with.`);
    return { kind: "last-full-run", path, record: parsed.lastFullRun };
  }
  throw new Error(`${path} is neither a corpus report nor a thresholds file with a lastFullRun.`);
}

const signed = (value: number): string => (value > 0 ? `+${value}` : String(value));

function detectorLines(current: Record<string, DetectorScore>, baseline: Record<string, { truePositives: number; falsePositives: number; falseNegatives: number }>): string[] {
  const lines: string[] = [];
  for (const name of [...new Set([...Object.keys(current), ...Object.keys(baseline)])].sort()) {
    const now = current[name] ?? { truePositives: 0, falsePositives: 0, falseNegatives: 0 };
    const before = baseline[name] ?? { truePositives: 0, falsePositives: 0, falseNegatives: 0 };
    const tp = now.truePositives - before.truePositives;
    const fp = now.falsePositives - before.falsePositives;
    const fn = now.falseNegatives - before.falseNegatives;
    if (tp !== 0 || fp !== 0 || fn !== 0) lines.push(`DELTA     ${name}: TP ${signed(tp)}, FP ${signed(fp)}, FN ${signed(fn)}`);
  }
  return lines;
}

/**
 * Lines describing what moved since `baseline`: findings added and removed per repository, then per-detector
 * TP/FP/FN differences. Against a report, only repositories present in both are compared, and the detector
 * numbers are recomputed over exactly those, so a filtered run compares like with like.
 */
export function compareRuns(current: CompareInput, baseline: Baseline): string[] {
  const lines = [`COMPARE   against ${baseline.path}`];
  if (baseline.kind === "last-full-run") {
    if (!current.full) lines.push("NOTE      this run is filtered, so the detector totals below cover fewer repositories than the recorded full run.");
    const recorded = baseline.record.perDetector;
    const deltas = detectorLines(current.detectors, recorded);
    lines.push(...(deltas.length > 0 ? deltas : ["no per-detector difference from the recorded full run."]));
    return lines;
  }

  const before = new Map(baseline.repositories.map((entry) => [entry.repository, entry]));
  const shared = current.repositories.filter((entry) => before.has(entry.repository));
  let moved = 0;
  for (const entry of shared) {
    const old = before.get(entry.repository)!;
    const oldKeys = new Set(old.findings.map(findingKey));
    const newKeys = new Set(entry.findings.map(findingKey));
    const where = `${entry.repository}@${entry.commit.slice(0, 10)}`;
    for (const key of [...newKeys].filter((candidate) => !oldKeys.has(candidate)).sort()) {
      lines.push(`ADDED     ${where}: ${key}`);
      moved += 1;
    }
    for (const key of [...oldKeys].filter((candidate) => !newKeys.has(candidate)).sort()) {
      lines.push(`REMOVED   ${where}: ${key}`);
      moved += 1;
    }
  }
  const skipped = current.repositories.length - shared.length;
  if (skipped > 0) lines.push(`NOTE      ${skipped} repositories are not in the earlier report and were not compared.`);
  if (moved === 0) lines.push(`no finding changed in the ${shared.length} repositories compared.`);

  const sharedNames = new Set(shared.map((entry) => entry.repository));
  const oldScores = scoreDetectors(baseline.repositories.filter((entry) => sharedNames.has(entry.repository)));
  const newScores = scoreDetectors(shared);
  lines.push(...detectorLines(newScores, oldScores));
  return lines;
}

/** Reads `--compare <file>` from argv. */
export function parseComparePath(argv: readonly string[] = process.argv): string | undefined {
  const index = argv.indexOf("--compare");
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error("--compare needs a file path.");
  return value;
}

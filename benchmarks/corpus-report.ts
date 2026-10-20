import type { DetectorScore } from "./thresholds.js";

export interface ReportableResult {
  repository: string;
  commit: string;
  ecosystem: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  unexpected: string[];
  missing: string[];
}

interface Row {
  name: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
}

const precisionOf = (truePositives: number, falsePositives: number): number =>
  truePositives + falsePositives === 0 ? 1 : truePositives / (truePositives + falsePositives);

/** TP, FP, FN, and precision per ecosystem, sorted by name. */
export function scoreEcosystems(results: readonly ReportableResult[]): Row[] {
  const rows = new Map<string, Row>();
  for (const result of results) {
    const row = rows.get(result.ecosystem) ?? { name: result.ecosystem, truePositives: 0, falsePositives: 0, falseNegatives: 0, precision: 1 };
    row.truePositives += result.truePositives;
    row.falsePositives += result.falsePositives;
    row.falseNegatives += result.falseNegatives;
    rows.set(result.ecosystem, row);
  }
  return [...rows.values()]
    .map((row) => ({ ...row, precision: precisionOf(row.truePositives, row.falsePositives) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function table(title: string, rows: readonly Row[]): string[] {
  const width = Math.max(title.length, ...rows.map((row) => row.name.length));
  const line = (name: string, tp: string, fp: string, fn: string, precision: string) =>
    `${name.padEnd(width)}  ${tp.padStart(5)} ${fp.padStart(5)} ${fn.padStart(5)} ${precision.padStart(9)}`;
  return [
    line(title, "TP", "FP", "FN", "precision"),
    ...rows.map((row) => line(row.name, String(row.truePositives), String(row.falsePositives), String(row.falseNegatives), row.precision.toFixed(4))),
  ];
}

/** The readable result of a run: an ecosystem table and a detector table. */
export function formatSummaryTables(
  results: readonly ReportableResult[],
  detectors: Record<string, DetectorScore>,
): string {
  const detectorRows = Object.entries(detectors)
    .map(([name, score]) => ({ name, ...score }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return [...table("ecosystem", scoreEcosystems(results)), "", ...table("detector", detectorRows)].join("\n");
}

/** One UNEXPECTED or MISSING line per mismatch, naming the repository and finding. */
export function mismatchLines(results: readonly ReportableResult[]): string[] {
  const lines: string[] = [];
  for (const result of results) {
    const where = `${result.repository}@${result.commit.slice(0, 10)}`;
    for (const key of result.unexpected) lines.push(`UNEXPECTED ${where}: ${key}`);
    for (const key of result.missing) lines.push(`MISSING    ${where}: ${key}`);
  }
  return lines;
}

/** `12/107 owner/name 2.1s` */
export function progressLine(done: number, total: number, repository: string, checkoutMs: number): string {
  return `${done}/${total} ${repository} ${(checkoutMs / 1000).toFixed(1)}s`;
}

/** Reads `--output <file>` from argv. */
export function parseOutputPath(argv: readonly string[] = process.argv): string | undefined {
  const index = argv.indexOf("--output");
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error("--output needs a file path.");
  return value;
}

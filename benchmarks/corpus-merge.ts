// Merges the per-shard reports from a matrix corpus run into the single full report the gate,
// the artifact, and `lastFullRun` expect: `node dist/benchmarks/corpus-merge.js --dir <dir> --output <file>`.
//
// It refuses anything that is not the complete, verify-mode, full-corpus set of shards, so a merged
// report cannot claim a floor it did not measure. Budgets are per shard; the merged fetched bytes
// are compared against the limit scaled by the shard count.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { combineCosts, formatCost } from "./corpus-cost.js";
import type { CorpusRepositoryEntry } from "./corpus-harness.js";
import { formatSummaryTables, mismatchLines } from "./corpus-report.js";
import { buildReport, PUBLIC_VALIDATION_SCHEMA_VERSION, reportFailed } from "./corpus-result.js";
import type { CorpusReport } from "./corpus-result.js";
import { loadPublicCorpus } from "./public-corpus.js";
import type { Thresholds } from "./thresholds.js";

export const USAGE = `Usage: node dist/benchmarks/corpus-merge.js --dir <shard-report-dir> [--output <file>]

Merges every corpus-result-<shard>.json report in <dir>. Each must be a verify-mode shard report
and, together, they must cover every repository in benchmarks/public-repositories/ exactly once.`;

/** The reports the harness writes for a sharded run; anything else in the directory is ignored. */
const SHARD_REPORT_NAME = /^corpus-result-\d+\.json$/;

/** What the merge needs; separate from the CLI so the validation is tested without spawning it. */
export interface MergeInput {
  reports: readonly CorpusReport[];
  /** The pinned corpus the shard reports must cover, in corpus order. */
  corpus: readonly CorpusRepositoryEntry[];
  thresholds: Thresholds;
}

/** Throws a "Refusing to merge: …" error when the reports are not the complete shard set. */
export function mergeShardReports(input: MergeInput): CorpusReport {
  const { reports } = input;
  if (reports.length < 2)
    throw new Error("Refusing to merge: one report is not a sharded run; use the report as it is.");

  let shardCount: number | undefined;
  const shardIndexes = new Set<number>();
  for (const report of reports) {
    if (report.schemaVersion !== PUBLIC_VALIDATION_SCHEMA_VERSION)
      throw new Error("Refusing to merge: one of the reports is not a corpus report.");
    if (report.mode !== "verify")
      throw new Error("Refusing to merge: every shard must run in verify mode, not observe.");
    if (report.fullRun) throw new Error("Refusing to merge: a shard report must not claim to be a full run.");
    if (report.filter !== undefined) throw new Error("Refusing to merge: a shard of a filtered run is not a full run.");
    if (report.shard === undefined)
      throw new Error("Refusing to merge: a report has no shard field; it is not a shard report.");
    if (shardCount === undefined) shardCount = report.shard.count;
    if (report.shard.count !== shardCount)
      throw new Error(`Refusing to merge: shard counts differ (${shardCount} and ${report.shard.count}).`);
    if (shardIndexes.has(report.shard.index))
      throw new Error(`Refusing to merge: shard ${report.shard.index} appears twice.`);
    shardIndexes.add(report.shard.index);
  }
  if (shardCount === undefined) throw new Error("Refusing to merge: no shard reports were given.");
  if (shardIndexes.size !== shardCount) {
    throw new Error(
      `Refusing to merge: expected shards 1..${shardCount}, received ${[...shardIndexes].sort().join(", ")}.`,
    );
  }
  for (let index = 1; index <= shardCount; index += 1) {
    if (!shardIndexes.has(index)) throw new Error(`Refusing to merge: shard ${index}/${shardCount} is missing.`);
  }

  const byRepository = new Map(input.corpus.map((entry) => [entry.repository, entry]));
  const seen = new Set<string>();
  const results: CorpusReport["repositories"] = [];
  for (const report of reports) {
    for (const result of report.repositories) {
      const entry = byRepository.get(result.repository);
      if (entry === undefined) throw new Error(`Refusing to merge: ${result.repository} is not in the corpus.`);
      if (entry.commit !== result.commit) {
        throw new Error(
          `Refusing to merge: ${result.repository} is at ${result.commit}, but the corpus pins ${entry.commit}.`,
        );
      }
      if (seen.has(result.repository))
        throw new Error(`Refusing to merge: ${result.repository} appears in two shards.`);
      seen.add(result.repository);
      results.push(result);
    }
  }
  const missing = input.corpus.filter((entry) => !seen.has(entry.repository)).map((entry) => entry.repository);
  if (missing.length > 0) {
    throw new Error(
      `Refusing to merge: the shards cover ${results.length} of ${input.corpus.length} repositories. Missing:\n${missing.join("\n")}`,
    );
  }

  // Corpus order keeps the merged report identical to an unsharded run.
  const positions = new Map(input.corpus.map((entry, index) => [entry.repository, index]));
  results.sort((left, right) => (positions.get(left.repository) ?? 0) - (positions.get(right.repository) ?? 0));

  return buildReport({
    results,
    full: true,
    observeOnly: false,
    thresholds: input.thresholds,
    cost: combineCosts(reports.map((report) => report.cost)),
    fetchedMultiplier: shardCount,
  });
}

/** Prints a merged report the way the harness prints one, so the CI log reads the same. */
export function printMergedReport(report: CorpusReport, say: (line: string) => void = console.log): void {
  say(`full run: ${report.summary.repositoryCount} repositories, ${report.summary.findingCount} findings`);
  say(formatSummaryTables(report.repositories, report.detectors));
  for (const line of mismatchLines(report.repositories)) say(line);
  console.error(`COST      ${formatCost(report.cost)}`);
  for (const warning of report.budgetWarnings ?? []) {
    console.error(`BUDGET    ${warning}`);
    if (process.env.GITHUB_ACTIONS === "true") console.error(`::warning title=Corpus budget::${warning}`);
  }
  for (const regression of report.thresholdViolations) {
    console.error(
      `THRESHOLD  ${regression.detector}: precision ${regression.precision} is below the required ${regression.minPrecision}`,
    );
  }
  for (const regression of report.recallViolations) {
    console.error(
      `THRESHOLD  ${regression.detector}: recall ${regression.recall} is below the required ${regression.minRecall}`,
    );
  }
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value.`);
  return value;
}

async function readReports(path: string): Promise<CorpusReport[]> {
  let names: string[];
  try {
    names = (await readdir(path)).filter((name) => SHARD_REPORT_NAME.test(name)).sort();
  } catch (error) {
    throw new Error(
      `Cannot read the shard report directory ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (names.length === 0) throw new Error(`No corpus-result-<shard>.json report in ${path}.`);
  const reports: CorpusReport[] = [];
  for (const name of names) {
    try {
      reports.push(JSON.parse(await readFile(resolve(path, name), "utf8")) as CorpusReport);
    } catch (error) {
      throw new Error(
        `Cannot read the shard report ${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return reports;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  try {
    const directory = flagValue(argv, "--dir");
    if (directory === undefined) throw new Error(USAGE);
    const outputPath = flagValue(argv, "--output");
    const [reports, corpus, thresholdsText] = await Promise.all([
      readReports(directory),
      loadPublicCorpus(),
      readFile(resolve("benchmarks/thresholds.json"), "utf8"),
    ]);
    const report = mergeShardReports({
      reports,
      corpus: corpus.repositories,
      thresholds: JSON.parse(thresholdsText) as Thresholds,
    });
    if (outputPath !== undefined) await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
    printMergedReport(report);
    return reportFailed(report) ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await main();

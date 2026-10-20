import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import {
  type CorpusRepositoryEntry,
  resolveCorpusConcurrency,
  runCorpusRepositories,
} from "./corpus-harness.js";
import { ensureCorpusCacheEntry, resolveCorpusCacheDir } from "./corpus-cache.js";
import { budgetWarnings, createCostTracker, directorySize, formatCost, slowestFetches } from "./corpus-cost.js";
import { compareRuns, loadBaseline, parseComparePath } from "./corpus-compare.js";
import { formatSummaryTables, mismatchLines, parseOutputPath, progressLine } from "./corpus-report.js";
import { parseCorpusFilter, readFailedRepositories, selectCorpusEntries } from "./corpus-filter.js";
import { resolveFetchTimeoutMs, withRetries, withTimeout } from "./retry.js";
import { scoreDetectors, violations } from "./thresholds.js";
import type { Thresholds } from "./thresholds.js";

const run = promisify(execFile);
const fetchTimeoutMs = resolveFetchTimeoutMs();

/** Fetches `entry` into `checkout` and returns the size of the fetched git data. */
async function fetchInto(checkout: string, entry: CorpusRepositoryEntry): Promise<number> {
  await run("git", ["init", "--quiet", checkout]);
  // A stalled connection must fail the attempt instead of holding the run: git aborts a transfer below
  // 1 KB/s for 30 s, and the whole attempt has a hard limit. Both count as a failed attempt for withRetries.
  await withRetries(entry.repository, () =>
    withTimeout(fetchTimeoutMs, (signal) =>
      run(
        "git",
        ["-C", checkout, "-c", "http.lowSpeedLimit=1000", "-c", "http.lowSpeedTime=30", "fetch", "--quiet", "--depth", "1", `https://github.com/${entry.repository}.git`, entry.commit],
        {
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
          maxBuffer: 10 * 1024 * 1024,
          signal,
        },
      ),
    ),
  );
  await run("git", ["-C", checkout, "checkout", "--quiet", "--detach", "FETCH_HEAD"]);
  return directorySize(join(checkout, ".git"));
}

interface Corpus {
  schemaVersion: "evergreen.public-validation.v1";
  repositories: CorpusRepositoryEntry[];
}

function percentile(values: number[], fraction: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(ordered.length * fraction) - 1);
  return ordered[index] ?? 0;
}

const observeOnly = process.argv.includes("--observe");
const jsonToStdout = process.argv.includes("--json");
let outputPath: string | undefined;
try {
  outputPath = parseOutputPath();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
let comparePath: string | undefined;
try {
  comparePath = parseComparePath();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
// Stdout carries JSON only with --json; otherwise it is the readable summary and JSON goes to --output.
const say = jsonToStdout ? console.error : console.log;
const concurrency = resolveCorpusConcurrency();
const cacheDir = resolveCorpusCacheDir();
const corpus = JSON.parse(
  await readFile(resolve("benchmarks/public-repositories.json"), "utf8"),
) as Corpus;

if (corpus.repositories.length < 20) {
  throw new Error(`Expected at least 20 repositories, received ${corpus.repositories.length}.`);
}

let selection: ReturnType<typeof selectCorpusEntries>;
try {
  const filter = parseCorpusFilter();
  selection = selectCorpusEntries(
    corpus.repositories,
    filter,
    filter.failedFrom === undefined ? [] : await readFailedRepositories(filter.failedFrom),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
if (selection.description) console.error(selection.description);
if (selection.entries.length === 0) {
  console.error("No repository to run: the report has no mismatches, or none of them is in the corpus any more.");
  process.exit(0);
}

const root = await mkdtemp(join(tmpdir(), "evergreen-public-validation-"));
const costTracker = createCostTracker();
const runStartedAt = performance.now();

try {
  const results = await runCorpusRepositories({
    entries: selection.entries,
    concurrency,
    checkout: async (entry, index) => {
      const checkoutStartedAt = performance.now();
      let path: string;
      if (cacheDir) {
        const cached = await ensureCorpusCacheEntry(cacheDir, entry, async (directory) => {
          costTracker.recordFetch(await fetchInto(directory, entry));
        });
        if (cached.cached) costTracker.recordHit();
        path = cached.path;
      } else {
        path = join(root, String(index));
        costTracker.recordFetch(await fetchInto(path, entry));
      }
      return { path, checkoutMs: Number((performance.now() - checkoutStartedAt).toFixed(2)) };
    },
    onCheckout: (entry, outcome, done) => {
      console.error(progressLine(done, selection.entries.length, entry.repository, outcome.checkoutMs));
    },
    scan: async (path) => {
      const scan = await scanRepository(path, builtInDetectors);
      return scan.findings;
    },
  });

  const truePositives = results.reduce((total, result) => total + result.truePositives, 0);
  const falsePositives = results.reduce((total, result) => total + result.falsePositives, 0);
  const falseNegatives = results.reduce((total, result) => total + result.falseNegatives, 0);
  const durations = results.map((result) => result.durationMs);
  const checkoutDurations = results.map((result) => result.checkoutMs);
  const precision = truePositives + falsePositives === 0
    ? 1
    : truePositives / (truePositives + falsePositives);
  const recall = truePositives + falseNegatives === 0
    ? 1
    : truePositives / (truePositives + falseNegatives);
  const thresholds = JSON.parse(await readFile(resolve("benchmarks/thresholds.json"), "utf8")) as Thresholds;
  const detectors = scoreDetectors(results);
  // Precision floors are calibrated for the whole corpus, so a filtered run never enforces them.
  const regressions = selection.full ? violations(detectors, thresholds) : [];
  const cost = costTracker.finish({ wallMs: performance.now() - runStartedAt, checkoutMs: checkoutDurations });
  const warnings = thresholds.budget ? budgetWarnings(cost, thresholds.budget) : [];
  const report = {
    schemaVersion: "evergreen.public-validation-result.v1",
    mode: observeOnly ? "observe" : "verify",
    fullRun: selection.full,
    ...(selection.description ? { filter: selection.description } : {}),
    repositories: results,
    detectors,
    thresholdViolations: regressions,
    summary: {
      repositoryCount: results.length,
      findingCount: results.reduce((total, result) => total + result.findings.length, 0),
      truePositives,
      falsePositives,
      falseNegatives,
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      medianScanMs: Number(percentile(durations, 0.5).toFixed(2)),
      p95ScanMs: Number(percentile(durations, 0.95).toFixed(2)),
      slowestScanMs: Number(Math.max(...durations).toFixed(2)),
      medianCheckoutMs: Number(percentile(checkoutDurations, 0.5).toFixed(2)),
      p95CheckoutMs: Number(percentile(checkoutDurations, 0.95).toFixed(2)),
      slowestCheckoutMs: Number(Math.max(...checkoutDurations).toFixed(2)),
    },
    cost,
    ...(thresholds.budget ? { budget: thresholds.budget, budgetWarnings: warnings } : {}),
  };

  if (outputPath) await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
  if (jsonToStdout) console.log(JSON.stringify(report, null, 2));
  say(formatSummaryTables(results, detectors));
  // Name every mismatch so a failed run says which repository and which finding, without opening the JSON.
  for (const line of mismatchLines(results)) say(line);
  if (comparePath) {
    try {
      for (const line of compareRuns({ repositories: results, detectors, full: selection.full }, await loadBaseline(comparePath))) say(line);
    } catch (error) {
      // A comparison problem is reported but never decides the exit code.
      console.error(error instanceof Error ? error.message : String(error));
    }
  }
  say(`${selection.full ? "full run" : "filtered run"}: ${results.length} repositories, wall ${(cost.wallMs / 1000).toFixed(1)} s${outputPath ? `, report written to ${outputPath}` : ""}`);
  console.error(`COST      ${formatCost(cost)}`);
  for (const slow of slowestFetches(results)) {
    console.error(`SLOWEST   ${slow.repository}@${slow.commit.slice(0, 10)}: ${(slow.checkoutMs / 1000).toFixed(1)} s`);
  }
  // A budget overrun is a warning only; it never changes the exit code.
  for (const warning of warnings) {
    console.error(`BUDGET    ${warning}`);
    if (process.env.GITHUB_ACTIONS === "true") console.error(`::warning title=Corpus budget::${warning}`);
  }
  for (const regression of regressions) {
    console.error(`THRESHOLD  ${regression.detector}: precision ${regression.precision} is below the required ${regression.minPrecision}`);
  }
  if (!observeOnly && (falsePositives > 0 || falseNegatives > 0 || regressions.length > 0)) process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
}

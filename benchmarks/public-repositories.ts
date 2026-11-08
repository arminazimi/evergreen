import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import {
  inBatches,
  type CorpusRepositoryEntry,
  resolveCorpusConcurrency,
  runCorpusRepositories,
} from "./corpus-harness.js";
import {
  describeMissingEntries,
  ensureCorpusCacheEntry,
  missingCorpusEntries,
  resolveCorpusCacheDir,
} from "./corpus-cache.js";
import { fetchWith, isCheckoutUsable, resolveFetchStrategy } from "./corpus-fetch.js";
import { createCostTracker, formatCost, slowestFetches } from "./corpus-cost.js";
import { affectedEcosystems, changedPaths, describeAffected, parseChangedFlag } from "./corpus-affected.js";
import { compareRuns, loadBaseline, parseComparePath } from "./corpus-compare.js";
import { formatSummaryTables, mismatchLines, parseOutputPath, progressLine } from "./corpus-report.js";
import { parseCorpusFilter, readFailedRepositories, selectCorpusEntries } from "./corpus-filter.js";
import { loadPublicCorpus } from "./public-corpus.js";
import { describeShard, parseShard, shardCoversEverything, shardEntries } from "./corpus-shard.js";
import { resolveMemoryLimit, resolveScanTimeout, scanWithinMemoryLimit } from "./corpus-scan.js";
import { buildReport, reportFailed } from "./corpus-result.js";
import type { Thresholds } from "./thresholds.js";

const fetchStrategy = resolveFetchStrategy();

/** Fetches `entry` into `checkout` and returns the size of the fetched git data. */
async function fetchInto(checkout: string, entry: CorpusRepositoryEntry): Promise<number> {
  return (await fetchWith(fetchStrategy, checkout, entry)).bytes;
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
let memoryMb: number;
let scanTimeoutSeconds: number;
try {
  memoryMb = resolveMemoryLimit();
  scanTimeoutSeconds = resolveScanTimeout();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
// Stdout carries JSON only with --json; otherwise it is the readable summary and JSON goes to --output.
const say = jsonToStdout ? console.error : console.log;
const concurrency = resolveCorpusConcurrency();
const cacheDir = resolveCorpusCacheDir();
const corpus = await loadPublicCorpus();

if (corpus.repositories.length < 20) {
  throw new Error(`Expected at least 20 repositories, received ${corpus.repositories.length}.`);
}

let selection: ReturnType<typeof selectCorpusEntries>;
try {
  const filter = parseCorpusFilter();
  const changed = parseChangedFlag();
  if (changed) {
    const paths = await changedPaths(changed.base);
    const affected = affectedEcosystems(paths);
    for (const line of describeAffected(affected, paths.length)) console.error(line);
    const explicit = filter.ecosystems.length > 0 || filter.repositories.length > 0 || filter.failedFrom !== undefined;
    // Nothing maps and nothing else was asked for: an unfiltered run would be the whole corpus, so stop.
    if (affected.length === 0 && !explicit) process.exit(0);
    filter.ecosystems.push(...affected.map((entry) => entry.ecosystem));
  }
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

// A shard narrows the selected entries only. Membership is a position modulo the shard count, so
// every entry belongs to exactly one shard and two runs over the same corpus pick the same split.
let shard: ReturnType<typeof parseShard>;
try {
  shard = parseShard();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
const entries = shard === undefined ? selection.entries : shardEntries(selection.entries, shard);
// Floors are whole-corpus claims, so a single shard is never a full run even when the selected
// subset happens to be everything.
const full = selection.full && shardCoversEverything(shard);
if (shard !== undefined && !shardCoversEverything(shard)) {
  console.error(describeShard(shard, entries.length, selection.entries.length));
}
if (entries.length === 0) {
  console.error("No repository to run: the report has no mismatches, or none of them is in the corpus any more.");
  process.exit(0);
}
console.error(`scan limit: ${memoryMb} MB per repository, ${scanTimeoutSeconds} s timeout`);

// The corpus expectations are recorded against the bundled lifecycle data, as CI runs it. A downloaded data
// cache in the user's cache directory would change the findings and report false MISSING entries, so point
// the data directory at a path that does not exist unless the caller chose one on purpose.
process.env.EVERGREEN_DATA_DIR ??= join(tmpdir(), `evergreen-corpus-no-data-cache-${process.pid}`);
process.env.EBB_DATA_DIR ??= process.env.EVERGREEN_DATA_DIR;

const offline = process.argv.includes("--offline");
const warmOnly = process.argv.includes("--warm");
if ((offline || warmOnly) && !cacheDir) {
  console.error(
    `${warmOnly ? "--warm" : "--offline"} needs EVERGREEN_CORPUS_CACHE, for example ~/.cache/evergreen-corpus.`,
  );
  process.exit(2);
}
if (offline && warmOnly) {
  console.error("--warm fetches and --offline forbids fetching; use one of them.");
  process.exit(2);
}
if (!cacheDir) {
  console.error(
    "WARNING: EVERGREEN_CORPUS_CACHE is not set, so every repository is fetched again. Set it to ~/.cache/evergreen-corpus and run `npm run corpus:warm` once.",
  );
}
if (cacheDir) {
  const missing = await missingCorpusEntries(cacheDir, entries, (existing) =>
    isCheckoutUsable(existing, fetchStrategy),
  );
  console.error(`cache: ${entries.length - missing.length} of ${entries.length} entries already cached in ${cacheDir}`);
  // An offline run fails before scanning anything, naming every entry it cannot serve.
  if (offline && missing.length > 0) {
    console.error(describeMissingEntries(missing));
    process.exit(2);
  }
  if (warmOnly) {
    let fetched = 0;
    await inBatches(missing, concurrency, async (entry) => {
      await ensureCorpusCacheEntry(
        cacheDir,
        entry,
        async (directory) => {
          await fetchInto(directory, entry);
        },
        (existing) => isCheckoutUsable(existing, fetchStrategy),
      );
      fetched += 1;
      console.error(`${fetched}/${missing.length} ${entry.repository}`);
    });
    console.error(`cache warmed: ${fetched} fetched, ${entries.length - missing.length} were already cached.`);
    process.exit(0);
  }
}

const root = await mkdtemp(join(tmpdir(), "evergreen-public-validation-"));
const costTracker = createCostTracker();
const runStartedAt = performance.now();

try {
  const results = await runCorpusRepositories({
    entries,
    concurrency,
    checkout: async (entry, index) => {
      const checkoutStartedAt = performance.now();
      let path: string;
      if (cacheDir) {
        const cached = await ensureCorpusCacheEntry(
          cacheDir,
          entry,
          async (directory) => {
            costTracker.recordFetch(await fetchInto(directory, entry));
          },
          (existing) => isCheckoutUsable(existing, fetchStrategy),
        );
        if (cached.cached) costTracker.recordHit();
        path = cached.path;
      } else {
        path = join(root, String(index));
        costTracker.recordFetch(await fetchInto(path, entry));
      }
      return { path, checkoutMs: Number((performance.now() - checkoutStartedAt).toFixed(2)) };
    },
    onCheckout: (entry, outcome, done) => {
      console.error(progressLine(done, entries.length, entry.repository, outcome.checkoutMs));
    },
    scan: async (path) => scanWithinMemoryLimit(path, { memoryMb, timeoutSeconds: scanTimeoutSeconds }),
  });

  const thresholds = JSON.parse(await readFile(resolve("benchmarks/thresholds.json"), "utf8")) as Thresholds;
  const cost = costTracker.finish({
    wallMs: performance.now() - runStartedAt,
    checkoutMs: results.map((result) => result.checkoutMs),
  });
  const report = buildReport({
    results,
    full,
    observeOnly,
    filter: selection.description,
    shard: shardCoversEverything(shard) ? undefined : shard,
    thresholds,
    cost,
  });

  if (outputPath) await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
  if (jsonToStdout) console.log(JSON.stringify(report, null, 2));
  say(formatSummaryTables(results, report.detectors));
  // Name every mismatch so a failed run says which repository and which finding, without opening the JSON.
  for (const line of mismatchLines(results)) say(line);
  if (comparePath) {
    try {
      for (const line of compareRuns(
        { repositories: results, detectors: report.detectors, full },
        await loadBaseline(comparePath),
      ))
        say(line);
    } catch (error) {
      // A comparison problem is reported but never decides the exit code.
      console.error(error instanceof Error ? error.message : String(error));
    }
  }
  say(
    `${full ? "full run" : "filtered run"}: ${results.length} repositories, wall ${(cost.wallMs / 1000).toFixed(1)} s${outputPath ? `, report written to ${outputPath}` : ""}`,
  );
  console.error(`COST      ${formatCost(cost)}`);
  for (const slow of slowestFetches(results)) {
    console.error(`SLOWEST   ${slow.repository}@${slow.commit.slice(0, 10)}: ${(slow.checkoutMs / 1000).toFixed(1)} s`);
  }
  // A budget overrun is a warning only; it never changes the exit code.
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
  if (!observeOnly && reportFailed(report)) process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
}

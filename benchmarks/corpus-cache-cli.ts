import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import {
  assertSafeCacheDir,
  corpusCacheKey,
  listCorpusCache,
  planPrune,
  resolveCorpusCacheDir,
  type CorpusCacheListing,
} from "./corpus-cache.js";
import type { CorpusRepositoryEntry } from "./corpus-harness.js";

const megabytes = (bytes: number): string => `${(bytes / 1_000_000).toFixed(1)} MB`;

const usage = `Usage: npm run corpus:cache -- status
       npm run corpus:cache -- prune [--dry-run] [--max-size <MB> | --all]

The cache directory is EVERGREEN_CORPUS_CACHE (for example ~/.cache/evergreen-corpus).
  status             directory, entry count, total size, entries no longer in the corpus
  prune              remove entries that are no longer in the corpus
  prune --max-size   remove the least recently used entries until the cache fits
  prune --all        empty the cache
  --dry-run          print what would be removed and remove nothing`;

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

const [command, ...flags] = process.argv.slice(2);
if (command !== "status" && command !== "prune") fail(usage);

const configured = resolveCorpusCacheDir();
if (!configured) fail(`EVERGREEN_CORPUS_CACHE is not set.\n${usage}`);
let cacheDir: string;
try {
  cacheDir = assertSafeCacheDir(configured);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const corpus = JSON.parse(await readFile(resolve("benchmarks/public-repositories.json"), "utf8")) as { repositories: CorpusRepositoryEntry[] };
const currentKeys = new Set(corpus.repositories.map((entry) => corpusCacheKey(entry)));
const listings = await listCorpusCache(cacheDir);
const stale = listings.filter((entry) => !currentKeys.has(entry.name));
const total = (entries: readonly CorpusCacheListing[]): number => entries.reduce((sum, entry) => sum + entry.bytes, 0);

if (command === "status") {
  console.log(`cache directory: ${cacheDir}`);
  console.log(`entries: ${listings.length} (${megabytes(total(listings))})`);
  console.log(`not in the current corpus: ${stale.length} (${megabytes(total(stale))})`);
  for (const entry of stale) console.log(`  ${entry.name}  ${megabytes(entry.bytes)}`);
} else {
  const dryRun = flags.includes("--dry-run");
  const maxIndex = flags.indexOf("--max-size");
  const maxSizeMb = maxIndex >= 0 ? Number(flags[maxIndex + 1]) : undefined;
  if (maxSizeMb !== undefined && (!Number.isFinite(maxSizeMb) || maxSizeMb < 0)) fail("--max-size needs a number of megabytes.");
  let doomed: CorpusCacheListing[];
  try {
    doomed = planPrune(listings, currentKeys, { all: flags.includes("--all"), ...(maxSizeMb === undefined ? {} : { maxSizeMb }) });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  for (const entry of doomed) {
    console.log(`${dryRun ? "would remove" : "removing"} ${entry.name}  ${megabytes(entry.bytes)}`);
    // Only names matching the cache entry pattern reach this point, directly under the cache directory.
    if (!dryRun) await rm(entry.path, { recursive: true, force: true });
  }
  console.log(`${dryRun ? "would remove" : "removed"} ${doomed.length} of ${listings.length} entries (${megabytes(total(doomed))})`);
}

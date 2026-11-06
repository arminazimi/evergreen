// Records the fewest pinned repositories each ecosystem bucket may keep, so a pull request cannot quietly
// shrink the corpus. The goal is 200 reviewed projects per bucket (decision 0030); the committed minimum is
// the ratchet CI enforces today, and it rises as the corpus grows.
//
//   node dist/benchmarks/corpus-targets.js           # exits 1 when a bucket is below its committed minimum
//   node dist/benchmarks/corpus-targets.js --write   # records the current counts (an explicit, reviewable change)
//
// It reads local files only, uses no clock, and never uses the network.

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ecosystems } from "./candidates/profiles.js";
import { loadPublicCorpus } from "./public-corpus.js";

export const TARGETS_PATH = "benchmarks/corpus-targets.json";
export const TARGETS_SCHEMA_VERSION = "evergreen.corpus-targets.v1";
/** The reviewed-project goal per bucket in decision 0030. */
export const CORPUS_TARGET = 200;

export interface CorpusTargets {
  schemaVersion: typeof TARGETS_SCHEMA_VERSION;
  /** The growth goal per bucket; every minimum must stay at or below it. */
  target: number;
  /** The fewest pinned repositories each bucket must keep, keyed by corpus bucket name. */
  minimum: Record<string, number>;
}

export interface CorpusEntry {
  ecosystem: string;
}

/** Counts the pinned repositories in every bucket, including the buckets with no entry yet. */
export function corpusCounts(corpus: { repositories: readonly CorpusEntry[] }): Record<string, number> {
  const known = new Set<string>(ecosystems);
  const counts: Record<string, number> = Object.fromEntries(ecosystems.map((ecosystem) => [ecosystem, 0]));
  for (const entry of corpus.repositories) {
    if (!known.has(entry.ecosystem))
      throw new Error(`The corpus has an entry in "${entry.ecosystem}", which is not a corpus bucket.`);
    counts[entry.ecosystem] = (counts[entry.ecosystem] ?? 0) + 1;
  }
  return counts;
}

/** Rejects a targets file that is malformed or names an unknown bucket. */
export function validateTargets(targets: CorpusTargets): void {
  if (targets.schemaVersion !== TARGETS_SCHEMA_VERSION) {
    throw new Error(`${TARGETS_PATH} must use schemaVersion "${TARGETS_SCHEMA_VERSION}".`);
  }
  if (!Number.isInteger(targets.target) || targets.target <= 0) {
    throw new Error(`${TARGETS_PATH} must record a positive whole-number target.`);
  }
  if (targets.minimum === null || typeof targets.minimum !== "object") {
    throw new Error(`${TARGETS_PATH} must record a minimum per corpus bucket.`);
  }
  const known = new Set<string>(ecosystems);
  for (const id of Object.keys(targets.minimum)) {
    if (!known.has(id)) throw new Error(`${TARGETS_PATH} names "${id}", which is not a corpus bucket.`);
  }
  for (const id of ecosystems) {
    const minimum = targets.minimum[id];
    if (minimum === undefined) throw new Error(`${TARGETS_PATH} has no minimum for "${id}".`);
    if (!Number.isInteger(minimum) || minimum < 0) {
      throw new Error(`${TARGETS_PATH} must record a whole-number minimum for "${id}", not ${minimum}.`);
    }
  }
}

/** Every bucket below its committed minimum, as one line per drop. Growth is not a problem. */
export function targetDrops(counts: Readonly<Record<string, number>>, targets: CorpusTargets): string[] {
  const drops: string[] = [];
  for (const id of ecosystems) {
    const have = counts[id] ?? 0;
    const need = targets.minimum[id] ?? 0;
    if (have < need) drops.push(`${id}: ${have} repositories, below the minimum of ${need}`);
  }
  return drops;
}

/** The targets file that records the current counts as the new minimum. */
export function targetsFromCounts(counts: Readonly<Record<string, number>>): CorpusTargets {
  const minimum: Record<string, number> = {};
  for (const id of ecosystems) minimum[id] = counts[id] ?? 0;
  return { schemaVersion: TARGETS_SCHEMA_VERSION, target: CORPUS_TARGET, minimum };
}

/** Reads and validates the committed targets file. */
export async function loadCorpusTargets(root = "."): Promise<CorpusTargets> {
  const targets = JSON.parse(await readFile(resolve(root, TARGETS_PATH), "utf8")) as CorpusTargets;
  validateTargets(targets);
  return targets;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const counts = corpusCounts(await loadPublicCorpus());
  if (argv.includes("--write")) {
    await writeFile(resolve(TARGETS_PATH), `${JSON.stringify(targetsFromCounts(counts), null, 2)}\n`);
    console.log(`Wrote ${TARGETS_PATH}.`);
    return 0;
  }
  const targets = await loadCorpusTargets();
  const drops = targetDrops(counts, targets);
  if (drops.length === 0) return 0;
  for (const drop of drops) console.error(`TARGET  ${drop}`);
  console.error(
    `The corpus lost repositories. Restore them, or record the reduction with: node dist/benchmarks/corpus-targets.js --write`,
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();

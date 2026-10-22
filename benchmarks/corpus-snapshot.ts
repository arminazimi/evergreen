// A committed snapshot of how many findings the public corpus expects per detector. It is checked offline, so
// every pull request is gated on it: deleting or weakening a corpus expectation, which would let recall regress
// without any run noticing, fails until the snapshot is updated on purpose.
//
//   node dist/benchmarks/corpus-snapshot.js           # exits 1 when a detector expects fewer findings than the snapshot
//   node dist/benchmarks/corpus-snapshot.js --write   # records the current counts (an explicit, reviewable change)

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { detectorOf } from "./thresholds.js";

export const SNAPSHOT_PATH = "benchmarks/corpus-snapshot.json";
export const CORPUS_PATH = "benchmarks/public-repositories.json";

export interface CorpusSnapshot {
  schemaVersion: "evergreen.corpus-snapshot.v1";
  /** Expected findings per detector, and the repositories that carry them. */
  detectors: Record<string, { findings: number; repositories: number }>;
}

interface CorpusFile {
  repositories: Array<{ repository: string; expected: Array<{ ruleId: string }> }>;
}

/** Counts the corpus's expected findings per detector (named by the first segment of the rule id). */
export function snapshotFrom(corpus: CorpusFile): CorpusSnapshot {
  const counts = new Map<string, { findings: number; repositories: Set<string> }>();
  for (const entry of corpus.repositories) {
    for (const finding of entry.expected) {
      const detector = detectorOf(finding.ruleId);
      const count = counts.get(detector) ?? { findings: 0, repositories: new Set<string>() };
      count.findings += 1;
      count.repositories.add(entry.repository);
      counts.set(detector, count);
    }
  }
  return {
    schemaVersion: "evergreen.corpus-snapshot.v1",
    detectors: Object.fromEntries(
      [...counts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([detector, count]) => [detector, { findings: count.findings, repositories: count.repositories.size }]),
    ),
  };
}

/** Every detector that expects less than the snapshot recorded. Growth is not a problem; a drop must be explained. */
export function snapshotDrops(current: CorpusSnapshot, committed: CorpusSnapshot): string[] {
  const drops: string[] = [];
  for (const [detector, recorded] of Object.entries(committed.detectors)) {
    const now = current.detectors[detector] ?? { findings: 0, repositories: 0 };
    if (now.findings < recorded.findings) {
      drops.push(`${detector}: the corpus expects ${now.findings} findings, the snapshot records ${recorded.findings}`);
    } else if (now.repositories < recorded.repositories) {
      drops.push(`${detector}: the corpus covers ${now.repositories} repositories, the snapshot records ${recorded.repositories}`);
    }
  }
  return drops;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as T;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const current = snapshotFrom(await readJson<CorpusFile>(CORPUS_PATH));
  if (argv.includes("--write")) {
    await writeFile(resolve(SNAPSHOT_PATH), `${JSON.stringify(current, null, 2)}\n`);
    console.log(`Wrote ${SNAPSHOT_PATH}.`);
    return 0;
  }
  const drops = snapshotDrops(current, await readJson<CorpusSnapshot>(SNAPSHOT_PATH));
  if (drops.length === 0) return 0;
  for (const drop of drops) console.error(`SNAPSHOT  ${drop}`);
  console.error("A known finding was lost. Restore it, or record the reduction with: node dist/benchmarks/corpus-snapshot.js --write");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();

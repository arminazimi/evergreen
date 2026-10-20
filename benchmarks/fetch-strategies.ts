// Measures the corpus fetch strategies in benchmarks/corpus-fetch.ts against the current one (decision 0015).
//
//   npm run build --silent
//   node dist/benchmarks/fetch-strategies.js --strategy sparse [--concurrency 6] [--limit 10] [--baseline shallow.json] [--output sparse.json]
//
// Each run fetches every selected corpus entry cold into a fresh temporary directory, scans it, and writes the
// wall time, bytes, and per-repository findings. With --baseline it also says whether the results are identical.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { directorySize } from "./corpus-cost.js";
import { fetchWith } from "./corpus-fetch.js";
import type { FetchStrategy } from "./corpus-fetch.js";
import { inBatches, resolveCorpusConcurrency } from "./corpus-harness.js";
import type { CorpusRepositoryEntry } from "./corpus-harness.js";

interface Measurement {
  strategy: FetchStrategy;
  repositories: number;
  wallMs: number;
  bytesFetched: number;
  bytesOnDisk: number;
  perRepository: Array<{ repository: string; commit: string; fetchMs: number; bytes: number; findings: string[] }>;
}

const flag = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const strategy = (flag("--strategy") ?? "shallow") as FetchStrategy;
if (!["shallow", "sparse", "tarball"].includes(strategy)) throw new Error(`Unknown --strategy "${strategy}": use shallow, sparse, or tarball.`);
const limit = flag("--limit") === undefined ? undefined : Number(flag("--limit"));
const concurrency = resolveCorpusConcurrency();

const corpus = JSON.parse(await readFile(resolve("benchmarks/public-repositories.json"), "utf8")) as { repositories: CorpusRepositoryEntry[] };
const entries = limit === undefined ? corpus.repositories : corpus.repositories.slice(0, limit);
const root = await mkdtemp(join(tmpdir(), `evergreen-fetch-${strategy}-`));

try {
  const startedAt = performance.now();
  const fetched = await inBatches(entries, concurrency, async (entry, index) => {
    const directory = join(root, String(index));
    const begun = performance.now();
    const outcome = await fetchWith(strategy, directory, entry);
    return { directory, fetchMs: performance.now() - begun, bytes: outcome.bytes };
  });
  const wallMs = performance.now() - startedAt;

  const perRepository: Measurement["perRepository"] = [];
  let bytesOnDisk = 0;
  for (const [index, entry] of entries.entries()) {
    const item = fetched[index]!;
    const scan = await scanRepository(item.directory, builtInDetectors);
    bytesOnDisk += await directorySize(item.directory);
    perRepository.push({
      repository: entry.repository,
      commit: entry.commit,
      fetchMs: Number(item.fetchMs.toFixed(0)),
      bytes: item.bytes,
      findings: scan.findings.map((finding) => `${finding.ruleId}:${finding.location.path}:${finding.location.line ?? ""}`).sort(),
    });
  }
  const measurement: Measurement = {
    strategy,
    repositories: entries.length,
    wallMs: Number(wallMs.toFixed(0)),
    bytesFetched: perRepository.reduce((total, item) => total + item.bytes, 0),
    bytesOnDisk,
    perRepository,
  };

  const baselinePath = flag("--baseline");
  let identical: boolean | undefined;
  if (baselinePath) {
    const baseline = JSON.parse(await readFile(resolve(baselinePath), "utf8")) as Measurement;
    const byRepository = new Map(baseline.perRepository.map((item) => [item.repository, item.findings.join("\n")]));
    const differing = perRepository.filter((item) => byRepository.get(item.repository) !== item.findings.join("\n"));
    identical = differing.length === 0;
    for (const item of differing) console.error(`DIFFERENT ${item.repository}@${item.commit.slice(0, 10)}`);
    console.error(`vs ${baseline.strategy}: wall x${(baseline.wallMs / measurement.wallMs).toFixed(2)} faster, fetched x${(baseline.bytesFetched / measurement.bytesFetched).toFixed(2)} smaller, on disk x${(baseline.bytesOnDisk / measurement.bytesOnDisk).toFixed(2)} smaller, findings ${identical ? "identical" : "DIFFER"}`);
  }
  console.log(`${strategy}: ${entries.length} repositories, wall ${(measurement.wallMs / 1000).toFixed(1)} s, fetched ${(measurement.bytesFetched / 1e6).toFixed(1)} MB, on disk ${(measurement.bytesOnDisk / 1e6).toFixed(1)} MB, findings ${perRepository.reduce((total, item) => total + item.findings.length, 0)}`);
  const output = flag("--output");
  if (output) await writeFile(resolve(output), `${JSON.stringify(measurement, null, 2)}\n`);
  if (identical === false) process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
}

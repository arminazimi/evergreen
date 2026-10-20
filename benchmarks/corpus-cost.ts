import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

/** What a corpus run may cost before it prints a warning. Exceeding it never fails correctness checks. */
export interface CorpusBudget {
  /** Total wall time of the run, in seconds. */
  maxWallSeconds: number;
  /** Bytes fetched over the network; only a cold run approaches it. */
  maxFetchedBytes: number;
}

export interface CorpusCost {
  wallMs: number;
  /** Sum of every entry's checkout time; with concurrency it exceeds the wall time. */
  fetchMs: number;
  cacheHits: number;
  /** Entries fetched from the network. */
  cacheMisses: number;
  /** Size of the fetched git data (the `.git` directory); network bytes are not exposed by git. */
  bytesFetched: number;
}

export interface CorpusCostTracker {
  recordHit(): void;
  recordFetch(bytes: number): void;
  finish(input: { wallMs: number; checkoutMs: readonly number[] }): CorpusCost;
}

export function createCostTracker(): CorpusCostTracker {
  let hits = 0;
  let misses = 0;
  let bytes = 0;
  return {
    recordHit() {
      hits += 1;
    },
    recordFetch(size) {
      misses += 1;
      bytes += size;
    },
    finish({ wallMs, checkoutMs }) {
      return {
        wallMs: Number(wallMs.toFixed(2)),
        fetchMs: Number(checkoutMs.reduce((total, value) => total + value, 0).toFixed(2)),
        cacheHits: hits,
        cacheMisses: misses,
        bytesFetched: bytes,
      };
    },
  };
}

/** Total size in bytes of every file under `directory`. */
export async function directorySize(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    total += entry.isDirectory() ? await directorySize(path) : (await lstat(path)).size;
  }
  return total;
}

const megabytes = (bytes: number): string => `${(bytes / 1_000_000).toFixed(1)} MB`;

/** One warning per exceeded limit; empty when the run is within budget. */
export function budgetWarnings(cost: CorpusCost, budget: CorpusBudget): string[] {
  const warnings: string[] = [];
  if (cost.wallMs > budget.maxWallSeconds * 1000) {
    warnings.push(`wall time ${(cost.wallMs / 1000).toFixed(1)} s exceeds the budget of ${budget.maxWallSeconds} s`);
  }
  if (cost.bytesFetched > budget.maxFetchedBytes) {
    warnings.push(`fetched ${megabytes(cost.bytesFetched)} exceeds the budget of ${megabytes(budget.maxFetchedBytes)}`);
  }
  return warnings;
}

/** A readable summary of a run's cost for the terminal and the workflow job summary. */
export function formatCost(cost: CorpusCost): string {
  return `wall ${(cost.wallMs / 1000).toFixed(1)} s, fetch ${(cost.fetchMs / 1000).toFixed(1)} s (summed), cache ${cost.cacheHits} hit / ${cost.cacheMisses} miss, fetched ${megabytes(cost.bytesFetched)}`;
}

/** The `count` slowest fetches, slowest first; ties keep corpus order. */
export function slowestFetches(
  results: ReadonlyArray<{ repository: string; commit: string; checkoutMs: number }>,
  count = 5,
): Array<{ repository: string; commit: string; checkoutMs: number }> {
  return results
    .map((result, index) => ({ result, index }))
    .sort((left, right) => right.result.checkoutMs - left.result.checkoutMs || left.index - right.index)
    .slice(0, count)
    .map(({ result }) => ({ repository: result.repository, commit: result.commit, checkoutMs: result.checkoutMs }));
}

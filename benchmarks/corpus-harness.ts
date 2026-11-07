import { performance } from "node:perf_hooks";

import { findingKey } from "./thresholds.js";

// 16 halved a cold run in the measurements of decision 0015; 32 gained nothing more.
export const DEFAULT_CORPUS_CONCURRENCY = 16;

export interface CorpusExpectedFinding {
  ruleId: string;
  path: string;
  line?: number;
}

export type CorpusEcosystem =
  | "android"
  | "node"
  | "python"
  | "node-actions"
  | "container"
  | "go"
  | "java"
  | "kubernetes"
  | "php"
  | "ruby"
  | "rust"
  | "scala"
  | "dotnet"
  | "swift";

export interface CorpusRepositoryEntry {
  repository: string;
  commit: string;
  ecosystem: CorpusEcosystem;
  /** How the repository was chosen (decision 0013): "blind" by a rule fixed before scanning, "targeted" because it was known to contain a finding. */
  selection?: "blind" | "targeted";
  expected: CorpusExpectedFinding[];
}

export interface CorpusScannedFinding {
  ruleId: string;
  location: { path: string; line?: number };
}

export interface CorpusRepositoryResult {
  repository: string;
  commit: string;
  ecosystem: string;
  checkoutMs: number;
  durationMs: number;
  findings: CorpusExpectedFinding[];
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  unexpected: string[];
  missing: string[];
  /**
   * Why the repository was not analyzed, for example it exceeded the per-repository memory limit.
   * Its findings are then empty and every expected finding counts as missing, so the run fails
   * visibly instead of dropping the repository.
   */
  error?: string;
}

/** Reads `--concurrency <n>` from argv, then `EVERGREEN_CORPUS_CONCURRENCY`, else the default. */
export function resolveCorpusConcurrency(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
  fallback = DEFAULT_CORPUS_CONCURRENCY,
): number {
  const flagIndex = argv.indexOf("--concurrency");
  const fromArg = flagIndex >= 0 ? argv[flagIndex + 1] : undefined;
  const raw = fromArg ?? env.EVERGREEN_CORPUS_CONCURRENCY ?? String(fallback);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid corpus concurrency "${raw}": expected a positive integer.`);
  }
  return value;
}

/** Runs `work` over `items` with at most `size` in flight; results stay in input order. */
export async function inBatches<T, R>(
  items: readonly T[],
  size: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(size, items.length || 1)) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]!, index);
      }
    }),
  );
  return results;
}

export interface CheckoutOutcome {
  /** Where the checkout is; absent when the checkout failed and is named by `error`. */
  path?: string;
  checkoutMs: number;
  /** Why the fetch failed; the repository is reported instead of scanned or crashing the run. */
  error?: string;
}

/**
 * Fetches every repository with bounded concurrency, then scans and scores in corpus order
 * so the report shape stays identical to a sequential run. A failed fetch or scan is recorded on
 * its entry and the rest of the corpus still runs.
 */
export async function runCorpusRepositories(input: {
  entries: readonly CorpusRepositoryEntry[];
  concurrency: number;
  checkout: (entry: CorpusRepositoryEntry, index: number) => Promise<CheckoutOutcome>;
  scan: (path: string, entry: CorpusRepositoryEntry, index: number) => Promise<CorpusScannedFinding[]>;
  /** Called as each checkout finishes, with the number done so far. */
  onCheckout?: (entry: CorpusRepositoryEntry, outcome: CheckoutOutcome, done: number) => void;
}): Promise<CorpusRepositoryResult[]> {
  let done = 0;
  const checkouts = await inBatches(input.entries, input.concurrency, async (entry, index) => {
    let outcome: CheckoutOutcome;
    try {
      outcome = await input.checkout(entry, index);
    } catch (caught) {
      // A fetch that exhausts its retries must not abort the other fifteen in-flight checkouts.
      outcome = {
        checkoutMs: 0,
        error: `fetch failed: ${caught instanceof Error ? caught.message : String(caught)}`,
      };
    }
    done += 1;
    input.onCheckout?.(entry, outcome, done);
    return outcome;
  });

  const results: CorpusRepositoryResult[] = [];
  for (const [index, entry] of input.entries.entries()) {
    const prepared = checkouts[index]!;
    const startedAt = performance.now();
    let scanned: CorpusScannedFinding[] = [];
    let error = prepared.error;
    if (error === undefined) {
      try {
        scanned = await input.scan(prepared.path ?? "", entry, index);
      } catch (caught) {
        // One repository must not stop the shard: name it, score its expectations as missing, and go on.
        error = caught instanceof Error ? caught.message : String(caught);
      }
    }
    const durationMs = Number((performance.now() - startedAt).toFixed(2));
    const findings = scanned.map((finding) => ({
      ruleId: finding.ruleId,
      path: finding.location.path,
      ...(finding.location.line === undefined ? {} : { line: finding.location.line }),
    }));
    const expected = new Set(entry.expected.map(findingKey));
    const actual = new Set(findings.map(findingKey));
    results.push({
      repository: entry.repository,
      commit: entry.commit,
      ecosystem: entry.ecosystem,
      checkoutMs: prepared.checkoutMs,
      durationMs,
      findings,
      truePositives: [...actual].filter((key) => expected.has(key)).length,
      falsePositives: [...actual].filter((key) => !expected.has(key)).length,
      falseNegatives: [...expected].filter((key) => !actual.has(key)).length,
      unexpected: [...actual].filter((key) => !expected.has(key)).sort(),
      missing: [...expected].filter((key) => !actual.has(key)).sort(),
      ...(error === undefined ? {} : { error }),
    });
  }
  return results;
}

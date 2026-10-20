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
  path: string;
  checkoutMs: number;
}

/**
 * Fetches every repository with bounded concurrency, then scans and scores in corpus order
 * so the report shape stays identical to a sequential run.
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
    const outcome = await input.checkout(entry, index);
    done += 1;
    input.onCheckout?.(entry, outcome, done);
    return outcome;
  });

  const results: CorpusRepositoryResult[] = [];
  for (const [index, entry] of input.entries.entries()) {
    const prepared = checkouts[index]!;
    const startedAt = performance.now();
    const scanned = await input.scan(prepared.path, entry, index);
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
    });
  }
  return results;
}

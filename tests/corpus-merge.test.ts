import assert from "node:assert/strict";
import { test } from "node:test";

import type { CorpusRepositoryEntry } from "../benchmarks/corpus-harness.js";
import { mergeShardReports } from "../benchmarks/corpus-merge.js";
import { buildReport } from "../benchmarks/corpus-result.js";
import type { CorpusReport } from "../benchmarks/corpus-result.js";
import type { Thresholds } from "../benchmarks/thresholds.js";

const commit = "a".repeat(40);

const thresholds: Thresholds = {
  schemaVersion: "evergreen.corpus-thresholds.v1",
  budget: { maxWallSeconds: 100, maxFetchedBytes: 100_000_000 },
  detectors: { npm: { level: "stable", stable: true, minPrecision: 0.95 } },
};

const corpus: CorpusRepositoryEntry[] = ["a/one", "b/two", "c/three"].map((repository) => ({
  repository,
  commit,
  ecosystem: "node",
  expected: [{ ruleId: "npm.example", path: "package.json", line: 1 }],
  selection: "blind",
}));

function result(repository: string) {
  return {
    repository,
    commit,
    ecosystem: "node",
    checkoutMs: 1,
    durationMs: 2,
    findings: [{ ruleId: "npm.example", path: "package.json", line: 1 }],
    truePositives: 1,
    falsePositives: 0,
    falseNegatives: 0,
    unexpected: [],
    missing: [],
  };
}

function shard(
  index: number,
  repositories: string[],
  overrides: Partial<Parameters<typeof buildReport>[0]> = {},
): CorpusReport {
  return buildReport({
    results: repositories.map(result),
    full: false,
    observeOnly: false,
    shard: { index, count: 2 },
    thresholds,
    cost: { wallMs: 4000, fetchMs: 0, cacheHits: 1, cacheMisses: 0, bytesFetched: 60_000_000 },
    ...overrides,
  });
}

test("two shards merge into one full run in corpus order", () => {
  // Shard 1 holds the first and last corpus entries; shard 2 the middle one.
  const merged = mergeShardReports({
    reports: [shard(1, ["a/one", "c/three"]), shard(2, ["b/two"])],
    corpus,
    thresholds,
  });
  assert.equal(merged.fullRun, true);
  assert.equal(merged.filter, undefined);
  assert.equal(merged.shard, undefined);
  assert.deepEqual(
    merged.repositories.map((entry) => entry.repository),
    ["a/one", "b/two", "c/three"],
  );
  assert.equal(merged.summary.repositoryCount, 3);
  assert.equal(merged.summary.truePositives, 3);
  assert.equal(merged.summary.falsePositives, 0);
  assert.equal(merged.summary.falseNegatives, 0);
  assert.equal(merged.summary.scanErrors, 0);
  // The budget is per shard: 120 MB across two shards is within 2 × 100 MB.
  assert.deepEqual(merged.budgetWarnings, []);
  // Wall time is the slowest shard, not the sum.
  assert.equal(merged.cost.wallMs, 4000);
  assert.equal(merged.cost.bytesFetched, 120_000_000);
});

test("the merge refuses anything that is not the complete verify-mode shard set", () => {
  const input = (reports: CorpusReport[], entries = corpus) => ({ reports, corpus: entries, thresholds });
  assert.throws(
    () => mergeShardReports(input([shard(1, ["a/one", "b/two", "c/three"])])),
    /one report is not a sharded run/,
  );
  assert.throws(
    () => mergeShardReports(input([shard(1, ["a/one"]), shard(1, ["b/two", "c/three"])])),
    /shard 1 appears twice/,
  );
  assert.throws(
    () => mergeShardReports(input([shard(1, ["a/one"]), shard(2, ["b/two", "a/one"])])),
    /a\/one appears in two shards/,
  );
  assert.throws(() => mergeShardReports(input([shard(1, ["a/one"]), shard(2, ["b/two"])])), /Missing:\nc\/three/);
  assert.throws(
    () => mergeShardReports(input([shard(1, ["a/one", "c/three"]), shard(2, ["b/two"])], corpus.slice(0, 2))),
    /not in the corpus/,
  );
  assert.throws(
    () =>
      mergeShardReports(
        input([
          shard(1, ["a/one", "c/three"]),
          buildReport({
            results: [{ ...result("b/two"), commit: "b".repeat(40) }],
            full: false,
            observeOnly: false,
            shard: { index: 2, count: 2 },
            thresholds,
            cost: { wallMs: 1, fetchMs: 0, cacheHits: 0, cacheMisses: 0, bytesFetched: 0 },
          }),
        ]),
      ),
    /but the corpus pins/,
  );
});

test("the merge refuses filtered, observe-mode, whole-run, and mismatched-count reports", () => {
  const base = shard(1, ["a/one", "c/three"]);
  const other = shard(2, ["b/two"]);
  const withReport = (report: CorpusReport): CorpusReport[] => [report, other];
  assert.throws(
    () => mergeShardReports({ reports: withReport({ ...base, filter: "FILTERED RUN" }), corpus, thresholds }),
    /filtered run is not a full run/,
  );
  assert.throws(
    () => mergeShardReports({ reports: withReport({ ...base, mode: "observe" }), corpus, thresholds }),
    /verify mode/,
  );
  assert.throws(
    () => mergeShardReports({ reports: withReport({ ...base, fullRun: true }), corpus, thresholds }),
    /must not claim to be a full run/,
  );
  assert.throws(
    () => mergeShardReports({ reports: withReport({ ...base, shard: { index: 1, count: 3 } }), corpus, thresholds }),
    /shard counts differ/,
  );
  assert.throws(() => {
    const { shard: _ignored, ...withoutShard } = other;
    return mergeShardReports({ reports: [base, withoutShard], corpus, thresholds });
  }, /has no shard field/);
  assert.throws(
    () =>
      mergeShardReports({
        reports: [
          { ...base, shard: { index: 1, count: 3 } },
          { ...other, shard: { index: 3, count: 3 } },
        ],
        corpus,
        thresholds,
      }),
    /expected shards 1\.\.3/,
  );
});

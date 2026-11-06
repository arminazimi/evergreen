import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  budgetWarnings,
  combineCosts,
  createCostTracker,
  directorySize,
  formatCost,
  slowestFetches,
} from "../benchmarks/corpus-cost.js";
import type { Thresholds } from "../benchmarks/thresholds.js";
import { readFile } from "node:fs/promises";

const budget = { maxWallSeconds: 60, maxFetchedBytes: 1_000_000 };

test("the tracker counts hits, misses, and bytes and sums checkout time", () => {
  const tracker = createCostTracker();
  tracker.recordHit();
  tracker.recordFetch(400);
  tracker.recordFetch(600);
  const cost = tracker.finish({ wallMs: 5000, checkoutMs: [1000, 2000, 3000] });
  assert.deepEqual(cost, { wallMs: 5000, fetchMs: 6000, cacheHits: 1, cacheMisses: 2, bytesFetched: 1000 });
  assert.match(formatCost(cost), /wall 5\.0 s.*1 hit \/ 2 miss/);
});

test("a run within budget has no warnings; each exceeded limit warns once", () => {
  const within = { wallMs: 60_000, fetchMs: 0, cacheHits: 0, cacheMisses: 1, bytesFetched: 1_000_000 };
  assert.deepEqual(budgetWarnings(within, budget), []);
  const over = { ...within, wallMs: 61_000, bytesFetched: 2_500_000 };
  const warnings = budgetWarnings(over, budget);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0]!, /wall time 61\.0 s exceeds the budget of 60 s/);
  assert.match(warnings[1]!, /fetched 2\.5 MB exceeds the budget of 1\.0 MB/);
});

test("a merged run scales the fetched-byte limit by the shard count but keeps the wall limit per shard", () => {
  const cost = { wallMs: 61_000, fetchMs: 0, cacheHits: 0, cacheMisses: 2, bytesFetched: 1_500_000 };
  // 1.5 MB across two shards fits two 1 MB budgets, but the slowest shard still breaks the wall limit.
  assert.deepEqual(budgetWarnings(cost, budget, { fetchedMultiplier: 2 }), [
    "wall time 61.0 s exceeds the budget of 60 s",
  ]);
  assert.deepEqual(budgetWarnings(cost, budget), [
    "wall time 61.0 s exceeds the budget of 60 s",
    "fetched 1.5 MB exceeds the budget of 1.0 MB",
  ]);
});

test("shard costs add up except for wall time, which is the slowest shard", () => {
  const combined = combineCosts([
    { wallMs: 9000, fetchMs: 1000.5, cacheHits: 3, cacheMisses: 1, bytesFetched: 100 },
    { wallMs: 12000, fetchMs: 2000.25, cacheHits: 4, cacheMisses: 2, bytesFetched: 200 },
  ]);
  assert.deepEqual(combined, { wallMs: 12000, fetchMs: 3000.75, cacheHits: 7, cacheMisses: 3, bytesFetched: 300 });
  assert.deepEqual(combineCosts([]), { wallMs: 0, fetchMs: 0, cacheHits: 0, cacheMisses: 0, bytesFetched: 0 });
});

test("directorySize sums nested files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "evergreen-size-"));
  try {
    await mkdir(join(dir, "a", "b"), { recursive: true });
    await writeFile(join(dir, "x"), "12345");
    await writeFile(join(dir, "a", "b", "y"), "123");
    assert.equal(await directorySize(dir), 8);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("thresholds.json documents a positive budget", async () => {
  const thresholds = JSON.parse(await readFile("benchmarks/thresholds.json", "utf8")) as Thresholds;
  assert.ok(thresholds.budget && thresholds.budget.maxWallSeconds > 0 && thresholds.budget.maxFetchedBytes > 0);
});

test("slowestFetches lists the slowest entries first, keeping corpus order on ties", () => {
  const results = ["a", "b", "c", "d"].map((name, index) => ({
    repository: `o/${name}`,
    commit: "f".repeat(40),
    checkoutMs: [100, 900, 900, 5][index]!,
  }));
  assert.deepEqual(
    slowestFetches(results, 3).map((entry) => entry.repository),
    ["o/b", "o/c", "o/a"],
  );
  assert.equal(slowestFetches(results).length, 4);
});

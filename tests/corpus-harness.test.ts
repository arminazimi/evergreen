import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_CORPUS_CONCURRENCY,
  inBatches,
  resolveCorpusConcurrency,
  runCorpusRepositories,
  type CorpusRepositoryEntry,
} from "../benchmarks/corpus-harness.js";

function entry(repository: string, expected: CorpusRepositoryEntry["expected"] = []): CorpusRepositoryEntry {
  return {
    repository,
    commit: "a".repeat(40),
    ecosystem: "node",
    expected,
  };
}

test("resolveCorpusConcurrency prefers --concurrency, then the env var, then the default", () => {
  assert.equal(resolveCorpusConcurrency(["node", "script"], {}), DEFAULT_CORPUS_CONCURRENCY);
  assert.equal(resolveCorpusConcurrency(["node", "script"], { EVERGREEN_CORPUS_CONCURRENCY: "4" }), 4);
  assert.equal(resolveCorpusConcurrency(["node", "script", "--concurrency", "8"], { EVERGREEN_CORPUS_CONCURRENCY: "4" }), 8);
  assert.throws(() => resolveCorpusConcurrency(["node", "script", "--concurrency", "0"], {}), /positive integer/);
  assert.throws(() => resolveCorpusConcurrency(["node", "script"], { EVERGREEN_CORPUS_CONCURRENCY: "nope" }), /positive integer/);
});

test("inBatches keeps input order and never exceeds the concurrency bound", async () => {
  let running = 0;
  let peak = 0;
  const results = await inBatches([0, 1, 2, 3, 4, 5], 2, async (item) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 20 - item));
    running--;
    return item * 10;
  });
  assert.deepEqual(results, [0, 10, 20, 30, 40, 50]);
  assert.ok(peak <= 2, `peak concurrency ${peak}`);
});

test("runCorpusRepositories fetches concurrently but reports in corpus order", async () => {
  const entries = [entry("a/one"), entry("b/two"), entry("c/three"), entry("d/four")];
  let running = 0;
  let peak = 0;
  const checkoutOrder: string[] = [];
  const scanOrder: string[] = [];

  const results = await runCorpusRepositories({
    entries,
    concurrency: 2,
    checkout: async (item) => {
      checkoutOrder.push(item.repository);
      running++;
      peak = Math.max(peak, running);
      // Finish later checkouts first so completion order differs from corpus order.
      const delay = item.repository === "a/one" ? 40 : item.repository === "b/two" ? 30 : 5;
      await new Promise((resolve) => setTimeout(resolve, delay));
      running--;
      return { path: `/tmp/${item.repository}`, checkoutMs: delay };
    },
    scan: async (path, item) => {
      scanOrder.push(item.repository);
      assert.equal(path, `/tmp/${item.repository}`);
      return [{ ruleId: `${item.repository}.rule`, location: { path: "package.json", line: 1 } }];
    },
  });

  assert.ok(peak <= 2, `peak concurrency ${peak}`);
  assert.deepEqual(
    results.map((result) => result.repository),
    ["a/one", "b/two", "c/three", "d/four"],
  );
  assert.deepEqual(scanOrder, ["a/one", "b/two", "c/three", "d/four"]);
  assert.deepEqual(
    results.map((result) => result.findings),
    [
      [{ ruleId: "a/one.rule", path: "package.json", line: 1 }],
      [{ ruleId: "b/two.rule", path: "package.json", line: 1 }],
      [{ ruleId: "c/three.rule", path: "package.json", line: 1 }],
      [{ ruleId: "d/four.rule", path: "package.json", line: 1 }],
    ],
  );
  assert.equal(new Set(checkoutOrder).size, 4);
});

test("runCorpusRepositories scores true positives against expected findings", async () => {
  const results = await runCorpusRepositories({
    entries: [
      entry("owner/repo", [{ ruleId: "npm.package.request.deprecated", path: "package.json", line: 12 }]),
    ],
    concurrency: 1,
    checkout: async () => ({ path: "/tmp/repo", checkoutMs: 1 }),
    scan: async () => [{ ruleId: "npm.package.request.deprecated", location: { path: "package.json", line: 12 } }],
  });
  assert.equal(results[0]?.truePositives, 1);
  assert.equal(results[0]?.falsePositives, 0);
  assert.equal(results[0]?.falseNegatives, 0);
});

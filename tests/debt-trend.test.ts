import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MAX_BASELINE_HISTORY, appendHistory, createBaseline, debtTrendLine, readBaseline, writeBaseline } from "../src/baseline.js";
import type { Finding, ScanResult } from "../src/domain.js";

function scanWith(count: number): ScanResult {
  const findings = Array.from({ length: count }, (_, index) => ({
    id: `f${index}`,
    ruleId: "rule",
    summary: `finding ${index}`,
    location: { path: `file${index}.json` },
  }) as unknown as Finding);
  return { root: "/repo", findings, diagnostics: [] } as unknown as ScanResult;
}

test("a first baseline has no history unless it replaces an earlier one", () => {
  assert.equal(createBaseline(scanWith(2)).history, undefined);
});

test("history carries forward, sorted, with the change since the last entry", () => {
  const first = createBaseline(scanWith(3), {}, { schemaVersion: "evergreen.baseline.v1", createdAt: "", findings: [] });
  assert.deepEqual(first.history?.map((entry) => entry.count), [3]);
  assert.equal(debtTrendLine(first.history!), "No earlier baseline to compare with.");

  const second = createBaseline(scanWith(1), {}, first);
  assert.deepEqual(second.history?.map((entry) => entry.count), [3, 1]);
  assert.match(debtTrendLine(second.history!), /Debt fell by 2 \(3 to 1\).*better/);
  assert.match(debtTrendLine(appendHistory(second.history, { at: "2999-01-01T00:00:00.000Z", count: 4 })), /Debt rose by 3 \(1 to 4\).*worse/);
  assert.match(debtTrendLine(appendHistory(second.history, { at: "2999-01-01T00:00:00.000Z", count: 1 })), /Debt is unchanged at 1/);
});

test("an older baseline without history seeds the first entry", () => {
  const old = { schemaVersion: "evergreen.baseline.v1" as const, createdAt: "2026-01-01T00:00:00.000Z", findings: createBaseline(scanWith(5)).findings };
  const next = createBaseline(scanWith(4), {}, old);
  assert.equal(next.history?.length, 2);
  assert.deepEqual(next.history?.[0], { at: "2026-01-01T00:00:00.000Z", count: 5 });
});

test("history stays bounded and sorted, and drops malformed entries", () => {
  let history = appendHistory(undefined, { at: "2030-01-01T00:00:00.000Z", count: 1 });
  for (let day = 0; day < MAX_BASELINE_HISTORY + 20; day += 1) {
    history = appendHistory(history, { at: new Date(Date.UTC(2026, 0, 1 + day)).toISOString(), count: day });
  }
  assert.equal(history.length, MAX_BASELINE_HISTORY);
  assert.deepEqual(history, [...history].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)));
  assert.equal(history.at(-1)?.at, "2030-01-01T00:00:00.000Z");
  const cleaned = appendHistory([{ at: "nope", count: 1 }, { at: "2026-01-01T00:00:00.000Z", count: -1 }] as never, { at: "2026-02-01T00:00:00.000Z", count: 2 });
  assert.deepEqual(cleaned, [{ at: "2026-02-01T00:00:00.000Z", count: 2 }]);
});

test("history survives a write and read, and old files still load", async () => {
  const dir = await mkdtemp(join(tmpdir(), "evergreen-trend-"));
  const path = join(dir, "baseline.json");
  const baseline = createBaseline(scanWith(2), {}, { schemaVersion: "evergreen.baseline.v1", createdAt: "", findings: [] });
  await writeBaseline(path, baseline);
  assert.deepEqual((await readBaseline(path)).history, baseline.history);
  await writeFile(path, JSON.stringify({ ...baseline, history: undefined }));
  assert.equal((await readBaseline(path)).history, undefined);
  assert.ok((await readFile(path, "utf8")).length > 0);
});

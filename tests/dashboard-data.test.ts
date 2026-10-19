import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { countEvidence, earnedLevel } from "../benchmarks/thresholds.js";
import type { Thresholds } from "../benchmarks/thresholds.js";
import {
  ageInDays,
  buildDashboardData,
  detectorCounts,
  detectorEcosystems,
  renderDashboardData,
  OUTPUT_FILE,
} from "../tools/build-dashboard-data.js";
import type { CorpusRepository } from "../tools/build-dashboard-data.js";

const execute = promisify(execFile);
const script = resolve("dist/tools/build-dashboard-data.js");
const thresholds = JSON.parse(await readFile(resolve("benchmarks/thresholds.json"), "utf8")) as Thresholds;
const corpus = (JSON.parse(await readFile(resolve("benchmarks/public-repositories.json"), "utf8")) as { repositories: CorpusRepository[] })
  .repositories;
const runDate = thresholds.lastFullRun!.date;
const build = (today = runDate) => buildDashboardData({ thresholds, corpus, today });

test("every detector in thresholds.json has a row, with the configured level next to the earned level", () => {
  const data = build();
  assert.deepEqual(data.detectors.map((detector) => detector.id), Object.keys(thresholds.detectors).sort());
  for (const detector of data.detectors) {
    const configured = thresholds.detectors[detector.id]!;
    assert.equal(detector.level, configured.level);
    assert.deepEqual(detector.precisionFloor, { value: configured.minPrecision, enforced: configured.stable });
    const evidence = countEvidence(corpus, detector.id, detectorEcosystems[detector.id]!);
    assert.deepEqual(detector.evidence, evidence);
    assert.equal(detector.earnedLevel, earnedLevel(evidence));
  }
  assert.ok(data.detectors.some((detector) => detector.level !== detector.earnedLevel), "the real data has a gap between configured and earned");
});

test("counts, precision, and recall are the lastFullRun numbers on the real file", () => {
  const data = build();
  const last = thresholds.lastFullRun!;
  assert.deepEqual(data.run, {
    date: last.date,
    commit: last.commit,
    repositories: last.repositories,
    findings: last.findings,
    runAgeDays: 0,
    recordedPrecision: last.precision,
    recordedRecall: last.recall,
    timing: { medianScanMs: null, p95ScanMs: null, note: "not measured" },
  });
  for (const detector of data.detectors) {
    const counts = last.perDetector[detector.id];
    assert.deepEqual(detector.run, counts ? detectorCounts(counts) : null);
  }
  assert.equal(data.detectors.find((detector) => detector.id === "ruby")!.run, null);
  const total = data.detectors.reduce((sum, detector) => sum + (detector.run?.truePositives ?? 0) + (detector.run?.falsePositives ?? 0), 0);
  assert.equal(total, last.findings);
  assert.equal(data.corpus.repositories, corpus.length);
  assert.equal(data.corpus.repositories, last.repositories);
});

test("the evidence counts agree with the table in ADR 0013", () => {
  const evidence = Object.fromEntries(build().detectors.map((detector) => [detector.id, detector.evidence]));
  assert.deepEqual(evidence["github-actions"], { repositoriesWithFindings: 31, expectedFindings: 201, zeroFindingRepositories: 2 });
  assert.deepEqual(evidence["npm"], { repositoriesWithFindings: 8, expectedFindings: 10, zeroFindingRepositories: 8 });
});

test("a detector with no run data has null run numbers, not zeros", () => {
  const { perDetector, ...rest } = thresholds.lastFullRun!;
  const { rust: _removed, ...others } = perDetector;
  const data = buildDashboardData({ thresholds: { ...thresholds, lastFullRun: { ...rest, perDetector: others } }, corpus, today: runDate });
  assert.equal(data.detectors.find((detector) => detector.id === "rust")!.run, null);
  assert.notEqual(data.detectors.find((detector) => detector.id === "go")!.run, null);
});

test("with no recorded run there is no run block and every detector has no run numbers", () => {
  const { lastFullRun: _dropped, ...withoutRun } = thresholds;
  const data = buildDashboardData({ thresholds: withoutRun, corpus, today: runDate });
  assert.equal(data.run, null);
  assert.ok(data.detectors.every((detector) => detector.run === null));
  assert.throws(() => buildDashboardData({ thresholds: withoutRun, corpus, today: "nope" }), /--today/);
});

test("a zero denominator gives null, never 0, 1, or NaN", () => {
  assert.deepEqual(detectorCounts({ truePositives: 0, falsePositives: 0, falseNegatives: 0 }), {
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
    precision: null,
    recall: null,
  });
  const onlyMisses = detectorCounts({ truePositives: 0, falsePositives: 0, falseNegatives: 4 });
  assert.equal(onlyMisses.precision, null);
  assert.equal(onlyMisses.recall, 0);
  const onlyExtras = detectorCounts({ truePositives: 0, falsePositives: 3, falseNegatives: 0 });
  assert.equal(onlyExtras.precision, 0);
  assert.equal(onlyExtras.recall, null);
  const mixed = detectorCounts({ truePositives: 9, falsePositives: 1, falseNegatives: 3 });
  assert.equal(mixed.precision, 0.9);
  assert.equal(mixed.recall, 0.75);
  assert.equal(detectorCounts({ truePositives: 1, falsePositives: 0, falseNegatives: 2 }).recall, 0.3333);
});

test("runAgeDays comes from --today, and invalid days are refused", () => {
  assert.equal(ageInDays("2026-10-18", "2026-10-18"), 0);
  assert.equal(ageInDays("2026-10-18", "2026-11-01"), 14);
  assert.equal(ageInDays("2026-02-27", "2026-03-01"), 2);
  assert.equal(ageInDays("2027-12-25", "2028-03-01"), 67);
  assert.equal(build("2026-11-15").run!.runAgeDays, 28);
  assert.equal(build("2026-11-15").referenceDay, "2026-11-15");
  assert.throws(() => ageInDays("2026-10-18", "2026-10-17"), /before the last full run/);
  for (const bad of ["2026-13-01", "2026-02-30", "18-10-2026", "2026-10-18T00:00:00Z", "", "today"]) {
    assert.throws(() => ageInDays("2026-10-18", bad), /YYYY-MM-DD/, bad);
  }
});

test("the same inputs give the same bytes, whatever the clock", async () => {
  const first = await renderDashboardData(".", runDate);
  const originalNow = Date.now;
  Date.now = () => 0;
  try {
    assert.equal(await renderDashboardData(".", runDate), first);
  } finally {
    Date.now = originalNow;
  }
  assert.equal(await renderDashboardData(".", "run-date"), first);
  assert.notEqual(await renderDashboardData(".", "2027-01-01"), first);
  assert.ok(first.endsWith("}\n") && !first.includes("\r"));
});

test("the definitions cover every metric, name a committed source, and the limitations are stated plainly", async () => {
  const data = build();
  const keys = ["level", "earnedLevel", "precisionFloor", "precision", "recall", "truePositives", "falsePositives", "falseNegatives", "repositoriesWithFindings", "expectedFindings", "zeroFindingRepositories", "runAge", "scanTime"];
  assert.deepEqual(Object.keys(data.definitions), keys);
  for (const [key, definition] of Object.entries(data.definitions)) {
    assert.ok(definition.label && definition.meaning && definition.computation, key);
    await readFile(resolve(definition.source), "utf8");
  }
  assert.equal(
    data.limitations[0],
    "A precision of 1.0 means no regression against this corpus. The expected findings were written by reviewing the same commits, so it does not show that the detectors generalize to unseen repositories. See ADR 0013 and issue #740.",
  );
  assert.ok(data.limitations.some((line) => line.includes("Scan time is not measured")));
  assert.doesNotMatch(JSON.stringify(data), /medianScanMs":\s*\d/);
});

test("the tool requires --today and refuses a malformed one", async () => {
  await assert.rejects(execute(process.execPath, [script, "--check"]), (error: { stderr: string }) => /--today is required/.test(error.stderr));
  await assert.rejects(execute(process.execPath, [script, "--today"]), (error: { stderr: string }) => /--today is required/.test(error.stderr));
  await assert.rejects(execute(process.execPath, [script, "--today", "tomorrow", "--check"]), (error: { stderr: string }) => /YYYY-MM-DD/.test(error.stderr));
});

test("docs/dashboard/data.json is up to date, built with the last run's date as the reference day (CI fails on drift)", async () => {
  const committed = await readFile(resolve(OUTPUT_FILE), "utf8");
  assert.equal(committed, await renderDashboardData(".", "run-date"), "run: npm run build:dashboard");
  assert.equal((JSON.parse(committed) as { referenceDay: string }).referenceDay, runDate);
  await execute(process.execPath, [script, "--today", "run-date", "--check"]);
});

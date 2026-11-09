import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { loadPublicCorpus } from "../benchmarks/public-corpus.js";
import { TARGETS_PATH } from "../benchmarks/corpus-targets.js";
import type { CorpusTargets } from "../benchmarks/corpus-targets.js";
import { countEvidence, detectorOf, earnedLevel } from "../benchmarks/thresholds.js";
import type { Thresholds } from "../benchmarks/thresholds.js";
import {
  ageInDays,
  buildDashboardData,
  detectorCounts,
  detectorEcosystems,
  isWellFormedDashboardData,
  renderDashboardData,
  OUTPUT_FILE,
} from "../tools/build-dashboard-data.js";

const execute = promisify(execFile);
const script = resolve("dist/tools/build-dashboard-data.js");
const thresholds = JSON.parse(await readFile(resolve("benchmarks/thresholds.json"), "utf8")) as Thresholds;
const targets = JSON.parse(await readFile(resolve(TARGETS_PATH), "utf8")) as CorpusTargets;
const corpus = (await loadPublicCorpus()).repositories;
const runDate = thresholds.lastFullRun!.date;
const build = (today = runDate) => buildDashboardData({ thresholds, corpus, targets, today });

test("every detector in thresholds.json has a row, with the configured level next to the earned level", () => {
  const data = build();
  assert.deepEqual(
    data.detectors.map((detector) => detector.id),
    Object.keys(thresholds.detectors).sort(),
  );
  for (const detector of data.detectors) {
    const configured = thresholds.detectors[detector.id]!;
    assert.equal(detector.level, configured.level);
    assert.deepEqual(detector.precisionFloor, { value: configured.minPrecision, enforced: configured.stable });
    const evidence = countEvidence(corpus, detector.id, detectorEcosystems[detector.id]!);
    assert.deepEqual(detector.evidence, evidence);
    assert.equal(detector.earnedLevel, earnedLevel(evidence));
  }
  // After #1894 every detector's configured level matches the evidence it earns. Gaps remain
  // allowed in principle (grandfathered Supported, or an under-promoted beta); none are open today.
  assert.deepEqual(
    data.detectors.filter((detector) => detector.level !== detector.earnedLevel).map((detector) => detector.id),
    [],
  );
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
  assert.deepEqual(
    data.detectors.find((detector) => detector.id === "ruby")!.run,
    detectorCounts(last.perDetector.ruby!),
  );
  const total = data.detectors.reduce(
    (sum, detector) => sum + (detector.run?.truePositives ?? 0) + (detector.run?.falsePositives ?? 0),
    0,
  );
  assert.equal(total, last.findings);
  assert.equal(data.corpus.repositories, corpus.length);
  assert.ok(data.corpus.repositories >= last.repositories);
});

// The expected counts are recomputed from the per-repository files on disk, not typed in here. A
// literal count would be rewritten by every corpus or promotion task and conflict between them.
async function rawEvidence(detector: string, ecosystems: readonly string[]) {
  const root = resolve("benchmarks/public-repositories");
  const withFindings = new Set<string>();
  let expectedFindings = 0;
  let zeroFindingRepositories = 0;
  for (const bucket of await readdir(root, { withFileTypes: true })) {
    if (!bucket.isDirectory()) continue;
    for (const file of await readdir(resolve(root, bucket.name))) {
      if (!file.endsWith(".json")) continue;
      const entry = JSON.parse(await readFile(resolve(root, bucket.name, file), "utf8")) as {
        repository: string;
        expected: Array<{ ruleId: string }>;
      };
      const own = entry.expected.filter((finding) => detectorOf(finding.ruleId) === detector);
      if (own.length > 0) {
        withFindings.add(entry.repository);
        expectedFindings += own.length;
      }
      if (ecosystems.includes(bucket.name) && entry.expected.length === 0) zeroFindingRepositories += 1;
    }
  }
  return { repositoriesWithFindings: withFindings.size, expectedFindings, zeroFindingRepositories };
}

test("the evidence counts agree with the reviewed corpus files", async () => {
  for (const detector of build().detectors) {
    const { repositoriesWithFindings, expectedFindings, zeroFindingRepositories } = detector.evidence;
    assert.deepEqual(
      { repositoriesWithFindings, expectedFindings, zeroFindingRepositories },
      await rawEvidence(detector.id, detectorEcosystems[detector.id]!),
      detector.id,
    );
  }
});

test("the corpus section counts every bucket and carries its committed minimum and target", () => {
  const data = build();
  assert.equal(data.corpus.ecosystems.length, Object.keys(targets.minimum).length);
  assert.equal(
    data.corpus.ecosystems.reduce((sum, ecosystem) => sum + ecosystem.repositories, 0),
    corpus.length,
  );
  for (const ecosystem of data.corpus.ecosystems) {
    assert.equal(ecosystem.repositories, corpus.filter((entry) => entry.ecosystem === ecosystem.id).length);
    assert.equal(ecosystem.minimum, targets.minimum[ecosystem.id]);
    assert.equal(ecosystem.target, targets.target);
    assert.ok(ecosystem.repositories >= ecosystem.minimum, `${ecosystem.id} is below its minimum`);
  }
});

test("a detector with no run data has null run numbers, not zeros", () => {
  const { perDetector, ...rest } = thresholds.lastFullRun!;
  const { rust: _removed, ...others } = perDetector;
  const data = buildDashboardData({
    thresholds: { ...thresholds, lastFullRun: { ...rest, perDetector: others } },
    corpus,
    targets,
    today: runDate,
  });
  assert.equal(data.detectors.find((detector) => detector.id === "rust")!.run, null);
  assert.notEqual(data.detectors.find((detector) => detector.id === "go")!.run, null);
});

test("with no recorded run there is no run block and every detector has no run numbers", () => {
  const { lastFullRun: _dropped, ...withoutRun } = thresholds;
  const data = buildDashboardData({ thresholds: withoutRun, corpus, targets, today: runDate });
  assert.equal(data.run, null);
  assert.ok(data.detectors.every((detector) => detector.run === null));
  assert.throws(() => buildDashboardData({ thresholds: withoutRun, corpus, targets, today: "nope" }), /--today/);
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
  // Derived from the recorded run, so recording a newer run does not break this test.
  const later = new Date(Date.parse(`${runDate}T00:00:00Z`) + 27 * 86_400_000).toISOString().slice(0, 10);
  assert.equal(build(later).run!.runAgeDays, 27);
  assert.equal(build(later).referenceDay, later);
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
  const keys = [
    "level",
    "earnedLevel",
    "precisionFloor",
    "precision",
    "recall",
    "truePositives",
    "falsePositives",
    "falseNegatives",
    "repositoriesWithFindings",
    "expectedFindings",
    "zeroFindingRepositories",
    "runAge",
    "scanTime",
    "corpusRepositories",
    "corpusMinimum",
    "corpusTarget",
  ];
  assert.deepEqual(Object.keys(data.definitions), keys);
  for (const [key, definition] of Object.entries(data.definitions)) {
    assert.ok(definition.label && definition.meaning && definition.computation, key);
    const source = await stat(resolve(definition.source));
    assert.ok(source.isFile() || source.isDirectory(), `${key} source ${definition.source}`);
  }
  assert.equal(
    data.limitations[0],
    "A precision of 1.0 means no regression against this corpus. The expected findings were written by reviewing the same commits, so it does not show that the detectors generalize to unseen repositories. See ADR 0013 and issue #740.",
  );
  assert.ok(data.limitations.some((line) => line.includes("Scan time is not measured")));
  assert.doesNotMatch(JSON.stringify(data), /medianScanMs":\s*\d/);
});

test("the tool requires --today and refuses a malformed one", async () => {
  await assert.rejects(execute(process.execPath, [script, "--check"]), (error: { stderr: string }) =>
    /--today is required/.test(error.stderr),
  );
  await assert.rejects(execute(process.execPath, [script, "--today"]), (error: { stderr: string }) =>
    /--today is required/.test(error.stderr),
  );
  await assert.rejects(
    execute(process.execPath, [script, "--today", "tomorrow", "--check"]),
    (error: { stderr: string }) => /YYYY-MM-DD/.test(error.stderr),
  );
});

test("docs/dashboard/data.json is buildable with the last run's date as the reference day (CI fails when it is not)", async () => {
  const rendered = await renderDashboardData(".", "run-date");
  assert.ok(isWellFormedDashboardData(rendered, runDate));
  assert.equal((JSON.parse(rendered) as { referenceDay: string }).referenceDay, runDate);
  assert.equal(OUTPUT_FILE, "docs/dashboard/data.json");
  await execute(process.execPath, [script, "--today", "run-date", "--check"]);
});

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { compareRuns, loadBaseline, parseComparePath } from "../benchmarks/corpus-compare.js";
import { scoreDetectors } from "../benchmarks/thresholds.js";
import type { Baseline } from "../benchmarks/corpus-compare.js";

const finding = (ruleId: string, line: number) => ({ ruleId, path: "package.json", line });
const key = (ruleId: string, line: number) => `${ruleId}:package.json:${line}`;
const commit = "c".repeat(40);

function repo(repository: string, findings: ReturnType<typeof finding>[], unexpected: string[] = [], missing: string[] = []) {
  return { repository, commit, findings, unexpected, missing };
}

const earlier: Baseline = {
  kind: "report",
  path: "old.json",
  repositories: [
    repo("o/a", [finding("npm.package.request.deprecated", 3), finding("nodejs.runtime.eol-18", 9)]),
    repo("o/b", [finding("npm.package.request.deprecated", 7)]),
    repo("o/gone", [finding("npm.package.request.deprecated", 1)]),
  ],
};

test("added and removed findings are listed per repository with detector deltas", () => {
  const repositories = [
    repo("o/a", [finding("npm.package.request.deprecated", 3), finding("npm.package.node-sass.eol", 5)], [key("npm.package.node-sass.eol", 5)]),
    repo("o/b", [finding("npm.package.request.deprecated", 7)]),
  ];
  const lines = compareRuns({ repositories, detectors: scoreDetectors(repositories), full: false }, earlier);
  assert.equal(lines[0], "COMPARE   against old.json");
  assert.ok(lines.includes(`ADDED     o/a@${commit.slice(0, 10)}: ${key("npm.package.node-sass.eol", 5)}`));
  assert.ok(lines.includes(`REMOVED   o/a@${commit.slice(0, 10)}: ${key("nodejs.runtime.eol-18", 9)}`));
  assert.ok(!lines.some((line) => line.includes("o/b@")));
  assert.ok(!lines.some((line) => line.includes("o/gone")), "a repository outside the current run is not reported as removed");
  assert.ok(lines.includes("DELTA     nodejs: TP -1, FP 0, FN 0"));
  assert.ok(lines.includes("DELTA     npm: TP 0, FP +1, FN 0"));
});

test("an identical run reports no change", () => {
  const repositories = [repo("o/b", [finding("npm.package.request.deprecated", 7)])];
  const lines = compareRuns({ repositories, detectors: scoreDetectors(repositories), full: true }, earlier);
  assert.deepEqual(lines, ["COMPARE   against old.json", "no finding changed in the 1 repositories compared."]);
});

test("a repository missing from the earlier report is noted, not compared", () => {
  const repositories = [repo("o/new", [finding("npm.package.request.deprecated", 1)])];
  const lines = compareRuns({ repositories, detectors: scoreDetectors(repositories), full: true }, earlier);
  assert.ok(lines.some((line) => /1 repositories are not in the earlier report/.test(line)));
});

test("the recorded lastFullRun supplies the numeric baseline", async () => {
  const dir = await mkdtemp(join(tmpdir(), "evergreen-compare-"));
  try {
    const path = join(dir, "thresholds.json");
    await writeFile(path, JSON.stringify({
      schemaVersion: "evergreen.corpus-thresholds.v1",
      detectors: {},
      lastFullRun: { date: "2026-10-20", commit: "abc", repositories: 1, findings: 1, precision: 1, recall: 1, perDetector: { npm: { truePositives: 5, falsePositives: 0, falseNegatives: 0 } } },
    }));
    const baseline = await loadBaseline(path);
    assert.equal(baseline.kind, "last-full-run");
    const lines = compareRuns({ repositories: [], detectors: { npm: { truePositives: 6, falsePositives: 1, falseNegatives: 0, precision: 6 / 7 } }, full: false }, baseline);
    assert.ok(lines.some((line) => line.startsWith("NOTE") && /filtered/.test(line)));
    assert.ok(lines.includes("DELTA     npm: TP +1, FP +1, FN 0"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("bad comparison files are errors", async () => {
  await assert.rejects(loadBaseline("missing.json"), /Cannot read the comparison file/);
  const dir = await mkdtemp(join(tmpdir(), "evergreen-compare-"));
  try {
    await writeFile(join(dir, "x.json"), "{}");
    await assert.rejects(loadBaseline(join(dir, "x.json")), /neither a corpus report nor/);
    await writeFile(join(dir, "t.json"), JSON.stringify({ schemaVersion: "evergreen.corpus-thresholds.v1", detectors: {} }));
    await assert.rejects(loadBaseline(join(dir, "t.json")), /no lastFullRun/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  assert.equal(parseComparePath(["a", "b", "--compare", "x.json"]), "x.json");
  assert.throws(() => parseComparePath(["--compare"]), /needs a file path/);
});

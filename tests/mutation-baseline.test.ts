import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  MUTATION_BASELINE_NOTE,
  MUTATION_BASELINE_SCHEMA,
  MUTATION_TARGET,
  SCORE_TOLERANCE,
  compareBaselines,
  compareMutationScores,
  main,
  mutationScore,
  parseMutationBaseline,
  parseMutationReport,
  renderGuardText,
  renderRatchetSummary,
  renderRatchetText,
  runGuard,
  updateBaseline,
} from "../tools/mutation-baseline.js";
import type { CliOptions, MutationBaseline, MutationScore, RatchetResult } from "../tools/mutation-baseline.js";

function statuses(detected: number, undetected: number): { status: string }[] {
  return [
    ...Array.from({ length: detected }, () => ({ status: "Killed" })),
    ...Array.from({ length: undetected }, () => ({ status: "Survived" })),
  ];
}

function reportOf(entries: Record<string, [number, number]>): unknown {
  return {
    files: Object.fromEntries(
      Object.entries(entries).map(([file, [detected, undetected]]) => [
        file,
        { mutants: statuses(detected, undetected) },
      ]),
    ),
  };
}

function score(file: string, detected: number, undetected: number): MutationScore {
  const result = mutationScore(statuses(detected, undetected));
  assert.ok(result);
  return { file, ...result };
}

function baselineOf(files: Record<string, number>, overall = MUTATION_TARGET): MutationBaseline {
  return {
    schemaVersion: MUTATION_BASELINE_SCHEMA,
    note: MUTATION_BASELINE_NOTE,
    measured: "2026-11-04",
    overall,
    files: Object.entries(files).map(([file, value]) => ({ file, score: value })),
  };
}

function cliOptions(overrides: Partial<CliOptions> = {}): CliOptions {
  return {
    report: "artifacts/mutation-report.json",
    baseline: "benchmarks/mutation-baseline.json",
    against: null,
    update: false,
    date: null,
    summary: null,
    partial: false,
    breakThreshold: null,
    ...overrides,
  };
}

async function temporaryBaseline(directory: string, baseline: MutationBaseline): Promise<string> {
  const path = join(directory, "baseline.json");
  await writeFile(path, JSON.stringify(baseline));
  return path;
}

test("counts a killed or timed-out mutant as detected and ignores errors", () => {
  assert.deepEqual(
    mutationScore([
      { status: "Killed" },
      { status: "Timeout" },
      { status: "Survived" },
      { status: "NoCoverage" },
      { status: "CompileError" },
      { status: "RuntimeError" },
      { status: "Ignored" },
    ]),
    { score: 50, detected: 2, undetected: 2 },
  );
  assert.equal(mutationScore([{ status: "Ignored" }]), null);
});

test("parses the per-file scores from a Stryker report", () => {
  const scores = parseMutationReport(reportOf({ "src/engine.ts": [1, 3], "src/diff.ts": [3, 1] }));
  assert.deepEqual(
    scores.map((entry) => [entry.file, entry.score]),
    [
      ["src/diff.ts", 75],
      ["src/engine.ts", 25],
    ],
  );
});

test("rejects a report without a files object or a mutants array", () => {
  assert.throws(() => parseMutationReport({}), /files object/);
  assert.throws(() => parseMutationReport({ files: { "src/engine.ts": {} } }), /mutants array/);
  assert.throws(() => parseMutationReport({ files: { "src/engine.ts": { mutants: [{}] } } }), /string status/);
});

test("parses the baseline and rejects a wrong schema, a bad date, or a duplicate file", () => {
  const baseline = parseMutationBaseline({
    schemaVersion: MUTATION_BASELINE_SCHEMA,
    measured: "2026-11-04",
    overall: 59.68,
    files: [{ file: "src/engine.ts", score: 23.93 }],
  });
  assert.equal(baseline.overall, 59.68);
  assert.equal(baseline.note, MUTATION_BASELINE_NOTE);
  assert.deepEqual(baseline.files, [{ file: "src/engine.ts", score: 23.93 }]);

  assert.throws(() => parseMutationBaseline({}), /schemaVersion/);
  assert.throws(
    () => parseMutationBaseline({ schemaVersion: MUTATION_BASELINE_SCHEMA, measured: "today", overall: 1, files: [] }),
    /measured date/,
  );
  assert.throws(
    () =>
      parseMutationBaseline({
        schemaVersion: MUTATION_BASELINE_SCHEMA,
        measured: "2026-11-04",
        overall: 1,
        files: [
          { file: "src/engine.ts", score: 1 },
          { file: "src/engine.ts", score: 2 },
        ],
      }),
    /repeats src\/engine\.ts/,
  );
});

test("passes when a score holds or rises", () => {
  const baseline = baselineOf({ "src/engine.ts": 25 }, 25);
  const held = compareMutationScores([score("src/engine.ts", 25, 75)], baseline);
  assert.equal(held.passed, true);
  assert.deepEqual(held.drops, []);

  const raised = compareMutationScores([score("src/engine.ts", 30, 70)], baseline);
  assert.equal(raised.passed, true);
});

test("fails a file that falls below its baseline and reports the difference", () => {
  const baseline = baselineOf({ "src/engine.ts": 25 }, 25);
  const result = compareMutationScores([score("src/engine.ts", 24, 76)], baseline);
  assert.equal(result.passed, false);
  assert.deepEqual(result.drops, [{ file: "src/engine.ts", baseline: 25, score: 24, drop: 1 }]);
  const text = renderRatchetText(result);
  assert.match(text, /src\/engine\.ts: 25\.00% -> 24\.00% \(1\.00 points below its baseline\)/);
  assert.match(renderRatchetSummary(result), /src\/engine\.ts/);
});

test("allows a drop inside the noise tolerance", () => {
  const baseline = baselineOf({ "src/engine.ts": 25 }, 25);
  const result = compareMutationScores([score("src/engine.ts", 62, 188)], baseline);
  assert.equal(SCORE_TOLERANCE, 0.5);
  assert.equal(result.passed, true);
});

test("fails when the overall score falls below the baseline", () => {
  const baseline = baselineOf({ "src/engine.ts": 50 }, 60);
  const result = compareMutationScores([score("src/engine.ts", 59, 41)], baseline);
  assert.equal(result.passed, false);
  assert.deepEqual(result.overall, { baseline: 60, score: 59, drop: 1 });
});

test("fails a complete report below the overall break threshold", () => {
  const baseline = baselineOf({ "src/engine.ts": 50 }, 50);
  const below = compareMutationScores([score("src/engine.ts", 59, 41)], baseline, { overallBreak: 60 });
  assert.equal(below.passed, false);
  assert.deepEqual(below.overallBreak, { threshold: 60, score: 59 });
  assert.match(renderRatchetText(below), /overall: 59\.00% is below the 60\.00% break threshold/);

  const atThreshold = compareMutationScores([score("src/engine.ts", 60, 40)], baseline, { overallBreak: 60 });
  assert.equal(atThreshold.passed, true);
  assert.equal(atThreshold.overallBreak, null);

  const partial = compareMutationScores([score("src/engine.ts", 59, 41)], baseline, {
    complete: false,
    overallBreak: 60,
  });
  assert.equal(partial.passed, true);
  assert.equal(partial.overallBreak, null);
});

test("fails a new file below the target and accepts one above it", () => {
  const baseline = baselineOf({ "src/engine.ts": 25 }, 25);
  const weak = compareMutationScores([score("src/engine.ts", 25, 75), score("src/vers/new.ts", 55, 45)], baseline);
  assert.equal(weak.passed, false);
  assert.deepEqual(
    weak.unbaselined.map((entry) => entry.file),
    ["src/vers/new.ts"],
  );

  const strong = compareMutationScores([score("src/engine.ts", 25, 75), score("src/vers/new.ts", 65, 35)], baseline);
  assert.equal(strong.passed, true);
});

test("fails a baseline entry whose file produced no mutants", () => {
  const baseline = baselineOf({ "src/engine.ts": 25, "src/diff.ts": 50 }, 25);
  const result = compareMutationScores([score("src/engine.ts", 25, 75)], baseline);
  assert.equal(result.passed, false);
  assert.deepEqual(result.stale, ["src/diff.ts"]);
});

test("a partial report skips the overall and stale checks", () => {
  const baseline = baselineOf({ "src/engine.ts": 25, "src/diff.ts": 50 }, 90);
  const result = compareMutationScores([score("src/engine.ts", 25, 75)], baseline, { complete: false });
  assert.equal(result.passed, true);
  assert.equal(result.overall, null);
  assert.deepEqual(result.stale, []);
});

test("update raises a score and adds a file", () => {
  const existing = baselineOf({ "src/engine.ts": 20 }, 20);
  const updated = updateBaseline(
    [score("src/engine.ts", 25, 75), score("src/diff.ts", 50, 50)],
    existing,
    "2026-11-04",
    () => true,
  );
  assert.equal(updated.overall, 37.5);
  assert.equal(updated.note, MUTATION_BASELINE_NOTE);
  assert.deepEqual(
    updated.files.map((entry) => [entry.file, entry.score]),
    [
      ["src/diff.ts", 50],
      ["src/engine.ts", 25],
    ],
  );
});

test("update refuses to lower a file or the overall score", () => {
  const existing = baselineOf({ "src/engine.ts": 25 }, 25);
  assert.throws(
    () => updateBaseline([score("src/engine.ts", 24, 76)], existing, "2026-11-04", () => true),
    /below the baseline 25/,
  );
  assert.throws(
    () =>
      updateBaseline(
        [score("src/engine.ts", 25, 75), score("src/diff.ts", 0, 100)],
        existing,
        "2026-11-04",
        () => true,
      ),
    /overall score is 12\.5%, below the baseline 25/,
  );
});

test("update keeps a live file's entry and removes one for a deleted file", () => {
  const existing = baselineOf({ "src/engine.ts": 25, "src/diff.ts": 50 }, 25);
  const scores = [score("src/engine.ts", 25, 75)];
  const live = updateBaseline(scores, existing, "2026-11-04", (file) => file === "src/diff.ts");
  assert.deepEqual(
    live.files.map((entry) => entry.file),
    ["src/diff.ts", "src/engine.ts"],
  );
  const deleted = updateBaseline(scores, existing, "2026-11-04", () => false);
  assert.deepEqual(
    deleted.files.map((entry) => entry.file),
    ["src/engine.ts"],
  );
});

test("the pull-request guard rejects a lowered, removed, or overall-lowered baseline", () => {
  const previous = baselineOf({ "src/engine.ts": 25, "src/diff.ts": 50 }, 40);
  const lowered = baselineOf({ "src/engine.ts": 20, "src/diff.ts": 50 }, 40);
  assert.deepEqual(
    compareBaselines(lowered, previous, () => true),
    [{ file: "src/engine.ts", baseline: 25, score: 20, drop: 5 }],
  );

  const removed = baselineOf({ "src/diff.ts": 50 }, 40);
  assert.deepEqual(
    compareBaselines(removed, previous, (file) => file === "src/engine.ts"),
    [{ file: "src/engine.ts", baseline: 25, score: null, drop: 25 }],
  );
  assert.deepEqual(
    compareBaselines(removed, previous, () => false),
    [],
  );

  const lowerOverall = baselineOf({ "src/engine.ts": 25, "src/diff.ts": 50 }, 30);
  assert.deepEqual(
    compareBaselines(lowerOverall, previous, () => true),
    [{ file: "overall", baseline: 40, score: 30, drop: 10 }],
  );
});

test("the pull-request guard accepts a raised score and a new file", () => {
  const previous = baselineOf({ "src/engine.ts": 25 }, 25);
  const current = baselineOf({ "src/engine.ts": 30, "src/diff.ts": 50 }, 30);
  assert.deepEqual(
    compareBaselines(current, previous, () => true),
    [],
  );
});

test("main exits 1 when a file falls below its baseline and 0 when it holds", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mutation-baseline-"));
  try {
    const reportPath = join(directory, "report.json");
    const baselinePath = join(directory, "baseline.json");
    await writeFile(reportPath, JSON.stringify(reportOf({ "src/engine.ts": [24, 76] })));
    await writeFile(baselinePath, JSON.stringify(baselineOf({ "src/engine.ts": 25 }, 24)));
    assert.equal(await main(["--report", reportPath, "--baseline", baselinePath]), 1);

    await writeFile(reportPath, JSON.stringify(reportOf({ "src/engine.ts": [25, 75] })));
    assert.equal(await main(["--report", reportPath, "--baseline", baselinePath]), 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("main fails a complete report below the break threshold and rejects an out-of-range value", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mutation-break-"));
  try {
    const reportPath = join(directory, "report.json");
    const baselinePath = join(directory, "baseline.json");
    await writeFile(reportPath, JSON.stringify(reportOf({ "src/engine.ts": [59, 41] })));
    await writeFile(baselinePath, JSON.stringify(baselineOf({ "src/engine.ts": 50 }, 50)));
    assert.equal(await main(["--report", reportPath, "--baseline", baselinePath, "--break", "60"]), 1);
    await writeFile(reportPath, JSON.stringify(reportOf({ "src/engine.ts": [60, 40] })));
    assert.equal(await main(["--report", reportPath, "--baseline", baselinePath, "--break", "60"]), 0);
    await assert.rejects(() => main(["--break", "120"]), /between 0 and 100/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the Stryker break threshold is set to the documented overall target", async () => {
  const config = JSON.parse(await readFile("stryker.config.json", "utf8")) as {
    thresholds: { break: number | null };
  };
  assert.equal(config.thresholds.break, 60);
});

test("main rejects an unknown argument and a missing value", async () => {
  await assert.rejects(() => main(["--bogus", "x"]), /Unknown argument/);
  await assert.rejects(() => main(["--report"]), /needs a value/);
});

test("rejects a malformed report or baseline", () => {
  assert.throws(() => parseMutationReport({ files: { "src/engine.ts": { mutants: [null] } } }), /string status/);
  assert.throws(() => parseMutationReport({ files: { "src/engine.ts": { mutants: "x" } } }), /mutants array/);

  const base = { schemaVersion: MUTATION_BASELINE_SCHEMA, measured: "2026-11-04", overall: 50, files: [] };
  assert.throws(() => parseMutationBaseline({ ...base, measured: "nope" }), /measured date/);
  assert.throws(() => parseMutationBaseline({ ...base, overall: Number.NaN }), /overall score/);
  assert.throws(() => parseMutationBaseline({ ...base, overall: 101 }), /overall score/);
  assert.throws(() => parseMutationBaseline({ ...base, files: "x" }), /files array/);
  assert.throws(() => parseMutationBaseline({ ...base, files: [{ file: "", score: 1 }] }), /needs a file/);
  assert.throws(() => parseMutationBaseline({ ...base, files: [{ file: "a", score: -1 }] }), /needs a file/);
  assert.throws(() => parseMutationBaseline({ ...base, files: [{ file: "a", score: "1" }] }), /needs a file/);
  assert.throws(() => updateBaseline([], null, "nope", () => true), /measured must be a date/);
});

test("renders every ratchet finding", () => {
  const result: RatchetResult = {
    passed: false,
    drops: [{ file: "src/engine.ts", baseline: 25, score: 24, drop: 1 }],
    unbaselined: [score("src/vers/new.ts", 55, 45)],
    stale: ["src/diff.ts"],
    overall: { baseline: 30, score: 29, drop: 1 },
    overallBreak: { threshold: 60, score: 29 },
  };
  const text = renderRatchetText(result);
  assert.match(text, /src\/vers\/new\.ts: 55\.00% is below the 60% target/);
  assert.match(text, /src\/diff\.ts: no mutants were reported/);
  assert.match(text, /overall: 30\.00% -> 29\.00%/);
  assert.match(text, /overall: 29\.00% is below the 60\.00% break threshold/);
  const summary = renderRatchetSummary(result);
  assert.match(summary, /below 60%/);
  assert.match(summary, /stale entry/);
  assert.match(summary, /\*\*overall\*\*/);
  assert.match(summary, /\*\*overall break\*\*/);
});

test("renders a lowered and a removed guard entry", () => {
  const text = renderGuardText([
    { file: "src/engine.ts", baseline: 25, score: 20, drop: 5 },
    { file: "src/diff.ts", baseline: 50, score: null, drop: 50 },
  ]);
  assert.match(text, /src\/engine\.ts: 25\.00% -> 20\.00%/);
  assert.match(text, /src\/diff\.ts: 50\.00% -> entry removed/);
});

test("runGuard fails a lowered or removed entry and passes an unchanged one", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mutation-guard-"));
  try {
    const baselinePath = await temporaryBaseline(directory, baselineOf({ "src/engine.ts": 20 }, 20));
    const options = cliOptions({ against: "origin/main", baseline: baselinePath });
    assert.equal(await runGuard(options, () => baselineOf({ "src/engine.ts": 25 }, 25)), 1);
    assert.equal(await runGuard(options, () => baselineOf({ "src/engine.ts": 20, "package.json": 90 }, 20)), 1);
    assert.equal(await runGuard(options, () => baselineOf({ "src/engine.ts": 20 }, 20)), 0);
    assert.equal(await runGuard(options, () => null), 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("main updates a baseline and refuses to lower it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mutation-update-"));
  try {
    const reportPath = join(directory, "report.json");
    const baselinePath = join(directory, "baseline.json");
    await writeFile(reportPath, JSON.stringify(reportOf({ "src/engine.ts": [24, 76] })));
    await writeFile(baselinePath, JSON.stringify(baselineOf({ "src/engine.ts": 20 }, 20)));
    assert.equal(
      await main(["--report", reportPath, "--baseline", baselinePath, "--update", "--date", "2026-11-04"]),
      0,
    );
    const updated = parseMutationBaseline(JSON.parse(await readFile(baselinePath, "utf8")));
    assert.equal(updated.overall, 24);
    assert.equal(updated.files[0]?.score, 24);

    await writeFile(reportPath, JSON.stringify(reportOf({ "src/engine.ts": [20, 80] })));
    await assert.rejects(
      () => main(["--report", reportPath, "--baseline", baselinePath, "--update", "--date", "2026-11-04"]),
      /below the baseline 24/,
    );

    const freshPath = join(directory, "fresh.json");
    await writeFile(reportPath, JSON.stringify(reportOf({ "src/engine.ts": [24, 76] })));
    assert.equal(await main(["--report", reportPath, "--baseline", freshPath, "--update", "--date", "2026-11-04"]), 0);
    assert.equal(parseMutationBaseline(JSON.parse(await readFile(freshPath, "utf8"))).overall, 24);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("main writes a summary, accepts a partial report, and skips an unknown ref", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mutation-main-"));
  try {
    const reportPath = join(directory, "report.json");
    await writeFile(reportPath, JSON.stringify(reportOf({ "src/engine.ts": [24, 76] })));
    const baselinePath = await temporaryBaseline(directory, baselineOf({ "src/engine.ts": 20, "src/diff.ts": 50 }, 20));
    const summaryPath = join(directory, "summary.md");
    assert.equal(
      await main(["--report", reportPath, "--baseline", baselinePath, "--partial", "--summary", summaryPath]),
      0,
    );
    assert.match(await readFile(summaryPath, "utf8"), /Mutation score ratchet/);
    assert.equal(await main(["--against", "no-such-ref-xyz", "--baseline", baselinePath]), 0);
    await assert.rejects(() => main(["--against", "origin/main", "--update"]), /cannot be combined/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("main rejects a report with no scored mutants or a missing file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mutation-empty-"));
  try {
    const emptyPath = join(directory, "empty.json");
    await writeFile(emptyPath, JSON.stringify({ files: {} }));
    const baselinePath = await temporaryBaseline(directory, baselineOf({ "src/engine.ts": 20 }, 20));
    await assert.rejects(() => main(["--report", emptyPath, "--baseline", baselinePath]), /no scored mutants/);
    await assert.rejects(
      () => main(["--report", join(directory, "missing.json"), "--baseline", baselinePath]),
      /ENOENT/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the entry point exits 0 on a passing report and 2 on a bad argument", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mutation-entry-"));
  try {
    const reportPath = join(directory, "report.json");
    await writeFile(reportPath, JSON.stringify(reportOf({ "src/engine.ts": [20, 80] })));
    const baselinePath = await temporaryBaseline(directory, baselineOf({ "src/engine.ts": 20 }, 20));
    const ok = spawnSync(
      process.execPath,
      ["dist/tools/mutation-baseline.js", "--report", reportPath, "--baseline", baselinePath],
      { encoding: "utf8" },
    );
    assert.equal(ok.status, 0, ok.stderr);
    const bad = spawnSync(process.execPath, ["dist/tools/mutation-baseline.js", "--bogus"], { encoding: "utf8" });
    assert.equal(bad.status, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("every reporter file is in the mutation scope with a baseline of at least 80%", async () => {
  const baseline = JSON.parse(await readFile("benchmarks/mutation-baseline.json", "utf8")) as MutationBaseline;
  const config = JSON.parse(await readFile("stryker.config.json", "utf8")) as { mutate: string[] };
  assert.ok(config.mutate.includes("src/reporters.ts") && config.mutate.includes("src/reporters/**/*.ts"));
  const { readdir } = await import("node:fs/promises");
  const reporters = (await readdir("src/reporters")).filter((name) => name.endsWith(".ts"));
  assert.ok(reporters.length > 0);
  for (const name of reporters) {
    const entry = baseline.files.find((candidate) => candidate.file === `src/reporters/${name}`);
    assert.ok(entry, `src/reporters/${name} needs a mutation baseline entry`);
    assert.ok(entry.score >= 80, `src/reporters/${name} baseline is ${entry.score}%, below 80%`);
  }
});

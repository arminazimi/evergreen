import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { parse as parseYaml } from "yaml";

import {
  evaluate,
  main,
  MAX_SCORE,
  MIN_SCORE,
  parseArguments,
  parseResults,
  POLICY_MIN_TARGET,
  RECORDED_TARGETS,
  validateTargets,
  type CheckTarget,
  type ScorecardCheck,
} from "../tools/scorecard-targets.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-scorecard-targets-"));
  roots.push(root);
  return root;
}

/** The 18 check names published by Scorecard v5.6.0, sorted. */
const KNOWN_CHECKS = [
  "Binary-Artifacts",
  "Branch-Protection",
  "CI-Tests",
  "CII-Best-Practices",
  "Code-Review",
  "Contributors",
  "Dangerous-Workflow",
  "Dependency-Update-Tool",
  "Fuzzing",
  "License",
  "Maintained",
  "Packaging",
  "Pinned-Dependencies",
  "SAST",
  "Security-Policy",
  "Signed-Releases",
  "Token-Permissions",
  "Vulnerabilities",
];

function targetsOf(entries: ReadonlyArray<readonly [string, CheckTarget]>): Map<string, CheckTarget> {
  return new Map(entries);
}

function resultsFixture(checks: ReadonlyArray<readonly [string, number]>): string {
  return JSON.stringify({
    date: "2026-11-01T22:30:17Z",
    repo: { name: "github.com/arminazimi/evergreen", commit: "435a5c15" },
    score: 5.9,
    checks: checks.map(([name, score]) => ({ name, score })),
  });
}

test("the recorded table is valid, complete, and matches the current Scorecard checks", () => {
  assert.deepEqual(validateTargets(RECORDED_TARGETS), []);
  assert.deepEqual([...RECORDED_TARGETS.keys()].sort(), KNOWN_CHECKS);
  for (const [name, entry] of RECORDED_TARGETS) {
    assert.ok(Number.isInteger(entry.target), name);
    assert.ok(Number.isInteger(entry.observed), name);
    assert.ok(entry.target >= MIN_SCORE && entry.target <= MAX_SCORE, name);
    // The docs/QUALITY.md floor: below 5 only with a written reason.
    if (entry.target < POLICY_MIN_TARGET) {
      assert.ok((entry.reason ?? "").length > 0, `${name} needs a written reason`);
    }
  }
});

test("validateTargets refuses a target lowered below its observation without a reason", () => {
  const lowered = targetsOf([["SAST", { target: 4, observed: 7 }]]);
  assert.deepEqual(validateTargets(lowered), [
    'lowered target: "SAST" target 4 is below the recorded observation 7 without a written reason.',
  ]);
  const excused = targetsOf([["SAST", { target: 4, observed: 7, reason: "checker changed its scoring" }]]);
  // A written reason still cannot lift the policy-floor rule, so add the floor reason path below.
  assert.ok(validateTargets(excused).length === 0 || validateTargets(excused)[0]?.includes("policy floor"));
});

test("validateTargets refuses a target at or above the observation but below the policy floor without a reason", () => {
  const bare = targetsOf([["SAST", { target: 6, observed: 6 }]]);
  assert.deepEqual(validateTargets(bare), []);
  const low = targetsOf([["SAST", { target: 3, observed: 3 }]]);
  assert.deepEqual(validateTargets(low), [
    'lowered target: "SAST" target 3 is below the policy floor 5 (docs/QUALITY.md §8) without a written reason.',
  ]);
  const reasoned = targetsOf([["SAST", { target: 3, observed: 3, reason: "documented in SECURITY.md" }]]);
  assert.deepEqual(validateTargets(reasoned), []);
});

test("validateTargets refuses scores that are not integers in -1..10", () => {
  const bad = targetsOf([
    ["SAST", { target: 7.5, observed: 7 }],
    ["Maintained", { target: 11, observed: 11 }],
  ]);
  assert.deepEqual(validateTargets(bad), [
    "invalid target: \"Maintained\" target/observed must be integers from -1 to 10.",
    "invalid target: \"SAST\" target/observed must be integers from -1 to 10.",
  ]);
});

test("parseResults accepts the published API shape", () => {
  const checks = parseResults(resultsFixture([["SAST", 7], ["Branch-Protection", -1]]));
  assert.deepEqual(checks, [
    { name: "SAST", score: 7 },
    { name: "Branch-Protection", score: -1 },
  ]);
});

test("parseResults rejects anything that is not a results file", () => {
  assert.throws(() => parseResults("<html>"), SyntaxError);
  assert.throws(() => parseResults("null"), /checks` array/);
  assert.throws(() => parseResults('{"score":5.9}'), /checks` array/);
  assert.throws(() => parseResults('{"checks":[]}'), /hold no checks/);
  assert.throws(() => parseResults('{"checks":[{"score":5}]}'), /non-empty check `name`/);
  assert.throws(() => parseResults('{"checks":[{"name":"SAST","score":11}]}'), /outside -1\.\.10/);
  assert.throws(() => parseResults('{"checks":[{"name":"SAST","score":7.5}]}'), /outside -1\.\.10/);
  assert.throws(() => parseResults('{"checks":[{"name":" ","score":7}]}'), /non-empty check `name`/);
  assert.throws(
    () => parseResults('{"checks":[{"name":"SAST","score":7},{"name":"SAST","score":6}]}'),
    /appears twice/,
  );
});

test("evaluate passes when every measurement meets its recorded target", () => {
  const targets = targetsOf([
    ["SAST", { target: 7, observed: 7 }],
    ["Maintained", { target: 0, observed: 0, reason: "young repository" }],
  ]);
  const checks: ScorecardCheck[] = [
    { name: "SAST", score: 7 },
    { name: "Maintained", score: 0 },
  ];
  assert.deepEqual(evaluate(checks, targets), { failures: [], notes: [] });
});

test("a lowered score fails with the check's name", () => {
  const targets = targetsOf([["Pinned-Dependencies", { target: 3, observed: 3, reason: "SLSA tag" }]]);
  const { failures } = evaluate([{ name: "Pinned-Dependencies", score: 2 }], targets);
  assert.deepEqual(failures, [
    'lowered score: "Pinned-Dependencies" scored 2, below its recorded target 3.',
  ]);
});

test("evaluate fails for an uncovered check and notes improvements", () => {
  const targets = targetsOf([
    ["SAST", { target: 7, observed: 7 }],
    ["Vulnerabilities", { target: 0, observed: 0, reason: "open advisories" }],
  ]);
  const { failures, notes } = evaluate(
    [
      { name: "New-Check", score: 6 },
      { name: "SAST", score: 9 },
      { name: "Vulnerabilities", score: 0 },
    ],
    targets,
  );
  assert.deepEqual(failures, [
    'no recorded target: "New-Check" scored 6; add its target to the ratchet before this can pass.',
  ]);
  assert.deepEqual(notes, ['target may rise: "SAST" scored 9, above the recorded target 7.']);
});

test("a recorded target absent from the latest results fails with its name", () => {
  const targets = targetsOf([["SAST", { target: 7, observed: 7 }]]);
  const { failures } = evaluate([{ name: "License", score: 10 }], targets);
  assert.deepEqual(
    failures.filter((line) => line.includes("no measurement")),
    ['no measurement: "SAST" has a recorded target but is absent from the latest results.'],
  );
});

test("parseArguments requires exactly one --results path", () => {
  assert.deepEqual(parseArguments(["--results", "scorecard-results.json"]), {
    resultsPath: "scorecard-results.json",
  });
  assert.throws(() => parseArguments([]), /--results is required/);
  assert.throws(() => parseArguments(["--results"]), /needs a value/);
  assert.throws(() => parseArguments(["--results", "--results", "x"]), /needs a value/);
  assert.throws(() => parseArguments(["--results", "a", "--results", "b"]), /more than once/);
  assert.throws(() => parseArguments(["--nope"]), /Unexpected argument/);
});

test("main passes a results file whose scores all meet their targets", async () => {
  const root = await scratch();
  const path = join(root, "results.json");
  await writeFile(path, resultsFixture([["SAST", 7]]));
  const lines: string[] = [];
  const code = await main(["--results", path], {
    targets: targetsOf([["SAST", { target: 7, observed: 7 }]]),
    writeLine: (line) => lines.push(line),
  });
  assert.equal(code, 0);
  assert.deepEqual(lines, ["All 1 Scorecard checks meet their recorded targets."]);
});

test("main fails a lowered score and names the check", async () => {
  const root = await scratch();
  const path = join(root, "results.json");
  await writeFile(path, resultsFixture([["Pinned-Dependencies", 2]]));
  const lines: string[] = [];
  const code = await main(["--results", path], {
    targets: targetsOf([["Pinned-Dependencies", { target: 3, observed: 3, reason: "SLSA tag" }]]),
    writeLine: (line) => lines.push(line),
  });
  assert.equal(code, 1);
  assert.ok(
    lines.includes('lowered score: "Pinned-Dependencies" scored 2, below its recorded target 3.'),
    lines.join("\n"),
  );
  assert.ok(lines.at(-1)?.includes("Scorecard below recorded targets"), lines.join("\n"));
});

test("main refuses an invalid target table before reading results", async () => {
  const root = await scratch();
  const path = join(root, "results.json");
  await writeFile(path, resultsFixture([["SAST", 7]]));
  const lines: string[] = [];
  const code = await main(["--results", path], {
    targets: targetsOf([["SAST", { target: 5, observed: 7 }]]),
    readTextFile: async () => {
      throw new Error("the table check must fail first");
    },
    writeLine: (line) => lines.push(line),
  });
  assert.equal(code, 1);
  assert.ok(lines.some((line) => line.includes('"SAST"')), lines.join("\n"));
  assert.ok(lines.at(-1)?.includes("target table invalid"), lines.join("\n"));
});

test("main reads the results file through the default reader", async () => {
  const root = await scratch();
  const path = join(root, "results.json");
  await writeFile(path, resultsFixture(KNOWN_CHECKS.map((name) => [name, RECORDED_TARGETS.get(name)?.target ?? 0])));
  const lines: string[] = [];
  const code = await main(["--results", path], { writeLine: (line) => lines.push(line) });
  assert.equal(code, 0, lines.join("\n"));
  assert.equal(lines[0], "All 18 Scorecard checks meet their recorded targets.");
});

test("scorecard.yml enforces the targets after publishing the analysis", async () => {
  const workflow = parseYaml(await readFile(resolve(".github/workflows/scorecard.yml"), "utf8")) as {
    jobs: { analysis: { steps: Array<{ name?: string; run?: string; uses?: string }> } };
  };
  const steps = workflow.jobs.analysis.steps;
  const names = steps.map((step) => step.name ?? "");
  const publishIndex = names.findIndex((name) => name === "Run analysis");
  const enforceIndex = names.findIndex((name) => name === "Enforce per-check Scorecard targets");
  assert.ok(publishIndex >= 0 && enforceIndex > publishIndex, "enforcement must run after the analysis");
  const enforce = steps[enforceIndex];
  assert.equal(enforce?.run, "node dist/tools/scorecard-targets.js --results scorecard-results.json");
  const fetch = steps[names.findIndex((name) => name === "Read the latest published results")];
  assert.ok(fetch?.run?.includes("scorecard-results.json"), "the workflow fetches the published results");
});

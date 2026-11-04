import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { parse } from "yaml";

const toolPath = resolve("tools/scorecard-floor.mjs");
const fixturePath = resolve("tests/fixtures/scorecard/published-2026-11-01.json");
const workflowPath = resolve(".github/workflows/scorecard.yml");

const tool = (await import(pathToFileURL(toolPath).href)) as {
  MEASUREMENT: string;
  RECORDED_TARGETS: readonly { check: string; floor: number; reason: string }[];
  ScorecardFloorError: ErrorConstructor;
  validateTargets: (targets: readonly { check: string; floor: number; reason: string }[]) => string[];
  parseScores: (document: unknown) => Map<string, number>;
  findViolations: (
    scores: ReadonlyMap<string, number>,
    targets: readonly { check: string; floor: number; reason: string }[],
  ) => { below: { check: string; score: number; floor: number }[]; missing: { check: string; floor: number }[] };
  violationLines: (violations: {
    below: { check: string; score: number; floor: number }[];
    missing: { check: string; floor: number }[];
  }) => string[];
  main: (args: readonly string[]) => number;
};

const baseline = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  checks: { name: string; score: number }[];
};

function runTool(...args: string[]) {
  return spawnSync(process.execPath, [toolPath, ...args], { encoding: "utf8" });
}

function writeRaw(name: string, text: string) {
  const dir = mkdtempSync(join(tmpdir(), "evergreen-scorecard-floor-"));
  const file = join(dir, name);
  writeFileSync(file, text);
  return file;
}

function writeResults(name: string, document: unknown) {
  return writeRaw(name, JSON.stringify(document));
}

test("the recorded table is valid and every floor carries a written reason", () => {
  assert.deepEqual(tool.validateTargets(tool.RECORDED_TARGETS), []);
  const names = tool.RECORDED_TARGETS.map((entry) => entry.check);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.length, baseline.checks.length);
  for (const entry of tool.RECORDED_TARGETS) {
    assert.ok(entry.reason.trim().length > 0, `${entry.check} has no written reason`);
    assert.ok(entry.floor >= -1 && entry.floor <= 10);
    assert.ok(names.includes(entry.check), `${entry.check} is not a Scorecard check of the measured run`);
  }
});

test("parseScores maps the measured checks to their scores", () => {
  const scores = tool.parseScores(baseline);
  assert.equal(scores.size, baseline.checks.length);
  assert.equal(scores.get("Pinned-Dependencies"), 3);
  assert.equal(scores.get("Branch-Protection"), -1);
});

test("parseScores refuses documents without a usable checks array", () => {
  assert.throws(() => tool.parseScores(null), tool.ScorecardFloorError);
  assert.throws(() => tool.parseScores({ checks: "no" }), tool.ScorecardFloorError);
  assert.throws(() => tool.parseScores({ checks: [{ name: "SAST", score: "7" }] }), /SAST/);
  assert.throws(
    () =>
      tool.parseScores({
        checks: [
          { name: "SAST", score: 7 },
          { name: "SAST", score: 8 },
        ],
      }),
    /twice/,
  );
});

test("findViolations passes the measured baseline and flags a lowered score by name", () => {
  const scores = tool.parseScores(baseline);
  assert.deepEqual(tool.findViolations(scores, tool.RECORDED_TARGETS), { below: [], missing: [] });

  const lowered = new Map(scores);
  lowered.set("Dangerous-Workflow", 0);
  const violations = tool.findViolations(lowered, tool.RECORDED_TARGETS);
  assert.deepEqual(violations.below, [{ check: "Dangerous-Workflow", score: 0, floor: 10 }]);
  assert.deepEqual(violations.missing, []);
  assert.match(tool.violationLines(violations)[0] ?? "", /Dangerous-Workflow scored 0, its recorded target is 10/);
});

test("findViolations flags a missing result and treats the -1 error floor as a rise", () => {
  const scores = tool.parseScores(baseline);
  scores.delete("License");
  assert.deepEqual(tool.findViolations(scores, tool.RECORDED_TARGETS).missing, [{ check: "License", floor: 10 }]);

  const errors = new Map([["Branch-Protection", -1]]);
  assert.equal(
    tool.findViolations(errors, [{ check: "Branch-Protection", floor: -1, reason: "error floor" }]).below.length,
    0,
  );
  const recovering = new Map([["Branch-Protection", 0]]);
  assert.equal(
    tool.findViolations(recovering, [{ check: "Branch-Protection", floor: -1, reason: "error floor" }]).below.length,
    0,
  );
});

test("the command passes the measured baseline fixture from the 2026-11-01 run", () => {
  const run = runTool(fixturePath);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, new RegExp(`All ${tool.RECORDED_TARGETS.length} recorded Scorecard targets met\\.`));
});

test("a lowered score fails the command with the check's name", () => {
  const document = {
    ...baseline,
    checks: baseline.checks.map((check) => (check.name === "Pinned-Dependencies" ? { ...check, score: 1 } : check)),
  };
  const run = runTool(writeResults("lowered.json", document));
  assert.equal(run.status, 1);
  assert.match(run.stdout, /BELOW TARGET: Pinned-Dependencies scored 1, its recorded target is 3/);
  assert.match(run.stdout, /1 Scorecard check\(s\) below their recorded target/);
});

test("a missing check fails the command with the check's name", () => {
  const document = { ...baseline, checks: baseline.checks.filter((check) => check.name !== "Fuzzing") };
  const run = runTool(writeResults("missing.json", document));
  assert.equal(run.status, 1);
  assert.match(run.stdout, /BELOW TARGET: Fuzzing has no result, its recorded target is 10/);
});

test("unreadable or malformed results exit 2 without claiming a breach", () => {
  const missingFile = runTool(join(mkdtempSync(join(tmpdir(), "evergreen-scorecard-floor-")), "absent.json"));
  assert.equal(missingFile.status, 2);
  assert.match(missingFile.stderr, /cannot read the Scorecard results/);

  const notJson = writeRaw("broken.json", "{ not json");
  assert.equal(runTool(notJson).status, 2);

  const noChecks = runTool(writeResults("no-checks.json", { score: 5.9 }));
  assert.equal(noChecks.status, 2);
  assert.match(noChecks.stderr, /no checks array/);

  const noArgs = runTool();
  assert.equal(noArgs.status, 2);
  assert.match(noArgs.stderr, /usage: node tools\/scorecard-floor\.mjs/);
});

test("--list-targets prints the table and the measurement it came from", () => {
  const run = runTool("--list-targets");
  assert.equal(run.status, 0, run.stderr);
  const listed = JSON.parse(run.stdout) as {
    measurement: string;
    targets: { check: string; floor: number; reason: string }[];
  };
  assert.equal(listed.measurement, tool.MEASUREMENT);
  assert.match(listed.measurement, /41357434463/);
  assert.deepEqual(listed.targets, tool.RECORDED_TARGETS);
});

test("scorecard.yml runs the floor gate over a JSON analysis of the pinned action", () => {
  const workflow = parse(readFileSync(workflowPath, "utf8")) as {
    jobs: {
      analysis: {
        "timeout-minutes": number;
        steps: { name?: string; uses?: string; run?: string; with?: Record<string, unknown> }[];
      };
    };
  };
  const steps = workflow.jobs.analysis.steps;
  const isScorecard = (step: (typeof steps)[number]) => step.uses?.startsWith("ossf/scorecard-action@");
  const sarifIndex = steps.findIndex((step) => isScorecard(step) && step.with?.["results_format"] === "sarif");
  const jsonIndex = steps.findIndex((step) => isScorecard(step) && step.with?.["results_format"] === "json");
  const gateIndex = steps.findIndex((step) => step.run === "node tools/scorecard-floor.mjs results.json");
  assert.ok(sarifIndex >= 0, "the SARIF analysis is missing from scorecard.yml");
  assert.ok(jsonIndex > sarifIndex, "the JSON analysis is missing from scorecard.yml");
  assert.ok(gateIndex > jsonIndex, "the floor gate must run after the JSON analysis");
  const jsonStep = steps[jsonIndex];
  assert.equal(jsonStep?.with?.["results_file"], "results.json");
  assert.equal(jsonStep?.with?.["publish_results"], false);
  assert.equal(workflow.jobs.analysis["timeout-minutes"], 20);
});

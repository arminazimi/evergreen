import assert from "node:assert/strict";
import { test } from "node:test";

import { formatSummaryTables, mismatchLines, parseOutputPath, progressLine, scoreEcosystems } from "../benchmarks/corpus-report.js";

const result = (repository: string, ecosystem: string, tp: number, fp: number, fn: number) => ({
  repository,
  commit: "a".repeat(40),
  ecosystem,
  truePositives: tp,
  falsePositives: fp,
  falseNegatives: fn,
  unexpected: fp > 0 ? ["npm.x:package.json:3"] : [],
  missing: fn > 0 ? ["go.y:go.mod:1"] : [],
});

const results = [result("o/a", "node", 3, 1, 0), result("o/b", "node", 2, 0, 1), result("o/c", "go", 4, 0, 0)];

test("ecosystems aggregate TP, FP, FN and precision", () => {
  assert.deepEqual(scoreEcosystems(results), [
    { name: "go", truePositives: 4, falsePositives: 0, falseNegatives: 0, precision: 1 },
    { name: "node", truePositives: 5, falsePositives: 1, falseNegatives: 1, precision: 5 / 6 },
  ]);
});

test("the summary has an ecosystem table and a detector table", () => {
  const text = formatSummaryTables(results, { npm: { truePositives: 5, falsePositives: 1, falseNegatives: 0, precision: 5 / 6 } });
  const lines = text.split("\n");
  assert.match(lines[0]!, /^ecosystem\s+TP\s+FP\s+FN\s+precision$/);
  assert.match(lines[1]!, /^go\s+4\s+0\s+0\s+1\.0000$/);
  assert.match(lines[2]!, /^node\s+5\s+1\s+1\s+0\.8333$/);
  assert.match(lines[4]!, /^detector\s+TP/);
  assert.match(lines[5]!, /^npm\s+5\s+1\s+0\s+0\.8333$/);
});

test("mismatch lines name the repository and the finding", () => {
  assert.deepEqual(mismatchLines(results), [
    `UNEXPECTED o/a@${"a".repeat(10)}: npm.x:package.json:3`,
    `MISSING    o/b@${"a".repeat(10)}: go.y:go.mod:1`,
  ]);
  assert.deepEqual(mismatchLines([result("o/c", "go", 4, 0, 0)]), []);
});

test("progress and --output parse", () => {
  assert.equal(progressLine(12, 107, "owner/name", 2100), "12/107 owner/name 2.1s");
  assert.equal(parseOutputPath(["node", "x", "--output", "r.json"]), "r.json");
  assert.equal(parseOutputPath(["node", "x"]), undefined);
  assert.throws(() => parseOutputPath(["node", "x", "--output"]), /needs a file path/);
});

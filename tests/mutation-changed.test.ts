import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkChangedReport,
  globToRegExp,
  main,
  parseChangedRanges,
  parseMutateGlobs,
  renderChangedSummary,
  renderChangedText,
  selectMutateSpecs,
} from "../tools/mutation-changed.js";

const DIFF = [
  "diff --git a/src/diff.ts b/src/diff.ts",
  "--- a/src/diff.ts",
  "+++ b/src/diff.ts",
  "@@ -10,0 +11,3 @@ function a() {",
  "+x",
  "@@ -30,2 +33 @@ function b() {",
  "@@ -50,4 +52,0 @@ function c() {",
  "diff --git a/src/engine/detect.ts b/src/engine/detect.ts",
  "+++ b/src/engine/detect.ts",
  "@@ -1 +1,2 @@",
  "diff --git a/src/cli.ts b/src/cli.ts",
  "+++ b/src/cli.ts",
  "@@ -1 +1 @@",
  "diff --git a/src/gone.ts b/src/gone.ts",
  "+++ /dev/null",
  "@@ -1,3 +0,0 @@",
].join("\n");

const GLOBS = ["src/engine/**/*.ts", "src/diff.ts", "src/reporters.ts", "src/reporters/**/*.ts"];

test("globs match the mutation scope and nothing else", () => {
  assert.ok(globToRegExp("src/engine/**/*.ts").test("src/engine/detect.ts"));
  assert.ok(globToRegExp("src/engine/**/*.ts").test("src/engine/deep/er/x.ts"));
  assert.ok(!globToRegExp("src/engine/**/*.ts").test("src/engine.ts"));
  assert.ok(!globToRegExp("src/diff.ts").test("src/diffxts"));
  assert.ok(!globToRegExp("src/*.ts").test("src/vers/gem.ts"));
  assert.ok(globToRegExp("src/**").test("src/a/b.ts"));
});

test("changed ranges come from added lines only", () => {
  const ranges = parseChangedRanges(DIFF);
  assert.deepEqual(ranges.get("src/diff.ts"), [
    { start: 11, end: 13 },
    { start: 33, end: 33 },
  ]);
  assert.deepEqual(ranges.get("src/engine/detect.ts"), [{ start: 1, end: 2 }]);
  assert.equal(ranges.has("src/gone.ts"), false);
});

test("only files inside the mutation scope become mutate entries", () => {
  const specs = selectMutateSpecs(parseChangedRanges(DIFF), GLOBS);
  assert.deepEqual(specs, ["src/diff.ts:11-13", "src/diff.ts:33-33", "src/engine/detect.ts:1-2"]);
  assert.deepEqual(selectMutateSpecs(new Map([["src/cli.ts", [{ start: 1, end: 1 }]]]), GLOBS), []);
});

test("the mutate globs come from the Stryker config", () => {
  assert.deepEqual(parseMutateGlobs({ mutate: ["a", "b"] }), ["a", "b"]);
  assert.throws(() => parseMutateGlobs({}), /mutate array/);
  assert.throws(() => parseMutateGlobs({ mutate: [] }), /empty/);
});

function report(...mutants: [string, string, number][]): unknown {
  const files: Record<string, { mutants: unknown[] }> = {};
  for (const [file, status, line] of mutants) {
    files[file] ??= { mutants: [] };
    files[file].mutants.push({
      status,
      mutatorName: "ConditionalExpression",
      replacement: "true",
      location: { start: { line } },
    });
  }
  return { files };
}

test("a weak test fails and lists the surviving mutants", () => {
  const result = checkChangedReport(
    report(["src/diff.ts", "Killed", 11], ["src/diff.ts", "Survived", 12], ["src/diff.ts", "NoCoverage", 5]),
    60,
  );
  assert.equal(result.passed, false);
  assert.equal(result.score, 33.33);
  assert.deepEqual(
    result.survivors.map((survivor) => `${survivor.file}:${survivor.line}`),
    ["src/diff.ts:5", "src/diff.ts:12"],
  );
  const text = renderChangedText(result);
  assert.match(text, /src\/diff\.ts:12 ConditionalExpression \(Survived\) -> true/);
  assert.match(text, /Failed/);
  assert.match(renderChangedSummary(result), /\| `src\/diff\.ts` \| 12 \| ConditionalExpression \| Survived \|/);
});

test("a score at the threshold passes, and a run with no scored mutant passes", () => {
  const edge = checkChangedReport(
    report(
      ["a.ts", "Killed", 1],
      ["a.ts", "Killed", 2],
      ["a.ts", "Timeout", 3],
      ["a.ts", "Survived", 4],
      ["b.ts", "Killed", 1],
      ["b.ts", "Killed", 2],
    ),
    66,
  );
  assert.equal(edge.score, 83.33);
  assert.equal(edge.passed, true);
  const empty = checkChangedReport(report(["a.ts", "Ignored", 1]), 60);
  assert.equal(empty.passed, true);
  assert.equal(empty.score, null);
  assert.match(renderChangedText(empty), /nothing to judge/);
  assert.match(renderChangedSummary(empty), /No scored mutant/);
});

test("a malformed report is rejected", () => {
  assert.throws(() => checkChangedReport({}, 60), /files object/);
  assert.throws(() => checkChangedReport({ files: { "a.ts": {} } }, 60), /mutants array/);
  assert.throws(() => checkChangedReport({ files: { "a.ts": { mutants: [{}] } } }, 60), /string status/);
});

test("the command line rejects unknown input", () => {
  assert.throws(() => main(["nope"]), /select/);
  assert.throws(() => main(["select"]), /--base/);
  assert.throws(() => main(["check", "--bogus", "1"]), /Unknown argument/);
  assert.throws(() => main(["check", "--threshold", "101"]), /between 0 and 100/);
});

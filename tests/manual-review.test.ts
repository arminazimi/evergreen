import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSample,
  formatReport,
  reviewProblems,
  tallyReviews,
  unreviewed,
  type ReviewEntry,
} from "../benchmarks/manual-review/review.js";
import { drawSample, wilsonInterval } from "../benchmarks/manual-review/stats.js";

const corpus = [
  ...Array.from({ length: 60 }, (_, i) => ({ ecosystem: "go", repository: `o/go${i}`, commit: `c${i}` })),
  ...Array.from({ length: 31 }, (_, i) => ({ ecosystem: "dart", repository: `o/dart${i}`, commit: `d${i}` })),
];

test("the same seed draws the same sample, another seed draws another", () => {
  const first = buildSample(corpus, "seed-a", 40);
  assert.deepEqual(buildSample([...corpus].reverse(), "seed-a", 40), first);
  assert.notDeepEqual(buildSample(corpus, "seed-b", 40).ecosystems.go, first.ecosystems.go);
  assert.equal(first.ecosystems.go?.length, 40);
  assert.equal(first.ecosystems.dart?.length, 31);
  assert.deepEqual(first.corpusSize, { dart: 31, go: 60 });
});

test("one ecosystem's draw does not move when another one grows", () => {
  const before = buildSample(corpus, "s", 30).ecosystems.go;
  const grown = [...corpus, { ecosystem: "dart", repository: "o/new", commit: "n" }];
  assert.deepEqual(buildSample(grown, "s", 30).ecosystems.go, before);
});

test("the sample size stays between 30 and 50 and the seed is required", () => {
  assert.throws(() => buildSample(corpus, "s", 29));
  assert.throws(() => buildSample(corpus, "s", 51));
  assert.throws(() => buildSample(corpus, " ", 40));
  assert.deepEqual(drawSample(["b", "a"], 5, "s", "g"), ["a", "b"]);
});

test("the Wilson interval matches known values and handles the edges", () => {
  assert.deepEqual(wilsonInterval(0, 0), { estimate: null, low: null, high: null });
  const all = wilsonInterval(50, 50);
  assert.equal(all.estimate, 1);
  assert.equal(all.high, 1);
  assert.ok(all.low !== null && all.low > 0.92 && all.low < 0.93);
  const half = wilsonInterval(5, 10);
  assert.ok(half.low !== null && half.low > 0.23 && half.low < 0.24);
  assert.ok(half.high !== null && half.high > 0.76 && half.high < 0.77);
});

const sample = buildSample(corpus, "t", 30);
const target = sample.ecosystems.go?.[0] as { repository: string; commit: string };
const entry = (extra: Partial<ReviewEntry> = {}): ReviewEntry => ({
  ...target,
  ecosystem: "go",
  reviewer: "someone",
  reviewedAt: "2026-11-08",
  findings: [
    { ruleId: "r", path: "go.mod", line: 3, verdict: "correct" },
    { ruleId: "r", path: "Dockerfile", verdict: "incorrect" },
  ],
  missed: [{ path: "go.mod", line: 5, note: "old toolchain" }],
  ...extra,
});

test("a review must name a sampled repository, a reviewer, a date, and verdicts", () => {
  assert.deepEqual(reviewProblems(entry(), sample, []), []);
  assert.equal(reviewProblems(entry({ repository: "o/other" }), sample, []).length, 1);
  assert.equal(reviewProblems(entry(), sample, [entry()]).length, 1);
  assert.equal(reviewProblems(entry({ reviewer: " " }), sample, []).length, 1);
  assert.equal(reviewProblems(entry({ reviewedAt: "2026-13-40" }), sample, []).length, 1);
  assert.equal(reviewProblems(entry({ missed: [{ path: "x", note: "" }] }), sample, []).length, 1);
});

test("the report counts only reviewed repositories and carries the interval", () => {
  const report = tallyReviews(sample, [entry()]);
  assert.equal(report.total.reviewed, 1);
  assert.equal(report.total.sampled, 60);
  assert.equal(report.ecosystems.go?.precision.estimate, 0.5);
  assert.equal(report.ecosystems.go?.recall.estimate, 0.5);
  assert.equal(report.ecosystems.dart?.precision.estimate, null);
  assert.equal(unreviewed(sample, [entry()]).length, 59);
  assert.match(
    formatReport(report, "t"),
    /go: 1\/30 reviewed, 1 correct, 1 incorrect, 1 missed; precision 0\.5000 \(95% /,
  );
});

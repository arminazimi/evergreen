import assert from "node:assert/strict";
import { test } from "node:test";

import { riskScore } from "../src/domain.js";

test("a finding with no deadline, usage, or advisories scores zero", () => {
  assert.deepEqual(riskScore({}, "2026-10-25"), {
    score: 0,
    inputs: { daysPastEndOfLife: 0, usageCount: 0, advisories: 0 },
    points: { endOfLife: 0, usage: 0, advisories: 0 },
  });
});

test("a deadline in the future adds nothing", () => {
  assert.equal(riskScore({ deadline: "2027-01-01" }, "2026-10-25").points.endOfLife, 0);
});

test("time past end of life grows with the days and stops at 50 points after two years", () => {
  assert.equal(riskScore({ deadline: "2026-10-25" }, "2026-10-25").points.endOfLife, 0);
  assert.equal(riskScore({ deadline: "2025-10-25" }, "2026-10-25").inputs.daysPastEndOfLife, 365);
  assert.equal(riskScore({ deadline: "2025-10-25" }, "2026-10-25").points.endOfLife, 25);
  assert.equal(riskScore({ deadline: "2024-10-25" }, "2026-10-25").points.endOfLife, 50);
  assert.equal(riskScore({ deadline: "2015-01-01" }, "2026-10-25").points.endOfLife, 50);
});

test("usages add 5 points each up to 25, preferring the impact count", () => {
  const usage = { kind: "import" as const, language: "javascript" as const, symbol: "x", location: { path: "a.js" }, excerpt: "" };
  assert.equal(riskScore({ usages: [usage, usage] }, "2026-10-25").points.usage, 10);
  assert.equal(riskScore({ impact: { usageCount: 9, affectedFiles: 2, level: "high" } }, "2026-10-25").points.usage, 25);
});

test("advisories add 5 points each up to 25", () => {
  assert.equal(riskScore({}, "2026-10-25", 3).points.advisories, 15);
  assert.equal(riskScore({}, "2026-10-25", 40).points.advisories, 25);
});

test("the score is the sum of the points and is reproducible", () => {
  const finding = { deadline: "2025-10-25", impact: { usageCount: 2, affectedFiles: 1, level: "medium" as const } };
  const first = riskScore(finding, "2026-10-25", 1);
  assert.equal(first.score, 25 + 10 + 5);
  assert.deepEqual(riskScore(finding, "2026-10-25", 1), first);
});

test("an invalid day is rejected", () => {
  assert.throws(() => riskScore({}, "2026-13-40"), /not a date/);
  assert.throws(() => riskScore({}, "yesterday"), /not a date/);
});

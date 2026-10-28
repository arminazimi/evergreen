import assert from "node:assert/strict";
import { test } from "node:test";

import type { Forecast, ForecastEvent } from "../src/forecast.js";
import { renderForecastTimeline } from "../src/forecast-timeline.js";

/** A finding list of `count` entries, so the marker's number is visible and the input is fixed. */
const event = (ruleId: string, date: string, findings: number): ForecastEvent => ({
  date,
  ruleId,
  ecosystem: "demo",
  title: `Title ${ruleId}`,
  severity: "low",
  source: "https://example.com/x",
  findings: Array.from({ length: findings }, (_, index) => ({ id: `${ruleId}:package.json:${index + 1}`, path: "package.json", line: index + 1 })),
});

const many = (ruleId: string, date: string, count: number): ForecastEvent[] =>
  Array.from({ length: count }, (_, index) => event(`${ruleId}.${index + 1}`, date, 0));

const populated: Forecast = {
  schemaVersion: "evergreen.forecast.v1",
  root: "/repo",
  today: "2026-10-16",
  until: "2027-04-16",
  months: 6,
  groups: [
    { month: "2026-11", events: [event("nov", "2026-11-30", 0)] },
    { month: "2027-01", events: [event("jan.a", "2027-01-05", 3), event("jan.b", "2027-01-19", 2), event("jan.c", "2027-01-31", 0)] },
    { month: "2027-04", events: [event("apr", "2027-04-30", 1)] },
  ],
  affecting: 2,
  total: 5,
};

const busy: Forecast = {
  schemaVersion: "evergreen.forecast.v1",
  root: "/repo",
  today: "2026-10-16",
  until: "2027-04-16",
  months: 6,
  groups: [
    { month: "2027-01", events: many("jan", "2027-01-15", 12) },
    { month: "2027-03", events: [...many("mar", "2027-03-15", 5), event("mar.eol", "2027-03-31", 2)] },
  ],
  affecting: 1,
  total: 18,
};

const empty: Forecast = {
  schemaVersion: "evergreen.forecast.v1",
  root: "/repo",
  today: "2026-10-16",
  until: "2027-04-16",
  months: 6,
  groups: [],
  affecting: 0,
  total: 0,
};

const dim = (text: string): string => `\u001b[2m${text}\u001b[0m`;
const green = (text: string): string => `\u001b[32m${text}\u001b[0m`;
const yellow = (text: string): string => `\u001b[33m${text}\u001b[0m`;

test("draws one bar per month, scaled to the busiest month, and marks the months that hit the repository", () => {
  const expected = `Forecast from 2026-10-16 to 2027-04-16 (6 months)

2026-10  |
2026-11  |###############                                 1 event
2026-12  |
2027-01  |##############################################  3 events  ! 5 findings
2027-02  |
2027-03  |
2027-04  |###############                                 1 event  ! 1 finding`;
  assert.equal(renderForecastTimeline(populated), expected);
  assert.equal(renderForecastTimeline(populated, { width: 80, color: false }), expected);
  for (const line of expected.split("\n")) assert.ok(line.length <= 80, `"${line}" is wider than 80 columns`);
});

test("gives a month with many events the whole bar and scales the rest down", () => {
  const expected = `Forecast from 2026-10-16 to 2027-04-16 (6 months)

2026-10  |
2026-11  |
2026-12  |
2027-01  |##########################  12 events
2027-02  |
2027-03  |#############               6 events  ! 2 findings
2027-04  |`;
  assert.equal(renderForecastTimeline(busy, { width: 60 }), expected);
  for (const line of expected.split("\n")) assert.ok(line.length <= 60, `"${line}" is wider than 60 columns`);
});

test("returns one line when the window holds no dated event", () => {
  assert.equal(renderForecastTimeline(empty), "Nothing reaches a dated end of life between 2026-10-16 and 2027-04-16.");
  assert.equal(renderForecastTimeline(empty, { width: 20, color: true }), renderForecastTimeline(empty));
});

test("shrinks the bar first when the width is very narrow, keeping every label and count", () => {
  const expected = `Forecast from 2026-10-16 to 2027-04-16 (6 months)

2026-10  |
2026-11  |#  1 event
2026-12  |
2027-01  |#  3 events  ! 5 findings
2027-02  |
2027-03  |
2027-04  |#  1 event  ! 1 finding`;
  assert.equal(renderForecastTimeline(populated, { width: 24 }), expected);
  // The bar is one cell; labels and counts are never truncated, so the lines can exceed the width.
  assert.ok(expected.split("\n").some((line) => line.length > 24));
});

test("keeps plain ASCII unless color is asked for, and paints the axis, bars, and marker when it is", () => {
  assert.match(renderForecastTimeline(populated), /^[\x20-\x7e\n]*$/);
  const expected = [
    "Forecast from 2026-10-16 to 2027-04-16 (6 months)",
    "",
    `2026-10  ${dim("│")}`,
    `2026-11  ${dim("│")}${green("█")}  1 event`,
    `2026-12  ${dim("│")}`,
    `2027-01  ${dim("│")}${green("█")}  3 events  ${yellow("! 5 findings")}`,
    `2027-02  ${dim("│")}`,
    `2027-03  ${dim("│")}`,
    `2027-04  ${dim("│")}${green("█")}  1 event  ${yellow("! 1 finding")}`,
  ].join("\n");
  assert.equal(renderForecastTimeline(populated, { width: 24, color: true }), expected);
});

test("renders the same bytes for the same forecast and options", () => {
  assert.equal(renderForecastTimeline(busy, { width: 90 }), renderForecastTimeline(busy, { width: 90 }));
  assert.equal(renderForecastTimeline(busy, { width: 90, color: true }), renderForecastTimeline(busy, { width: 90, color: true }));
});

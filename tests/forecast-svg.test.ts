import assert from "node:assert/strict";
import { test } from "node:test";

import type { Severity } from "../src/domain.js";
import type { Forecast, ForecastEvent } from "../src/forecast.js";
import { renderForecastSvg } from "../src/forecast-svg.js";

const event = (date: string, title: string, severity: Severity, findings = 0): ForecastEvent => ({
  date,
  ruleId: `rule.${date}`,
  ecosystem: "node",
  title,
  severity,
  source: "https://example.com/source",
  findings: Array.from({ length: findings }, (_, index) => ({ id: `id-${index}`, path: "package.json" })),
});

const forecastOf = (events: ForecastEvent[]): Forecast => {
  const months = new Map<string, ForecastEvent[]>();
  for (const item of [...events].sort((left, right) => left.date.localeCompare(right.date))) {
    const month = item.date.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), item]);
  }
  return {
    schemaVersion: "evergreen.forecast.v1",
    root: ".",
    today: "2026-11-01",
    until: "2027-10-31",
    months: 12,
    groups: [...months].map(([month, items]) => ({ month, events: items })),
    affecting: events.filter((item) => item.findings.length > 0).length,
    total: events.length,
  };
};

test("identical forecasts render byte-identical, single, self-contained SVG", () => {
  const forecast = forecastOf([event("2027-01-15", "Node.js 18 end of life", "high", 2)]);
  const output = renderForecastSvg(forecast);
  assert.equal(output, renderForecastSvg(forecast));
  assert.match(output, /^<svg [^>]*role="img"/);
  assert.equal(output.match(/<svg/g)?.length, 1);
  assert.match(output, /prefers-color-scheme:dark/);
  assert.match(output, /--high:#B84A3E/);
  assert.doesNotMatch(output, /<script|href=|url\(|<image|onload=/i);
});

test("a populated forecast draws one marker per event, larger when it affects the repository", () => {
  const forecast = forecastOf([
    event("2026-11-20", "Runtime reaches end of life", "critical", 3),
    event("2027-03-01", "Package is deprecated", "medium"),
    event("2027-08-10", "API is retired", "low", 1),
  ]);
  const output = renderForecastSvg(forecast);
  assert.equal(output.match(/class="forecast-event /g)?.length, 3);
  assert.equal(output.match(/affecting"[^>]*r="7"/g)?.length, 2);
  assert.match(output, /class="forecast-event medium" cx="[^"]+" cy="116" r="4">/);
  assert.match(output, />Nov 2026</);
  assert.match(output, />Mar 2027</);
  assert.match(output, /2026-11-20: Runtime reaches end of life \(critical, affects 3 findings\)/);
  assert.match(output, /<desc id="forecast-desc">End-of-life forecast from 2026-11-01 to 2027-10-31: 3 events, 2 affecting this repository\./);
});

test("an empty forecast still renders the month axis", () => {
  const output = renderForecastSvg(forecastOf([]));
  assert.match(output, /0 events · 0 affecting this repository/);
  assert.doesNotMatch(output, /class="forecast-event/);
  assert.match(output, /class="forecast-tick"/);
  assert.match(output, /<desc id="forecast-desc">End-of-life forecast from 2026-11-01 to 2027-10-31: 0 events, 0 affecting this repository\.<\/desc>/);
});

test("registry titles are escaped everywhere they appear", () => {
  const hostile = `<script>alert("x")</script> & 'quoted'`;
  const output = renderForecastSvg(forecastOf([event("2027-01-15", hostile, "high")]));
  assert.doesNotMatch(output, /<script/i);
  assert.match(output, /<title>2027-01-15: &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &apos;quoted&apos; \(high\)<\/title>/);
  assert.match(output, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
});

test("the width option sets the viewport and clamps to a readable minimum", () => {
  const forecast = forecastOf([]);
  assert.match(renderForecastSvg(forecast, { width: 480 }), /width="480" height="220" viewBox="0 0 480 220"/);
  assert.match(renderForecastSvg(forecast, { width: 100 }), /width="320" height="220" viewBox="0 0 320 220"/);
});

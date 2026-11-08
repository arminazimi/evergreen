import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import type { Severity } from "../src/domain.js";
import type { Forecast, ForecastEvent } from "@velella/ebb/forecast";
import { renderForecastSvg } from "../src/forecast-svg.js";
import { runCli } from "./cli-runner.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

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
    schemaVersion: "ebb.forecast.v1",
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
  assert.match(
    output,
    /<desc id="forecast-desc">End-of-life forecast from 2026-11-01 to 2027-10-31: 3 events, 2 affecting this repository\./,
  );
});

test("an empty forecast still renders the month axis", () => {
  const output = renderForecastSvg(forecastOf([]));
  assert.match(output, /0 events · 0 affecting this repository/);
  assert.doesNotMatch(output, /class="forecast-event/);
  assert.match(output, /class="forecast-tick"/);
  assert.match(
    output,
    /<desc id="forecast-desc">End-of-life forecast from 2026-11-01 to 2027-10-31: 0 events, 0 affecting this repository\.<\/desc>/,
  );
});

test("registry titles are escaped everywhere they appear", () => {
  const hostile = `<script>alert("x")</script> & 'quoted'`;
  const output = renderForecastSvg(forecastOf([event("2027-01-15", hostile, "high")]));
  assert.doesNotMatch(output, /<script/i);
  assert.match(
    output,
    /<title>2027-01-15: &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &apos;quoted&apos; \(high\)<\/title>/,
  );
  assert.match(output, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
});

test("the width option sets the viewport and clamps to a readable minimum", () => {
  const forecast = forecastOf([]);
  assert.match(renderForecastSvg(forecast, { width: 480 }), /width="480" height="220" viewBox="0 0 480 220"/);
  assert.match(renderForecastSvg(forecast, { width: 100 }), /width="320" height="220" viewBox="0 0 320 220"/);
});

test("without animate the SVG keeps the bytes it had before animation existed", () => {
  const forecast = forecastOf([event("2027-01-15", "Node.js 18 end of life", "high", 2)]);
  const output = renderForecastSvg(forecast);
  assert.equal(
    createHash("sha256").update(output).digest("hex"),
    "b8c5ad6ab773e6f4013ee2469b57c089ce2c1b340be938f5f57e612ecb8c10e8",
  );
  assert.equal(output, renderForecastSvg(forecast, { animate: false }));
  assert.doesNotMatch(output, /@keyframes|forecast-bar|forecast-today|prefers-reduced-motion/);
});

test("animate adds a bar per event in date order and a today marker that pulses twice", () => {
  const forecast = forecastOf([
    event("2026-11-20", "Runtime reaches end of life", "critical", 3),
    event("2027-03-01", "Package is deprecated", "medium"),
    event("2027-08-10", "API is retired", "low", 1),
  ]);
  const output = renderForecastSvg(forecast, { animate: true });
  assert.equal(output, renderForecastSvg(forecast, { animate: true }));
  assert.equal(output.match(/class="forecast-bar /g)?.length, 3);
  assert.match(
    output,
    /class="forecast-bar critical affecting" x="64" y="81\.5" width="[^"]+" height="5" rx="2\.5" style="animation-delay:0ms"/,
  );
  assert.match(
    output,
    /class="forecast-bar medium" x="64" y="[^"]+" width="[^"]+" height="3" rx="1\.5" style="animation-delay:90ms"/,
  );
  assert.match(output, /class="forecast-today"><line x1="64"[^>]*\/><text[^>]*>today<\/text>/);
  assert.match(output, /animation:forecast-pulse 1\.2s ease-in-out 2/);
  assert.match(
    output,
    /@media \(prefers-reduced-motion:reduce\)\{\.evergreen-forecast \.forecast-bar,\.evergreen-forecast \.forecast-today\{animation:none\}\}/,
  );
  assert.doesNotMatch(output, /<script|<foreignObject|\bhref=|\bsrc=|url\(|<image|onload=/i);
});

test("the animation sequence stays under six seconds even with a long forecast", () => {
  const many = forecastOf(Array.from({ length: 100 }, (_, index) => event("2027-01-15", `Event ${index}`, "low")));
  const delays = [...renderForecastSvg(many, { animate: true }).matchAll(/animation-delay:(\d+)ms/g)].map((match) =>
    Number(match[1]),
  );
  assert.equal(delays.length, 100);
  assert.ok(Math.max(...delays) + 500 <= 6000, `the last bar starts at ${Math.max(...delays)}ms`);
});

test("the CLI prints the SVG with --svg, animates it only with --animate, and rejects conflicting output modes", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-forecast-svg-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "22" } }));
  const run = async (flags: string[]) => {
    const result = await runCli(["forecast", root, "--as-of", "2026-10-25", ...flags]);
    assert.equal(result.code, 0);
    return result.stdout;
  };
  const rejects = async (flags: string[], message: RegExp) => {
    const result = await runCli(["forecast", root, ...flags]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, message);
  };

  const staticSvg = await run(["--svg"]);
  assert.match(staticSvg, /^<svg [^>]*role="img"/);
  assert.doesNotMatch(staticSvg, /@keyframes|forecast-bar|forecast-today/);
  assert.match(await run(["--svg", "--animate"]), /@keyframes forecast-grow/);

  await rejects(["--animate"], /--animate needs --svg/);
  await rejects(["--svg", "--json"], /either --svg or --json/);
  await rejects(["--svg", "--timeline"], /either --svg or --timeline/);
});

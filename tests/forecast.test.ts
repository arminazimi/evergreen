import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import type { ScanResult } from "../src/domain.js";
import { addMonths, buildForecast, renderForecastText } from "../src/forecast.js";
import type { RegistryV2Rule } from "../src/registry.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const rule = (id: string, deadline: string | undefined): RegistryV2Rule => ({
  id,
  ecosystem: "demo",
  purl: "pkg:generic/demo",
  vers: "vers:semver/<2.0.0",
  event: "scheduled-end-of-life",
  title: `Title ${id}`,
  summary: "s",
  severity: "low",
  ...(deadline ? { deadline } : {}),
  sources: [{ title: "t", url: "https://example.com/x" }],
  provenance: { observedAt: "2026-10-16", reviewedAt: "2026-10-16", reviewer: "r" },
});

const scan = (ruleId: string): ScanResult => ({
  schemaVersion: "evergreen.scan.v1",
  root: "/repo",
  scannedAt: "2026-10-16T00:00:00.000Z",
  diagnostics: [],
  findings: [{ id: `${ruleId}:package.json:3`, ruleId, detector: "demo", title: "t", summary: "s", severity: "low", confidence: "exact", location: { path: "package.json", line: 3 }, sources: [] }],
});

const rules = [rule("a.nov", "2026-11-12"), rule("a.nov2", "2026-11-30"), rule("a.apr", "2027-04-30"), rule("a.far", "2028-01-01"), rule("a.past", "2026-10-01"), rule("a.none", undefined)];

test("groups the dated events in the window by month, in date order", () => {
  const forecast = buildForecast(scan("a.apr"), rules, "2026-10-16", 12);
  assert.equal(forecast.until, "2027-10-16");
  assert.deepEqual(forecast.groups.map((group) => [group.month, group.events.map((event) => event.ruleId)]), [
    ["2026-11", ["a.nov", "a.nov2"]],
    ["2027-04", ["a.apr"]],
  ]);
  assert.equal(forecast.total, 3);
  assert.equal(forecast.affecting, 1);
  assert.deepEqual(forecast.groups[1]?.events[0]?.findings, [{ id: "a.apr:package.json:3", path: "package.json", line: 3 }]);
});

test("the window narrows with the months, and the edge day is included", () => {
  assert.deepEqual(buildForecast(scan("a.apr"), rules, "2026-10-16", 6).groups.map((group) => group.month), ["2026-11"]);
  assert.equal(buildForecast(scan("a.apr"), [rule("a.edge", "2027-04-16")], "2026-10-16", 6).total, 1);
  assert.equal(addMonths("2026-10-16", 6), "2027-04-16");
});

test("events without a date, and dates outside the window, are never listed", () => {
  const ids = buildForecast(scan("a.none"), rules, "2026-10-16", 36).groups.flatMap((group) => group.events.map((event) => event.ruleId));
  assert.deepEqual(ids, ["a.nov", "a.nov2", "a.apr", "a.far"]);
});

test("output depends only on the inputs", () => {
  assert.deepEqual(buildForecast(scan("a.apr"), rules, "2026-10-16"), buildForecast(scan("a.apr"), rules, "2026-10-16"));
  assert.throws(() => buildForecast(scan("a.apr"), rules, "tomorrow"), /not a date/);
});

test("the text lists affected events with locations and counts the rest", () => {
  const text = renderForecastText(buildForecast(scan("a.apr"), rules, "2026-10-16"));
  assert.match(text, /2027-04\n {2}2027-04-30 {2}Title a\.apr \[low\] \(a\.apr\)\n {4}package\.json:3/);
  assert.match(text, /2 other dated events in the window do not affect this repository/);
  assert.doesNotMatch(text, /a\.nov/);
});

test("evergreen forecast reports Node.js 22 reaching end of life, for a fixed date", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-forecast-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "22" } }));
  const run = async (...flags: string[]) => (await execute(process.execPath, [cli, "forecast", root, "--as-of", "2026-10-25", ...flags])).stdout;

  const json = JSON.parse(await run("--json")) as { today: string; months: number; affecting: number; groups: Array<{ month: string; events: Array<{ ruleId: string; findings: unknown[] }> }> };
  assert.equal(json.today, "2026-10-25");
  assert.equal(json.months, 12);
  const april = json.groups.find((group) => group.month === "2027-04");
  assert.ok(april?.events.some((event) => event.findings.length > 0));
  assert.ok(json.affecting >= 1);
  assert.equal(await run("--json"), await run("--json"));

  const sixMonths = JSON.parse(await run("--months", "6", "--json")) as { groups: Array<{ month: string }> };
  assert.ok(!sixMonths.groups.some((group) => group.month === "2027-04"));
  assert.match(await run(), /2027-04-30/);
});

test("rejects a months value that is not a whole number from 1 to 36", async () => {
  for (const value of ["0", "x", "1.5", "37"]) {
    await assert.rejects(execute(process.execPath, [cli, "forecast", ".", "--months", value]), (error: { code?: number }) => error.code === 2);
  }
});

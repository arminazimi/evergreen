import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import {
  buildCountdownRows,
  COUNTDOWN_MAX_TICKS,
  COUNTDOWN_WINDOW_DAYS,
  countdownColor,
  formatCountdown,
  renderCountdown,
  renderCountdownJson,
  runCountdown,
} from "@velella/ebb/countdown";
import type { CountdownIo, CountdownRow } from "@velella/ebb/countdown";
import type { Forecast, ForecastEvent } from "@velella/ebb/forecast";
import { runCli } from "./cli-runner.js";

const roots: string[] = [];
const DAY = 86_400;
const now = Date.parse("2026-10-25T00:00:00Z");

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const event = (title: string, date: string, ruleId: string, findings = true): ForecastEvent => ({
  date,
  ruleId,
  ecosystem: "demo",
  title,
  severity: "low",
  source: "https://example.com/x",
  findings: findings ? [{ id: `${ruleId}:package.json:3`, path: "package.json", line: 3 }] : [],
});

const forecastOf = (events: ForecastEvent[]): Forecast => ({
  schemaVersion: "ebb.forecast.v1",
  root: "/repo",
  today: "2026-10-25",
  until: "2028-10-25",
  months: 24,
  groups: events.length === 0 ? [] : [{ month: events[0]!.date.slice(0, 7), events }],
  affecting: events.filter((candidate) => candidate.findings.length > 0).length,
  total: events.length,
});

const row = (remainingSeconds: number): CountdownRow => ({
  subject: "Demo",
  deadline: "2027-01-01",
  remainingSeconds,
  ruleId: "demo.rule",
  location: { path: "package.json", line: 3 },
});

const barOf = (remainingSeconds: number, color = false): string =>
  renderCountdown([row(remainingSeconds)], { barWidth: 24, color }).split("\n")[2]!;

test("orders rows by deadline, folds duplicate subjects, drops events without findings, and applies the limit", () => {
  const forecast = forecastOf([
    event("Ubuntu ends", "2027-06-01", "container.ubuntu"),
    event("Alpine ends", "2026-11-01", "container.alpine"),
    event("Alpine ends", "2026-12-01", "container.alpine.again"),
    event("Nothing uses this", "2026-11-05", "unused.rule", false),
    event(".NET ends", "2026-11-10", "dotnet.runtime"),
  ]);
  const rows = buildCountdownRows(forecast, { now });
  assert.deepEqual(
    rows.map((candidate) => [candidate.subject, candidate.deadline]),
    [
      ["Alpine ends", "2026-11-01"],
      [".NET ends", "2026-11-10"],
      ["Ubuntu ends", "2027-06-01"],
    ],
  );
  assert.equal(rows[0]!.remainingSeconds, 7 * DAY);
  assert.equal(rows[0]!.ruleId, "container.alpine");
  assert.deepEqual(rows[0]!.location, { path: "package.json", line: 3 });
  assert.deepEqual(
    buildCountdownRows(forecast, { now, limit: 2 }).map((candidate) => candidate.subject),
    ["Alpine ends", ".NET ends"],
  );
});

test("colors turn at the 180-day and 30-day boundaries and dim once ended", () => {
  assert.equal(countdownColor(181 * DAY), "green");
  assert.equal(countdownColor(180 * DAY), "yellow");
  assert.equal(countdownColor(30 * DAY), "yellow");
  assert.equal(countdownColor(30 * DAY - 1), "red");
  assert.equal(countdownColor(0), "red");
  assert.equal(countdownColor(-1), "dim");
});

test("the bar is proportional to the remaining time in a two-year window", () => {
  assert.equal((barOf(COUNTDOWN_WINDOW_DAYS * DAY).match(/#/g) ?? []).length, 24);
  assert.equal((barOf(365 * DAY).match(/#/g) ?? []).length, 12);
  assert.equal((barOf(0).match(/#/g) ?? []).length, 0);
  assert.equal((barOf(-37 * DAY).match(/#/g) ?? []).length, 0);
  assert.match(barOf(200 * DAY, true), /\u001b\[32m/);
  assert.match(barOf(100 * DAY, true), /\u001b\[33m/);
  assert.match(barOf(10 * DAY, true), /\u001b\[31m/);
  assert.match(barOf(-37 * DAY, true), /\u001b\[2m/);
  assert.doesNotMatch(barOf(200 * DAY, true), /\u001b\[33m/);
});

test("the header and bar width fall back when they are not given", () => {
  assert.match(renderCountdown([row(365 * DAY)]), /^Lifecycle countdown\n/);
  const bar = renderCountdown([row(365 * DAY)], { barWidth: 0 }).split("\n")[2]!;
  assert.equal((bar.match(/#/g) ?? []).length, 12);
});

test("an ended deadline reads as the days since it passed", () => {
  assert.equal(formatCountdown(412 * DAY + 6 * 3600 + 13 * 60 + 9), "412d 06h 13m 09s");
  assert.equal(formatCountdown(0), "0d 00h 00m 00s");
  assert.equal(formatCountdown(-37 * DAY), "ended 37 days ago");
  assert.equal(formatCountdown(-DAY), "ended 1 day ago");
  const text = renderCountdown([row(-37 * DAY)], { asOf: "2026-12-01" });
  assert.match(text, /Lifecycle countdown as of 2026-12-01 \(deadlines at 00:00 UTC\)/);
  assert.match(text, /ended 37 days ago/);
  assert.equal(
    renderCountdown([], { asOf: "2026-12-01" }),
    "Lifecycle countdown as of 2026-12-01 (deadlines at 00:00 UTC)\n\nNo dated lifecycle deadlines affect this repository.",
  );
});

test("the JSON document carries the five row fields and a fixed as-of instant", () => {
  const rows = buildCountdownRows(forecastOf([event("Node.js 22 ends", "2027-04-30", "nodejs.runtime.eol-22")]), {
    now,
  });
  const parsed = JSON.parse(renderCountdownJson(rows, now)) as {
    schemaVersion: string;
    asOf: string;
    rows: Array<Record<string, unknown>>;
  };
  assert.equal(parsed.schemaVersion, "ebb.countdown.v1");
  assert.equal(parsed.asOf, "2026-10-25T00:00:00.000Z");
  assert.deepEqual(Object.keys(parsed.rows[0]!).sort(), [
    "deadline",
    "location",
    "remainingSeconds",
    "ruleId",
    "subject",
  ]);
  assert.equal(parsed.rows[0]!.deadline, "2027-04-30");
  assert.equal(parsed.rows[0]!.remainingSeconds, 187 * DAY);
  assert.deepEqual(parsed.rows[0]!.location, { path: "package.json", line: 3 });
});

function fakeIo(isTTY = true) {
  const writes: string[] = [];
  const timers: Array<() => void> = [];
  let cleared = 0;
  let disposed = 0;
  let interrupt: (() => void) | undefined;
  const io: CountdownIo = {
    isTTY,
    write: (text) => {
      writes.push(text);
    },
    setInterval: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    clearInterval: () => {
      cleared += 1;
    },
    onInterrupt: (handler) => {
      interrupt = handler;
      return () => {
        disposed += 1;
      };
    },
  };
  return {
    io,
    writes,
    timers,
    cleared: () => cleared,
    disposed: () => disposed,
    interrupt: () => interrupt?.(),
  };
}

const animationForecast = forecastOf([event("Alpine ends", "2026-11-01", "container.alpine")]);
const animationOptions = { forecast: animationForecast, now, asOf: "2026-10-25", color: false };

test("a terminal animation stops after six one-second ticks with the final frame", async () => {
  const harness = fakeIo();
  const done = runCountdown({ ...animationOptions, io: harness.io });
  harness.timers[0]!();
  harness.timers[0]!();
  harness.timers[0]!();
  harness.timers[0]!();
  harness.timers[0]!();
  harness.timers[0]!();
  assert.equal(await done, 0);
  assert.equal(COUNTDOWN_MAX_TICKS, 6);
  assert.equal(harness.writes.length, 1 + COUNTDOWN_MAX_TICKS);
  assert.match(harness.writes[0]!, /7d 00h 00m 00s/);
  assert.match(harness.writes[harness.writes.length - 1]!, /6d 23h 59m 54s/);
  assert.equal(harness.cleared(), 1);
  assert.equal(harness.disposed(), 1);
});

test("Ctrl-C clears the timer, removes the listener, and stops without another frame", async () => {
  const harness = fakeIo();
  const done = runCountdown({ ...animationOptions, io: harness.io });
  harness.interrupt();
  assert.equal(await done, 130);
  assert.equal(harness.cleared(), 1);
  assert.equal(harness.disposed(), 1);
  assert.equal(harness.writes.length, 1);
});

test("off a terminal, with --once, and with --no-animation it prints one static frame", async () => {
  const offTerminal = fakeIo(false);
  const once = fakeIo(true);
  const noAnimation = fakeIo(true);
  const results = [
    await runCountdown({ ...animationOptions, io: offTerminal.io }),
    await runCountdown({ ...animationOptions, io: once.io, once: true }),
    await runCountdown({ ...animationOptions, io: noAnimation.io, noAnimation: true }),
  ];
  assert.deepEqual(results, [0, 0, 0]);
  for (const harness of [offTerminal, once, noAnimation]) {
    assert.equal(harness.writes.length, 1);
    assert.equal(harness.timers.length, 0);
  }
});

test("the CLI prints one plain frame off a terminal and a JSON document with --json", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-countdown-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "22" } }));
  const run = async (...flags: string[]) => {
    const result = await runCli(["countdown", root, "--as-of", "2026-10-25", ...flags]);
    assert.equal(result.code, 0);
    return result.stdout;
  };

  const text = await run();
  assert.match(text, /Node\.js 22/);
  assert.match(text, /Lifecycle countdown as of 2026-10-25/);
  assert.doesNotMatch(text, /\u001b/);

  const parsed = JSON.parse(await run("--json")) as {
    schemaVersion: string;
    rows: Array<{ ruleId: string; deadline: string; remainingSeconds: number }>;
  };
  assert.equal(parsed.schemaVersion, "ebb.countdown.v1");
  assert.equal(parsed.rows[0]!.ruleId, "nodejs.runtime.eol-22");
  assert.equal(parsed.rows[0]!.deadline, "2027-04-30");
  assert.equal(parsed.rows[0]!.remainingSeconds, (Date.parse("2027-04-30T00:00:00Z") - now) / 1000);

  const limited = JSON.parse(await run("--json", "--limit", "1")) as { rows: unknown[] };
  assert.equal(limited.rows.length, 1);
});

test("rejects a limit that is not a whole number of at least 1", async () => {
  for (const value of ["0", "-1", "x", "1.5"]) {
    const result = await runCli(["countdown", ".", "--limit", value]);
    assert.equal(result.code, 2);
  }
  const missing = await runCli(["countdown", ".", "--limit"]);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /--limit needs a whole number/);
});

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { RegistryV2Rule } from "../src/registry.js";
import { buildCalendar, loadRules, main, renderIcs, renderMarkdown } from "../tools/eol-calendar.js";

const rule = (id: string, deadline: string | undefined, title = `Title ${id}`): RegistryV2Rule => ({
  id,
  ecosystem: "demo",
  purl: "pkg:generic/demo",
  vers: "vers:semver/<2.0.0",
  event: "end-of-life",
  title,
  summary: "s",
  severity: "high",
  ...(deadline ? { deadline } : {}),
  sources: [{ title: "t", url: "https://example.com/x" }],
  provenance: { observedAt: "2026-10-16", reviewedAt: "2026-10-16", reviewer: "r" },
});

const rules = [rule("a.late", "2027-04-30"), rule("a.soon", "2026-11-12"), rule("a.edge", "2027-04-16"), rule("a.past", "2026-10-01"), rule("a.old", "2025-01-01"), rule("a.none", undefined)];

test("windows the deadlines around the reference day, in date order", () => {
  const calendar = buildCalendar(rules, "2026-10-16");
  assert.deepEqual(calendar.upcoming.map((entry) => entry.ruleId), ["a.soon", "a.edge"]);
  assert.deepEqual(calendar.recent.map((entry) => entry.ruleId), ["a.past"]);
  assert.equal(calendar.until, "2027-04-16");
  assert.deepEqual(buildCalendar(rules, "2026-10-16", 7).upcoming.map((entry) => entry.ruleId), ["a.soon", "a.edge", "a.late"]);
});

test("a deadline on the reference day is upcoming, not recent", () => {
  const calendar = buildCalendar([rule("a.today", "2026-10-16")], "2026-10-16");
  assert.equal(calendar.upcoming.length, 1);
  assert.equal(calendar.recent.length, 0);
});

test("rejects a reference day that is not a date", () => {
  assert.throws(() => buildCalendar(rules, "tomorrow"), /not a date/);
});

test("renders Markdown with escaped cells and an empty message", () => {
  const text = renderMarkdown(buildCalendar([rule("a.soon", "2026-11-12", "A | B")], "2026-10-16"));
  assert.match(text, /\| 2026-11-12 \| demo \| A \\\| B \| high \| `a.soon` \|/);
  assert.match(renderMarkdown(buildCalendar([], "2026-10-16")), /None in the registry\./);
});

test("renders a deterministic iCalendar file with CRLF lines and all-day events", () => {
  const ics = renderIcs(buildCalendar([rule("a.soon", "2026-11-12", "Ends, soon; really")], "2026-10-16"));
  assert.equal(ics, renderIcs(buildCalendar([rule("a.soon", "2026-11-12", "Ends, soon; really")], "2026-10-16")));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /DTSTART;VALUE=DATE:20261112\r\nDTEND;VALUE=DATE:20261113\r\n/);
  assert.match(ics, /SUMMARY:Ends\\, soon\; really\r\n/);
  assert.match(ics, /UID:a\.soon@evergreen\r\n/);
});

test("the real registry loads and the command writes both files", async () => {
  assert.ok((await loadRules()).length > 100);
  const directory = await mkdtemp(join(tmpdir(), "evergreen-calendar-"));
  try {
    assert.equal(await main(["--today", "2026-10-16", "--out-dir", directory]), 0);
    assert.match(await readFile(join(directory, "eol-calendar.md"), "utf8"), /^# Lifecycle calendar/);
    assert.match(await readFile(join(directory, "eol-calendar.ics"), "utf8"), /^BEGIN:VCALENDAR/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

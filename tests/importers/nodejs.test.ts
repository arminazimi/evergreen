import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { FIRST_DRAFTED_MAJOR, NODEJS_SCHEDULE_URL, nodejsScheduleImporter } from "../../tools/importers/nodejs.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/nodejs-schedule.json");

function inline(schedule: unknown, now = "2026-10-15"): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url) {
      assert.equal(url, NODEJS_SCHEDULE_URL);
      return typeof schedule === "string" ? schedule : JSON.stringify(schedule);
    },
  };
}

test("drafts one end-of-life rule per release line whose end date has passed, from the recorded schedule", async () => {
  const drafts = await execute(nodejsScheduleImporter, { replay: recording });
  assert.equal(drafts.observedAt, "2026-10-15");
  assert.deepEqual(drafts.rules.map((rule) => [rule.id, rule.deadline]), [
    ["nodejs.runtime.eol-18", "2025-04-30"],
    ["nodejs.runtime.eol-19", "2023-06-01"],
    ["nodejs.runtime.eol-20", "2026-04-30"],
    ["nodejs.runtime.eol-21", "2024-06-01"],
    ["nodejs.runtime.eol-22", "2027-04-30"],
    ["nodejs.runtime.eol-23", "2025-06-01"],
    ["nodejs.runtime.eol-25", "2026-06-01"],
  ]);
  const eol20 = drafts.rules.find((rule) => rule.id === "nodejs.runtime.eol-20")!;
  assert.equal(eol20.purl, "pkg:generic/nodejs");
  assert.equal(eol20.vers, "vers:semver/>=20.0.0|<21.0.0");
  assert.equal(eol20.event, "end-of-life");
  assert.equal(eol20.title, "Node.js 20 is end-of-life");
  assert.equal(eol20.replacement, "Node.js 22 LTS or later");
  assert.deepEqual(eol20["x-nodejs"], { major: 20 });
  assert.deepEqual(eol20.sources, [{ title: "Node.js Release Working Group schedule", url: "https://github.com/nodejs/Release/blob/main/schedule.json" }]);
  assert.deepEqual(eol20.provenance, { observedAt: "2026-10-15", reviewedAt: "2026-10-15", reviewer: "pending-review", importer: "nodejs-schedule" });
});

test("explains what it left out", async () => {
  const { notes } = await execute(nodejsScheduleImporter, { replay: recording });
  assert.deepEqual(notes, [
    `Skipped 17 release lines older than v${FIRST_DRAFTED_MAJOR} (v0.8 to v17); the hand-written nodejs.runtime.legacy rule covers them.`,
    "Not yet end-of-life: v24 (ends 2028-04-30), v26 (ends 2029-04-30), v27 (ends 2030-04-30).",
  ]);
});

test("drafts a scheduled rule for a line that ends within twelve months, with the id of the later end-of-life rule", async () => {
  const drafts = await execute(nodejsScheduleImporter, { replay: recording });
  const scheduled = drafts.rules.find((rule) => rule.id === "nodejs.runtime.eol-22")!;
  assert.equal(scheduled.event, "scheduled-end-of-life");
  assert.equal(scheduled.severity, "low");
  assert.equal(scheduled.deadline, "2027-04-30");
  assert.equal(scheduled.vers, "vers:semver/>=22.0.0|<23.0.0");
  assert.equal(scheduled.replacement, "Node.js 24 LTS or later");
  assert.deepEqual(scheduled["x-nodejs"], { major: 22, scheduled: true });
  assert.match(scheduled.migration!.steps[0]!.instructions, /Node\.js 24 LTS or later/);

  // The day it ends the same id becomes the end-of-life rule.
  const promoted = await execute(nodejsScheduleImporter, { replay: recording, now: "2027-04-30" });
  const ended = promoted.rules.find((rule) => rule.id === "nodejs.runtime.eol-22")!;
  assert.equal(ended.event, "end-of-life");
  assert.equal(ended.severity, "high");
  assert.deepEqual(ended["x-nodejs"], { major: 22 });
});

test("a line that ends more than twelve months away is only noted", async () => {
  const schedule = { v22: { start: "2024-04-24", lts: "2024-10-29", end: "2027-04-30" } };
  const early = await runImporter(nodejsScheduleImporter, inline(schedule, "2026-04-30"));
  assert.deepEqual(early.rules.map((rule) => rule.event), ["scheduled-end-of-life"]);
  const far = await runImporter(nodejsScheduleImporter, inline(schedule, "2026-04-29"));
  assert.equal(far.rules.length, 0);
  assert.ok(far.notes.includes("Not yet end-of-life: v22 (ends 2027-04-30)."));
});

test("follows the calendar: a later run drafts more lines and moves the recommended LTS", async () => {
  const before = await execute(nodejsScheduleImporter, { replay: recording, now: "2025-01-01" });
  assert.deepEqual(before.rules.map((rule) => rule.id), ["nodejs.runtime.eol-18", "nodejs.runtime.eol-19", "nodejs.runtime.eol-21", "nodejs.runtime.eol-23"]);
  assert.deepEqual(before.rules.map((rule) => rule.event), ["scheduled-end-of-life", "end-of-life", "end-of-life", "scheduled-end-of-life"]);

  const later = await execute(nodejsScheduleImporter, { replay: recording, now: "2027-05-01" });
  assert.ok(later.rules.some((rule) => rule.id === "nodejs.runtime.eol-22"), "v22 ends 2027-04-30");
  assert.equal(later.rules.find((rule) => rule.id === "nodejs.runtime.eol-20")!.replacement, "Node.js 24 LTS or later");
  assert.match(later.rules[0]!.migration!.steps[0]!.instructions, /Node\.js 24 LTS or later/);
});

test("a line ends on its end date", async () => {
  const schedule = { v20: { start: "2023-04-18", lts: "2023-10-24", end: "2026-04-30" }, v22: { start: "2024-04-24", lts: "2024-10-29", end: "2027-04-30" } };
  assert.deepEqual((await runImporter(nodejsScheduleImporter, inline(schedule, "2026-04-29"))).rules.map((rule) => rule.event), ["scheduled-end-of-life"]);
  assert.deepEqual((await runImporter(nodejsScheduleImporter, inline(schedule, "2026-04-30"))).rules.map((rule) => rule.event), ["end-of-life", "scheduled-end-of-life"]);
});

test("agrees with the hand-written rules on everything except what the official schedule disputes", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/nodejs.json"), "utf8")) as RegistryV2;
  const drafts = await execute(nodejsScheduleImporter, { replay: recording });
  for (const id of ["nodejs.runtime.eol-18", "nodejs.runtime.eol-20"]) {
    const draft = drafts.rules.find((rule) => rule.id === id)! as unknown as Record<string, unknown>;
    const existing = registry.rules.find((rule) => rule.id === id)! as unknown as Record<string, unknown>;
    for (const field of ["purl", "vers", "event", "title", "summary", "severity", "replacement", "migration", "x-nodejs"]) {
      assert.deepEqual(draft[field], existing[field], `${id}.${field}`);
    }
  }
  // The registry's rule for a line that is still current is never touched.
  const diff = diffDrafts(drafts, registry);
  assert.ok(!diff.removed.some((rule) => rule.id === "nodejs.runtime.legacy"));
  assert.ok(diff.changed.every((change) => change.fields.length === 0), "only dates and sources can differ");
});

test("skips entries it cannot use and says so", async () => {
  const schedule = {
    v18: { start: "2022-04-19", end: "2025-04-30" },
    v19: { start: "2022-10-18", end: "June 2023" },
    v20: { start: "2023-04-18" },
    v21: "not an object",
    v22: { lts: "2024-10-29", end: "2027-04-30" },
    v16: { end: "2023-09-11" },
    "v18.1": { end: "2025-01-01" },
    vnext: { end: "2026-01-01" },
  };
  const result = await runImporter(nodejsScheduleImporter, inline(schedule));
  assert.deepEqual(result.rules.map((rule) => rule.id), ["nodejs.runtime.eol-18", "nodejs.runtime.eol-22"]);
  assert.deepEqual(result.notes, [
    "Skipped v18.1: not a release line name this importer understands.",
    "Skipped v19: the schedule has no valid end date for it.",
    "Skipped v20: the schedule has no valid end date for it.",
    "Skipped v21: the schedule has no valid end date for it.",
    "Skipped vnext: not a release line name this importer understands.",
    "Skipped 1 release line older than v18 (v16); the hand-written nodejs.runtime.legacy rule covers it.",
  ]);
});

test("without a supported long-term-support line it drafts no replacement and says so", async () => {
  const result = await runImporter(nodejsScheduleImporter, inline({ v18: { start: "2022-04-19", end: "2025-04-30" } }));
  assert.equal(result.rules.length, 1);
  assert.equal(result.rules[0]!.replacement, undefined);
  assert.equal(result.rules[0]!.migration, undefined);
  assert.match(result.notes[0]!, /No supported long-term-support line/);
});

test("rejects a response that is not a schedule", async () => {
  await assert.rejects(runImporter(nodejsScheduleImporter, inline("<html>")), /not valid JSON/);
});

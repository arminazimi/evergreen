import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { PYTHON_RELEASE_CYCLE_URL, pythonReleaseCycleImporter } from "../../tools/importers/python.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/python-release-cycle.json");

function inline(cycle: unknown, now = "2026-10-15"): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url) {
      assert.equal(url, PYTHON_RELEASE_CYCLE_URL);
      return JSON.stringify(cycle);
    },
  };
}

const line = (status: string, end: string, pep = 100) => ({ status, first_release: "2020-01-01", end_of_life: end, pep });

test("drafts the catch-all rule for the newest end-of-life release line in the recorded schedule", async () => {
  const drafts = await execute(pythonReleaseCycleImporter, { replay: recording });
  assert.equal(drafts.rules.length, 1);
  const rule = drafts.rules[0]!;
  assert.equal(rule.id, "python.runtime.eol-3.10-and-older");
  assert.equal(rule.purl, "pkg:generic/python");
  assert.equal(rule.vers, "vers:pypi/<3.11");
  assert.equal(rule.event, "end-of-life");
  assert.equal(rule.title, "Python 3.10 and older are end-of-life");
  assert.equal(rule.deadline, "2026-10-01");
  assert.deepEqual(rule["x-python"], { kind: "runtime", maximumVersion: "3.10" });
  assert.deepEqual(rule.sources.map((source) => source.url), [
    "https://devguide.python.org/versions/",
    "https://peps.python.org/api/release-cycle.json",
    "https://peps.python.org/pep-0619/",
  ]);
  assert.deepEqual(drafts.notes, ["Not yet end-of-life: 3.11 (ends 2027-10), 3.12 (ends 2028-10), 3.13 (ends 2029-10), 3.14 (ends 2030-10), 3.15 (ends 2031-10), 3.16 (ends 2032-10)."]);
});

test("an exact end date ends a line on that day", async () => {
  const cycle = { "3.9": line("end-of-life", "2025-10-31"), "3.10": line("security", "2026-10-01") };
  assert.equal((await runImporter(pythonReleaseCycleImporter, inline(cycle, "2026-09-30"))).rules[0]!.id, "python.runtime.eol-3.9-and-older");
  assert.equal((await runImporter(pythonReleaseCycleImporter, inline(cycle, "2026-10-01"))).rules[0]!.id, "python.runtime.eol-3.10-and-older");
});

test("when the schedule had not yet ended 3.10, it reproduces the hand-written rule except for one added source", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/python.json"), "utf8")) as RegistryV2;
  const cycle = { "3.9": line("end-of-life", "2025-10-31", 596), "3.10": line("security", "2026-10-01", 619) };
  const drafts = await runImporter(pythonReleaseCycleImporter, inline(cycle, "2025-12-01"));
  const diff = diffDrafts(drafts, registry);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.changed.map((change) => change.id), ["python.runtime.eol-3.9-and-older"]);
  const [change] = diff.changed;
  assert.deepEqual([change!.dates, change!.fields], [[], []], "the date and every field match the hand-written rule");
  assert.deepEqual(change!.sources?.added.map((source) => source.url), ["https://peps.python.org/api/release-cycle.json"]);
  assert.deepEqual([change!.sources?.removed, change!.sources?.retitled], [[], []]);
});

test("the registry covers every line the schedule says has ended: the 3.9 and 3.10 rules are both present", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/python.json"), "utf8")) as RegistryV2;
  const drafts = await execute(pythonReleaseCycleImporter, { replay: recording });
  const diff = diffDrafts(drafts, registry);
  // Python 3.10 ended on 2026-10-01; the registry gained that rule next to the 3.9 one, so nothing is left to add.
  assert.deepEqual(diff.added.map((rule) => rule.id), []);
  const ids = registry.rules.map((rule) => rule.id);
  assert.ok(ids.includes("python.runtime.eol-3.9-and-older") && ids.includes("python.runtime.eol-3.10-and-older"));
});

test("the draft is exactly what the Python detector reads", async () => {
  const [rule] = (await execute(pythonReleaseCycleImporter, { replay: recording })).rules;
  const hints = rule!["x-python"] as { kind: string; maximumVersion: string };
  assert.equal(hints.kind, "runtime");
  assert.match(hints.maximumVersion, /^\d+\.\d+$/);
});

test("an announced month is not an end date, but it becomes the deadline once the schedule says the line has ended", async () => {
  const cycle = { "3.9": line("end-of-life", "2025-10-31"), "3.10": line("end-of-life", "2026-10"), "3.11": line("security", "2027-10") };
  const result = await runImporter(pythonReleaseCycleImporter, inline(cycle));
  assert.equal(result.rules[0]!.id, "python.runtime.eol-3.10-and-older");
  assert.equal(result.rules[0]!.deadline, "2026-10-31");
  assert.ok(result.notes.includes("Python 3.10 has no exact end date yet; the deadline is the last day of its end month."));

  const early = await runImporter(pythonReleaseCycleImporter, inline({ "3.9": line("end-of-life", "2025-10-31"), "3.10": line("security", "2026-10") }));
  assert.equal(early.rules[0]!.id, "python.runtime.eol-3.9-and-older", "a month alone never ends a line");
});

test("reports when the status and the date disagree", async () => {
  const late = await runImporter(pythonReleaseCycleImporter, inline({ "3.9": line("end-of-life", "2025-10-31"), "3.10": line("security", "2026-10-01") }));
  assert.equal(late.rules[0]!.id, "python.runtime.eol-3.10-and-older", "an exact end date that has passed counts");
  assert.ok(late.notes.includes('Python 3.10: the end date 2026-10-01 has passed but the schedule\'s status is "security".'));

  const early = await runImporter(pythonReleaseCycleImporter, inline({ "3.9": line("end-of-life", "2025-10-31"), "3.10": line("end-of-life", "2027-01-01") }));
  assert.equal(early.rules[0]!.id, "python.runtime.eol-3.10-and-older");
  assert.ok(early.notes.includes("Python 3.10: the schedule's status is end-of-life but its end date 2027-01-01 is in the future."));
});

test("does not claim 'and older' when an older line is still supported", async () => {
  const result = await runImporter(pythonReleaseCycleImporter, inline({ "3.9": line("security", "2027-10-31"), "3.10": line("end-of-life", "2026-10-01") }));
  assert.deepEqual(result.rules, []);
  assert.ok(result.notes.some((note) => /Not drafted: Python 3\.10 has ended but 3\.9 has not/.test(note)));
});

test("says so when nothing has ended or the end date is unusable", async () => {
  const none = await runImporter(pythonReleaseCycleImporter, inline({ "3.14": line("bugfix", "2030-10") }));
  assert.deepEqual(none.rules, []);
  assert.ok(none.notes.includes("No Python release line has reached end of life, so there is nothing to draft."));

  const unusable = await runImporter(pythonReleaseCycleImporter, inline({ "3.9": { status: "end-of-life", pep: 596 } }));
  assert.deepEqual(unusable.rules, []);
  assert.ok(unusable.notes.includes("Not drafted: the schedule gives no usable end date for Python 3.9."));
});

test("skips names that are not release lines and sorts minors numerically", async () => {
  const result = await runImporter(pythonReleaseCycleImporter, inline({ "3.9": line("end-of-life", "2025-10-31"), "3.10": line("end-of-life", "2026-10-01"), "3.2": line("end-of-life", "2016-02-20"), next: line("feature", "2040-10") }));
  assert.equal(result.rules[0]!.id, "python.runtime.eol-3.10-and-older", "3.10 is newer than 3.9, not older");
  assert.ok(result.notes.includes("Skipped next: not a release line name this importer understands."));
});

test("omits the PEP source when the schedule gives none", async () => {
  const cycle = { "3.9": { status: "end-of-life", first_release: "2020-10-05", end_of_life: "2025-10-31" } };
  const [rule] = (await runImporter(pythonReleaseCycleImporter, inline(cycle))).rules;
  assert.equal(rule!.sources.length, 2);
});

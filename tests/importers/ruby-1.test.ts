import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { RUBY_BRANCHES_URL, rubyMaintenanceImporter } from "../../tools/importers/ruby-1.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/ruby-1.json");

function page(branches: unknown): string {
  return `<script type="ruby-lang-org-data" id="branches.json">${JSON.stringify(branches)}</script>`;
}

function inline(body: unknown, now = "2026-10-18"): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url, options) {
      assert.equal(url, RUBY_BRANCHES_URL);
      assert.equal(options?.accept, "text/html");
      return typeof body === "string" ? body : page(body);
    },
  };
}

test("drafts one end-of-life rule per eol release line from the recording", async () => {
  const drafts = await execute(rubyMaintenanceImporter, { replay: recording, now: "2026-10-18" });
  assert.equal(drafts.observedAt, "2026-10-18");
  assert.deepEqual(drafts.rules.map((rule) => rule.id), [
    "ruby.runtime.eol-1.9.3",
    "ruby.runtime.eol-2.0.0",
    "ruby.runtime.eol-2.1",
    "ruby.runtime.eol-2.2",
    "ruby.runtime.eol-2.3",
    "ruby.runtime.eol-2.4",
    "ruby.runtime.eol-2.5",
    "ruby.runtime.eol-2.6",
    "ruby.runtime.eol-2.7",
    "ruby.runtime.eol-3.0",
    "ruby.runtime.eol-3.1",
    "ruby.runtime.eol-3.2",
  ]);
  const eol32 = drafts.rules.find((rule) => rule.id === "ruby.runtime.eol-3.2")!;
  assert.equal(eol32.purl, "pkg:generic/ruby");
  assert.equal(eol32.vers, "vers:gem/>=3.2.0|<3.3.0");
  assert.equal(eol32.event, "end-of-life");
  assert.equal(eol32.title, "Ruby 3.2 is end-of-life");
  assert.equal(eol32.summary, "The Ruby maintenance branches page marks Ruby 3.2 as eol: normal maintenance ended on 2025-04-01 and the branch reached end-of-life on 2026-04-01.");
  assert.equal(eol32.severity, "high");
  assert.equal(eol32.replacement, "Ruby 3.4 or later");
  assert.equal(eol32.deadline, "2026-04-01");
  assert.deepEqual(eol32.sources, [{ title: "Ruby maintenance branches", url: RUBY_BRANCHES_URL }]);
  assert.deepEqual(eol32.provenance, { observedAt: "2026-10-18", reviewedAt: "2026-10-18", reviewer: "pending-review", importer: "ruby-1" });
  assert.equal(eol32.migration, undefined);
  const eol26 = drafts.rules.find((rule) => rule.id === "ruby.runtime.eol-2.6")!;
  assert.equal(eol26.vers, "vers:gem/>=2.6.0|<2.7.0");
  assert.equal(eol26.deadline, "2022-04-12");
  assert.deepEqual(drafts.notes, [
    'Skipped Ruby 4.1: status "preview".',
    'Skipped Ruby 4.0: status "normal maintenance".',
    'Skipped Ruby 3.4: status "normal maintenance".',
    'Skipped Ruby 3.3: status "security maintenance".',
  ]);
});

test("recorded drafts match the reviewed registry", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/ruby.json"), "utf8")) as RegistryV2;
  const drafts = await execute(rubyMaintenanceImporter, { replay: recording, now: "2026-10-18" });
  const diff = diffDrafts(drafts, registry);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.duplicates, []);
  assert.deepEqual(diff.unchanged, [
    "ruby.runtime.eol-1.9.3",
    "ruby.runtime.eol-2.0.0",
    "ruby.runtime.eol-2.1",
    "ruby.runtime.eol-2.2",
    "ruby.runtime.eol-2.3",
    "ruby.runtime.eol-2.4",
    "ruby.runtime.eol-2.5",
    "ruby.runtime.eol-2.6",
    "ruby.runtime.eol-2.7",
    "ruby.runtime.eol-3.0",
    "ruby.runtime.eol-3.1",
    "ruby.runtime.eol-3.2",
  ]);
});

test("follows the calendar: a line is drafted on its end-of-life date", async () => {
  const before = await execute(rubyMaintenanceImporter, { replay: recording, now: "2026-01-01" });
  assert.ok(!before.rules.some((rule) => rule.id === "ruby.runtime.eol-3.2"));
  assert.ok(before.notes.includes("Not yet end-of-life: Ruby 3.2 (EOL 2026-04-01)."));

  const onDate = await execute(rubyMaintenanceImporter, { replay: recording, now: "2026-04-01" });
  assert.ok(onDate.rules.some((rule) => rule.id === "ruby.runtime.eol-3.2"));
});

test("skips entries it cannot use and says so in source order", async () => {
  const result = await runImporter(rubyMaintenanceImporter, inline([
    { name: "3.4", status: "normal maintenance" },
    { name: "3.2", status: "eol", security_maintenance_date: "2025-04-01", eol_date: "2026-04-01" },
    { name: "3.1", status: "eol", security_maintenance_date: "2024-04-01", eol_date: "2025-03-26" },
    { name: "3.3", status: "security maintenance", eol_date: "2027-03-31" },
    { name: "2.6", status: "eol", eol_date: "not-a-date" },
    { name: "2.5", status: "unknown" },
    { name: "2.4", status: "eol" },
    { name: "not-a-version", status: "eol", eol_date: "2025-01-01" },
    "not an object",
  ]));
  assert.deepEqual(result.rules.map((rule) => rule.id), ["ruby.runtime.eol-3.1", "ruby.runtime.eol-3.2"]);
  assert.deepEqual(result.notes, [
    'Skipped Ruby 3.4: status "normal maintenance".',
    'Not yet end-of-life: Ruby 3.3 (EOL 2027-03-31).',
    "Skipped Ruby 2.6: no valid end-of-life date.",
    'Skipped Ruby 2.5: status "unknown".',
    "Skipped Ruby 2.4: no valid end-of-life date.",
    "Skipped entry 8: no valid Ruby release name.",
    "Skipped entry 9: not an object.",
  ]);
});

test("without a normal-maintenance line it drafts no replacement and says so", async () => {
  const result = await runImporter(rubyMaintenanceImporter, inline([
    { name: "3.3", status: "security maintenance", eol_date: "2027-03-31" },
    { name: "3.2", status: "eol", security_maintenance_date: "2025-04-01", eol_date: "2026-04-01" },
  ]));
  assert.equal(result.rules.length, 1);
  assert.equal(result.rules[0]!.replacement, undefined);
  assert.deepEqual(result.notes, [
    "Not yet end-of-life: Ruby 3.3 (EOL 2027-03-31).",
    "No release line in normal maintenance was found, so drafts have no replacement.",
  ]);
});

test("a missing or malformed data block produces a review note, not guessed rules", async () => {
  for (const body of [
    "<html></html>",
    '<script type="ruby-lang-org-data" id="branches.json">not json</script>',
    '<script type="ruby-lang-org-data" id="branches.json">{}</script>',
  ]) {
    const result = await runImporter(rubyMaintenanceImporter, inline(body));
    assert.deepEqual(result.rules, []);
    assert.deepEqual(result.notes, ["No usable Ruby maintenance branch data was found in the page."]);
  }
});

test("a source failure stops the run", async () => {
  await assert.rejects(
    runImporter(rubyMaintenanceImporter, {
      now: new Date("2026-10-18T12:00:00Z"),
      async fetchText() {
        throw new Error("source is down");
      },
    }),
    /source is down/,
  );
});

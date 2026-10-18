import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { validateRegistryV2 } from "../../src/registry.js";
import { DOTNET_RELEASES_INDEX_URL, dotnetReleasesImporter } from "../../tools/importers/dotnet-1.js";
import { execute } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/dotnet-1.json");

function inline(index: unknown, now = "2026-10-17"): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url) {
      if (url !== DOTNET_RELEASES_INDEX_URL) throw new Error(`unexpected ${url}`);
      return JSON.stringify(index);
    },
  };
}

const channel = (version: string, type: string, phase: string, eol: string | null) => ({ "channel-version": version, "release-type": type, "support-phase": phase, "eol-date": eol });

test("dotnet-1 drafts an end-of-support rule per line past its date and a scheduled rule per line ending within a year, offline", async () => {
  const drafts = await execute(dotnetReleasesImporter, { replay: recording });
  const ids = drafts.rules.map((rule) => rule.id);
  for (const line of ["3.1", "5.0", "6.0", "7.0"]) assert.ok(ids.includes(`dotnet.runtime.end-of-support-${line}`), line);
  for (const line of ["8.0", "9.0"]) assert.equal(drafts.rules.find((rule) => rule.id === `dotnet.runtime.end-of-support-${line}`)?.event, "scheduled-end-of-life", line);
  for (const line of ["10.0", "11.0"]) assert.ok(!ids.includes(`dotnet.runtime.end-of-support-${line}`), `${line} ends more than a year away or has no date`);
  const six = drafts.rules.find((rule) => rule.id === "dotnet.runtime.end-of-support-6.0")!;
  assert.equal(six.purl, "pkg:generic/dotnet");
  assert.equal(six.vers, "vers:semver/>=6.0.0|<6.1.0");
  assert.equal(six.deadline, "2024-11-12");
  assert.equal(six.event, "end-of-support");
  assert.equal(six.provenance.reviewer, "pending-review");
  assert.equal(six.provenance.importer, "dotnet-1");
  assert.ok(six.sources.some((source) => source.url === DOTNET_RELEASES_INDEX_URL));
  const eight = drafts.rules.find((rule) => rule.id === "dotnet.runtime.end-of-support-8.0")!;
  assert.equal(eight.severity, "low");
  assert.equal(eight.deadline, "2026-11-10");
  assert.equal(eight.title, ".NET 8 reaches end of support on 2026-11-10");
  assert.match(drafts.notes.join("\n"), /\.NET 10 ends support on 2028-11-14, which is more than twelve months after/);
});

test("the committed runtime rules match what the importer drafts from the recording", async () => {
  const drafts = (await execute(dotnetReleasesImporter, { replay: recording })).rules;
  const registry = validateRegistryV2(JSON.parse(await readFile("registry/dotnet.json", "utf8")));
  const committed = registry.rules.filter((rule) => rule.purl === "pkg:generic/dotnet");
  assert.ok(committed.length >= 4);
  for (const rule of committed) {
    const draft = drafts.find((candidate) => candidate.id === rule.id);
    assert.ok(draft, `${rule.id} is drafted by the importer`);
    for (const field of ["purl", "vers", "event", "title", "summary", "severity", "replacement", "deadline", "sources"] as const) {
      assert.deepEqual(rule[field], draft[field], `${rule.id} ${field}`);
    }
  }
});

test("dotnet-1 follows the calendar: scheduled within a year, end-of-support on and after the day, and the same id for both", async () => {
  const index = { "releases-index": [channel("10.0", "lts", "active", "2028-11-14"), channel("8.0", "lts", "maintenance", "2026-11-10"), channel("6.0", "lts", "eol", "2024-11-12")] };
  const before = await dotnetReleasesImporter.import(inline(index, "2026-11-09"));
  assert.deepEqual(before.rules.map((rule) => [rule.id, rule.event, rule.severity]), [["dotnet.runtime.end-of-support-8.0", "scheduled-end-of-life", "low"], ["dotnet.runtime.end-of-support-6.0", "end-of-support", "high"]]);
  const on = await dotnetReleasesImporter.import(inline(index, "2026-11-10"));
  assert.deepEqual(on.rules.map((rule) => [rule.id, rule.event, rule.severity]), [["dotnet.runtime.end-of-support-8.0", "end-of-support", "high"], ["dotnet.runtime.end-of-support-6.0", "end-of-support", "high"]]);
  assert.equal(on.rules[0]!.replacement, ".NET 10 (LTS), or the newest supported .NET release");
  const early = await dotnetReleasesImporter.import(inline(index, "2025-10-01"));
  assert.ok(!early.rules.some((rule) => rule.id.endsWith("8.0")), "more than twelve months before the date, the line is only noted");
  assert.match(early.notes.join("\n"), /\.NET 8 ends support on 2026-11-10, which is more than twelve months after 2025-10-01/);
});

test("dotnet-1 skips channels it cannot read, says why for an undated end of life, and drafts nothing from garbage", async () => {
  const index = { "releases-index": [channel("7.0", "sts", "eol", null), channel("preview", "sts", "preview", null), channel("6.0", "lts", "eol", "not-a-date"), { "channel-version": "5.0" }] };
  const out = await dotnetReleasesImporter.import(inline(index));
  assert.deepEqual(out.rules, []);
  assert.match(out.notes.join("\n"), /\.NET 7 is marked end of life but has no end-of-life date/);
  assert.deepEqual((await dotnetReleasesImporter.import(inline({ nothing: true }))).rules, []);
  await assert.rejects(dotnetReleasesImporter.import({ now: new Date(), async fetchText() { throw new Error("HTTP 503"); } }), /HTTP 503/);
});

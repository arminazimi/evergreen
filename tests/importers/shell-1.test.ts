import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import {
  MAXIMUM_PAGE_BYTES,
  parseSupportTables,
  POWERSHELL_LIFECYCLE_URL,
  powershellLifecycleImporter,
  toIsoDate,
} from "../../tools/importers/shell-1.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/shell-1.json");

function row(cells: string[]): string {
  return `<tr>${cells.map((cell) => `<td style="text-align: center;">${cell}</td>`).join("")}</tr>`;
}

function page(rows: string[][], now = "2026-10-22"): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url) {
      assert.equal(url, POWERSHELL_LIFECYCLE_URL);
      return `<table><thead><tr><th>Version</th></tr></thead><tbody>${rows.map(row).join("")}</tbody></table>`;
    },
  };
}

test("drafts an end-of-life rule for each retired release from the real recording, offline", async () => {
  const drafts = await execute(powershellLifecycleImporter, { replay: recording });
  const ids = drafts.rules.map((rule) => rule.id);
  assert.deepEqual(ids, [
    "shell.powershell.end-of-life-6",
    "shell.powershell.end-of-life-7.0",
    "shell.powershell.end-of-life-7.1",
    "shell.powershell.end-of-life-7.2",
    "shell.powershell.end-of-life-7.3",
  ]);
  const rule = drafts.rules.find((candidate) => candidate.id === "shell.powershell.end-of-life-7.3")!;
  assert.equal(rule.purl, "pkg:generic/powershell");
  assert.equal(rule.vers, "vers:semver/>=7.3.0|<7.4.0");
  assert.equal(rule.deadline, "2024-05-08");
  assert.equal(rule.replacement, "PowerShell 7.6 (LTS) or later");
  assert.equal(rule.provenance.importer, "shell-1");
  assert.equal(rule.provenance.reviewer, "pending-review");
  assert.ok(rule.sources.every((source) => /^https:\/\//.test(source.url)));
  assert.ok(drafts.notes.some((note) => /^Skipped PowerShell 7\.5: supported until /.test(note)));
});

test("emits drafts that match the curated shell registry with no additions or removals", async () => {
  const registry = JSON.parse(await readFile("registry/shell.json", "utf8")) as RegistryV2;
  const diff = diffDrafts(await execute(powershellLifecycleImporter, { replay: recording }), registry);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.added, []);
});

test("a supported release is never drafted, and the calendar moving past its date drafts it", async () => {
  const rows = [
    ["PowerShell 7.6 (LTS)", "18-Mar-2026", "14-Nov-2028", ".NET 10.0"],
    ["PowerShell 7.4 (LTS)", "16-Nov-2023", "10-Nov-2026", ".NET 8.0"],
  ];
  assert.deepEqual((await runImporter(powershellLifecycleImporter, page(rows, "2026-11-09"))).rules, []);
  const result = await runImporter(powershellLifecycleImporter, page(rows, "2026-11-10"));
  assert.deepEqual(result.rules.map((rule) => rule.id), ["shell.powershell.end-of-life-7.4"]);
  assert.equal(result.rules[0]!.replacement, "PowerShell 7.6 (LTS) or later");
});

test("PowerShell 6 is drafted only once every 6.x row has ended", async () => {
  const six = [["PowerShell 6.2", "29-Mar-2019", "04-Sep-2020", ".NET Core 2.1"], ["PowerShell 6.1", "13-Sep-2018", "28-Sep-2019", ".NET Core 2.1"]];
  const result = await runImporter(powershellLifecycleImporter, page(six));
  assert.deepEqual(result.rules.map((rule) => [rule.id, rule.deadline]), [["shell.powershell.end-of-life-6", "2020-09-04"]]);
  assert.deepEqual((await runImporter(powershellLifecycleImporter, page(six, "2020-09-03"))).rules, []);
});

test("rows with the wrong shape, an unreadable date, or a Windows PowerShell name are skipped", () => {
  const html = [
    row(["PowerShell 7.3", "09-Nov-2022", "08-May-2024", ".NET 7.0"]),
    row(["PowerShell 7.7 (preview)", "", "", ".NET 11.0"]),
    row(["PowerShell 7.2 (LTS)", "08-Nov-2021", "2024-11-08", ".NET 6.0"]),
    row(["PowerShell 7.1", "11-Nov-2020", "08-Smarch-2022"]),
    row(["Windows PowerShell 5.1", "Aug-2016", "01-Jan-2020", "x"]),
  ].join("");
  assert.deepEqual(parseSupportTables(html), [{ major: 7, minor: 3, lts: false, endOfSupport: "2024-05-08" }]);
  assert.equal(toIsoDate("3-Dec-2022"), "2022-12-03");
  assert.equal(toIsoDate("December 3, 2022"), undefined);
});

test("a page with no release rows or an oversized page stops the run", async () => {
  await assert.rejects(runImporter(powershellLifecycleImporter, page([])), /No release rows found/);
  await assert.rejects(
    runImporter(powershellLifecycleImporter, {
      now: new Date("2026-10-22T12:00:00Z"),
      async fetchText() {
        return "x".repeat(MAXIMUM_PAGE_BYTES + 1);
      },
    }),
    /returned more than/,
  );
});

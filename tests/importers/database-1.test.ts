import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import {
  MAXIMUM_PAGE_BYTES,
  parseVersioningTable,
  POSTGRESQL_VERSIONING_URL,
  postgresqlVersioningImporter,
  toIsoDate,
} from "../../tools/importers/database-1.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/database-1.json");

function row(cells: string[]): string {
  return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
}

function page(rows: string[][], now = "2026-10-22"): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url) {
      assert.equal(url, POSTGRESQL_VERSIONING_URL);
      return `<table><thead><tr><th>Version</th></tr></thead><tbody>${rows.map(row).join("")}</tbody></table>`;
    },
  };
}

test("drafts an end-of-life rule for each unsupported major from the real recording, offline", async () => {
  const drafts = await execute(postgresqlVersioningImporter, { replay: recording });
  const ids = drafts.rules.map((rule) => rule.id);
  for (const major of [11, 12, 13]) assert.ok(ids.includes(`database.postgresql.end-of-life-${major}`), String(major));
  assert.ok(!ids.includes("database.postgresql.end-of-life-17"));

  const rule = drafts.rules.find((candidate) => candidate.id === "database.postgresql.end-of-life-12")!;
  assert.equal(rule.purl, "pkg:generic/postgresql");
  assert.equal(rule.vers, "vers:semver/>=12.0.0|<13.0.0");
  assert.equal(rule.event, "end-of-life");
  assert.equal(rule.provenance.importer, "database-1");
  assert.equal(rule.provenance.reviewer, "pending-review");
  assert.ok(rule.sources.every((source) => /^https:\/\//.test(source.url)));
  assert.ok(drafts.notes.some((note) => /^Skipped PostgreSQL 17: still supported until /.test(note)));
});

test("emits drafts that diff against the existing database registry without removals", async () => {
  const registry = JSON.parse(await readFile("registry/database.json", "utf8")) as RegistryV2;
  const diff = diffDrafts(await execute(postgresqlVersioningImporter, { replay: recording }), registry);
  assert.deepEqual(diff.removed, []);
  assert.ok(diff.added.some((rule) => rule.id === "database.postgresql.end-of-life-10"));
});

test("a supported major is never drafted, and neither is an unsupported one that ends in the future", async () => {
  const result = await runImporter(
    postgresqlVersioningImporter,
    page([
      ["18", "18.1", "Yes", "September 25, 2025", "November 14, 2030"],
      ["15", "15.1", "Yes", "October 13, 2022", "November 11, 2027"],
      ["14", "14.1", "No", "September 30, 2021", "November 12, 2026"],
      ["13", "13.1", "No", "September 24, 2020", "November 13, 2025"],
      ["9.6", "9.6.24", "No", "September 29, 2016", "November 11, 2021"],
    ]),
  );
  assert.deepEqual(result.rules.map((rule) => rule.id), ["database.postgresql.end-of-life-13"]);
  assert.equal(result.rules[0]!.deadline, "2025-11-13");
  assert.equal(result.rules[0]!.replacement, "PostgreSQL 15 or later");
  assert.ok(result.notes.some((note) => /PostgreSQL 14: marked unsupported but its final release \(2026-11-12\) is in the future/.test(note)));
});

test("the calendar moving past a final release drafts the rule", async () => {
  const rows = [["14", "14.1", "No", "September 30, 2021", "November 12, 2026"]];
  assert.deepEqual((await runImporter(postgresqlVersioningImporter, page(rows, "2026-11-11"))).rules, []);
  assert.deepEqual(
    (await runImporter(postgresqlVersioningImporter, page(rows, "2026-11-12"))).rules.map((rule) => rule.id),
    ["database.postgresql.end-of-life-14"],
  );
});

test("rows with the wrong shape, an unknown supported flag, or an unreadable date are skipped", () => {
  const html = [
    row(["13", "13.1", "No", "September 24, 2020", "November 13, 2025"]),
    row(["13", "13.1", "Maybe", "September 24, 2020", "November 13, 2025"]),
    row(["12", "12.1", "No", "October 3, 2019", "2024-11-21"]),
    row(["11", "11.1", "No", "October 18, 2018"]),
    row(["x", "1", "No", "October 18, 2018", "November 9, 2023"]),
    row(["10", "10.1", "No", "October 5, 2017", "Smarch 10, 2022"]),
  ].join("");
  assert.deepEqual(parseVersioningTable(html), [{ major: 13, supported: false, finalRelease: "2025-11-13" }]);
  assert.equal(toIsoDate("November 9, 2023"), "2023-11-09");
  assert.equal(toIsoDate("9 November 2023"), undefined);
});

test("a page with no version rows or an oversized page stops the run", async () => {
  await assert.rejects(runImporter(postgresqlVersioningImporter, page([])), /No version rows found/);
  await assert.rejects(
    runImporter(postgresqlVersioningImporter, {
      now: new Date("2026-10-22T12:00:00Z"),
      async fetchText() {
        return "x".repeat(MAXIMUM_PAGE_BYTES + 1);
      },
    }),
    /returned more than/,
  );
});

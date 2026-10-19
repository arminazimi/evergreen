import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { PHP_BRANCHES_URL, phpSupportedVersionsImporter } from "../../tools/importers/php-1.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/php-1.json");

function inline(body: unknown, now = "2026-10-19"): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url, options) {
      assert.equal(url, PHP_BRANCHES_URL);
      assert.equal(options?.accept, "application/json");
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

test("drafts one end-of-life rule per ended release line from the recording", async () => {
  const drafts = await execute(phpSupportedVersionsImporter, { replay: recording, now: "2026-10-19" });
  assert.equal(drafts.observedAt, "2026-10-19");
  assert.ok(drafts.rules.some((rule) => rule.id === "php.runtime.eol-8.1"));
  assert.ok(drafts.rules.some((rule) => rule.id === "php.runtime.eol-8.0"));
  assert.ok(drafts.rules.some((rule) => rule.id === "php.runtime.eol-7.4"));
  assert.ok(!drafts.rules.some((rule) => rule.id === "php.runtime.eol-8.2"));
  const eol81 = drafts.rules.find((rule) => rule.id === "php.runtime.eol-8.1")!;
  assert.equal(eol81.purl, "pkg:generic/php");
  assert.equal(eol81.vers, "vers:semver/>=8.1.0|<8.2.0");
  assert.equal(eol81.event, "end-of-life");
  assert.equal(eol81.title, "PHP 8.1 is end-of-life");
  assert.equal(
    eol81.summary,
    "The PHP release branches list marks PHP 8.1 as end of life: active support ended on 2023-11-25 and security support ended on 2025-12-31.",
  );
  assert.equal(eol81.severity, "high");
  assert.equal(eol81.replacement, "PHP 8.2 or later");
  assert.equal(eol81.deadline, "2025-12-31");
  assert.deepEqual(eol81.sources, phpSupportedVersionsImporter.sources);
  assert.deepEqual(eol81.provenance, {
    observedAt: "2026-10-19",
    reviewedAt: "2026-10-19",
    reviewer: "pending-review",
    importer: "php-1",
  });
  assert.equal(eol81.migration, undefined);
  assert.ok(drafts.notes.includes("Not yet end-of-life: PHP 8.2 (EOL 2026-12-31)."));
  assert.ok(drafts.notes.includes("Not yet end-of-life: PHP 8.5 (EOL 2029-12-31)."));
});

test("recorded drafts match the curated registry lines and show older lines as additions", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/php.json"), "utf8")) as RegistryV2;
  const drafts = await execute(phpSupportedVersionsImporter, { replay: recording, now: "2026-10-19" });
  const diff = diffDrafts(drafts, registry);
  assert.ok(diff.added.map((rule) => rule.id).includes("php.runtime.eol-7.3"));
  assert.ok(diff.unchanged.includes("php.runtime.eol-8.1") || diff.changed.some((entry) => entry.id === "php.runtime.eol-8.1"));
  assert.ok(diff.unchanged.includes("php.runtime.eol-8.0") || diff.changed.some((entry) => entry.id === "php.runtime.eol-8.0"));
  assert.ok(diff.unchanged.includes("php.runtime.eol-7.4") || diff.changed.some((entry) => entry.id === "php.runtime.eol-7.4"));
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.duplicates, []);
  assert.ok(!diff.added.some((rule) => rule.id.startsWith("php.package.")));
});

test("follows the calendar: a line is drafted on its security-support end date", async () => {
  const before = await execute(phpSupportedVersionsImporter, { replay: recording, now: "2025-12-30" });
  assert.ok(!before.rules.some((rule) => rule.id === "php.runtime.eol-8.1"));
  assert.ok(before.notes.includes("Not yet end-of-life: PHP 8.1 (EOL 2025-12-31)."));

  const onDate = await execute(phpSupportedVersionsImporter, { replay: recording, now: "2025-12-31" });
  assert.ok(onDate.rules.some((rule) => rule.id === "php.runtime.eol-8.1"));
});

test("skips entries it cannot use and says so in source order", async () => {
  const result = await runImporter(
    phpSupportedVersionsImporter,
    inline([
      {
        branch: "8.4",
        state: "stable",
        active_support_end: "2026-12-31T00:00:00+00:00",
        security_support_end: "2028-12-31T00:00:00+00:00",
      },
      {
        branch: "8.1",
        state: "eol",
        active_support_end: "2023-11-25T00:00:00+00:00",
        security_support_end: "2025-12-31T00:00:00+00:00",
      },
      {
        branch: "8.0",
        state: "eol",
        active_support_end: "2022-11-26T00:00:00+00:00",
        security_support_end: "2023-11-26T00:00:00+00:00",
      },
      {
        branch: "8.3",
        state: "security",
        active_support_end: "2025-12-31T00:00:00+00:00",
        security_support_end: "2027-12-31T00:00:00+00:00",
      },
      { branch: "7.4", state: "eol", security_support_end: "not-a-date" },
      { branch: "7.3", state: "future", security_support_end: "2030-01-01T00:00:00+00:00" },
      { branch: "7.2", state: "eol" },
      { branch: "not-a-version", state: "eol", security_support_end: "2025-01-01T00:00:00+00:00" },
      "not an object",
    ]),
  );
  assert.deepEqual(result.rules.map((rule) => rule.id), ["php.runtime.eol-8.0", "php.runtime.eol-8.1"]);
  assert.equal(result.rules[1]!.replacement, "PHP 8.3 or later");
  assert.deepEqual(result.notes, [
    "Skipped PHP 7.4: no valid security-support end date.",
    "Skipped PHP 7.2: no valid security-support end date.",
    "Skipped entry 8: no valid PHP release branch name.",
    "Skipped entry 9: not an object.",
    "Not yet end-of-life: PHP 8.4 (EOL 2028-12-31).",
    "Not yet end-of-life: PHP 8.3 (EOL 2027-12-31).",
    'Skipped PHP 7.3: status "future".',
  ]);
});

test("without a supported line it drafts no replacement and says so", async () => {
  const result = await runImporter(
    phpSupportedVersionsImporter,
    inline([
      {
        branch: "8.2",
        state: "eol",
        security_support_end: "2026-12-31T00:00:00+00:00",
      },
      {
        branch: "8.1",
        state: "eol",
        active_support_end: "2023-11-25T00:00:00+00:00",
        security_support_end: "2025-12-31T00:00:00+00:00",
      },
    ]),
  );
  assert.equal(result.rules.length, 1);
  assert.equal(result.rules[0]!.replacement, undefined);
  assert.deepEqual(result.notes, [
    "Not yet end-of-life: PHP 8.2 (EOL 2026-12-31).",
    "No supported release line was found, so drafts have no replacement.",
  ]);
});

test("a missing or malformed payload produces a review note, not guessed rules", async () => {
  for (const body of [{}, { branches: [] }]) {
    const result = await runImporter(phpSupportedVersionsImporter, inline(body));
    assert.deepEqual(result.rules, []);
    assert.deepEqual(result.notes, ["No usable PHP release branch data was found."]);
  }
  await assert.rejects(runImporter(phpSupportedVersionsImporter, inline("not json")), /not valid JSON/);
  const empty = await runImporter(phpSupportedVersionsImporter, inline([]));
  assert.deepEqual(empty.rules, []);
  assert.ok(empty.notes.includes("No supported release line was found, so drafts have no replacement."));
});

test("a source failure stops the run", async () => {
  await assert.rejects(
    runImporter(phpSupportedVersionsImporter, {
      now: new Date("2026-10-19T12:00:00Z"),
      async fetchText() {
        throw new Error("source is down");
      },
    }),
    /source is down/,
  );
});

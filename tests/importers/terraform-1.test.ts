import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import { ImporterError } from "../../tools/importers/types.js";
import type { ImporterContext } from "../../tools/importers/types.js";
import { releaseUrl, terraformCliImporter } from "../../tools/importers/terraform-1.js";

const recording = resolve("tests/importers/recordings/terraform-1.json");

interface Release {
  published_at: string;
  prerelease?: boolean;
  tag_name?: string;
}

/** Lines 1.0, 1.1, ... in order; the first missing minor answers 404. */
function github(releases: Release[], now = "2026-10-21"): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url) {
      const match = /\/tags\/v1\.(\d+)\.0$/.exec(url);
      const release = match ? releases[Number(match[1])] : undefined;
      if (!release) throw new ImporterError(`GET ${url} failed: HTTP 404`);
      return JSON.stringify({
        tag_name: `v1.${match![1]}.0`,
        html_url: `https://github.com/hashicorp/terraform/releases/tag/v1.${match![1]}.0`,
        ...release,
      });
    },
  };
}

test("drafts an end-of-support rule for each line outside the two most recent, from the real recording", async () => {
  const drafts = await execute(terraformCliImporter, { replay: recording });
  const ids = drafts.rules.map((rule) => rule.id);
  assert.ok(ids.includes("terraform.cli.end-of-support-1.14"));
  assert.ok(!ids.includes("terraform.cli.end-of-support-1.16"));

  const rule = drafts.rules.find((candidate) => candidate.id === "terraform.cli.end-of-support-1.14")!;
  assert.equal(rule.purl, "pkg:generic/terraform");
  assert.equal(rule.vers, "vers:semver/>=1.14.0|<1.15.0");
  assert.equal(rule.event, "end-of-support");
  assert.equal(rule.deadline, "2026-08-26");
  assert.equal(rule.provenance.importer, "terraform-1");
  assert.equal(rule.provenance.reviewer, "pending-review");
  assert.ok(rule.sources.every((source) => /^https:\/\//.test(source.url)));
  assert.match(drafts.notes[0]!, /^Newest release line found: 1\.\d+\./);
});

test("emits drafts that diff against the existing Terraform registry without removals", async () => {
  const registry = JSON.parse(await readFile("registry/terraform.json", "utf8")) as RegistryV2;
  const diff = diffDrafts(await execute(terraformCliImporter, { replay: recording }), registry);
  assert.deepEqual(diff.removed, []);
  assert.ok(diff.added.length + diff.changed.length > 0);
});

test("a line ends when the release two lines later ships", async () => {
  const result = await runImporter(
    terraformCliImporter,
    github([
      { published_at: "2024-01-01T00:00:00Z" },
      { published_at: "2024-06-01T00:00:00Z" },
      { published_at: "2025-01-01T00:00:00Z" },
      { published_at: "2025-06-01T00:00:00Z" },
    ]),
  );
  assert.deepEqual(result.rules.map((rule) => [rule.id, rule.deadline, rule.replacement]), [
    ["terraform.cli.end-of-support-1.0", "2025-01-01", "Terraform 1.2 or later"],
    ["terraform.cli.end-of-support-1.1", "2025-06-01", "Terraform 1.2 or later"],
  ]);
  assert.equal(result.rules[0]!.vers, "vers:semver/>=1.0.0|<1.1.0");
});

test("an end of support in the future is a note, not a rule", async () => {
  const result = await runImporter(
    terraformCliImporter,
    github(
      [
        { published_at: "2026-01-01T00:00:00Z" },
        { published_at: "2026-02-01T00:00:00Z" },
        { published_at: "2026-12-01T00:00:00Z" },
      ],
      "2026-10-21",
    ),
  );
  assert.deepEqual(result.rules, []);
  assert.match(result.notes[0]!, /Skipped Terraform 1\.0: its end of support \(2026-12-01\) is in the future/);
});

test("a prerelease or a mismatched tag ends the probe", async () => {
  const early = { published_at: "2024-01-01T00:00:00Z" };
  assert.deepEqual((await runImporter(terraformCliImporter, github([early, early, { ...early, prerelease: true }]))).rules, []);
  assert.deepEqual((await runImporter(terraformCliImporter, github([early, early, { ...early, tag_name: "v9.9.9" }]))).rules, []);
  const none = await runImporter(terraformCliImporter, github([]));
  assert.deepEqual(none.notes, ["No Terraform 1.x release found."]);
});

test("a source failure other than 404 stops the run", async () => {
  const context: ImporterContext = {
    now: new Date("2026-10-21T12:00:00Z"),
    async fetchText(url) {
      assert.equal(url, releaseUrl(0));
      throw new ImporterError(`GET ${url} failed: HTTP 503`);
    },
  };
  await assert.rejects(runImporter(terraformCliImporter, context), /HTTP 503/);
});

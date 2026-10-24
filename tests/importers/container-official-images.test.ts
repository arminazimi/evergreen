import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { validateRegistryV2 } from "../../src/registry.js";
import { containerOfficialImagesImporter, officialTags } from "../../tools/importers/container.js";
import { execute } from "../../tools/importers/run.js";

const recording = resolve("tests/importers/recordings/container-official-images.json");

test("drafts the Node.js and Python image rules from the vendors' schedules, offline", async () => {
  const drafts = await execute(containerOfficialImagesImporter, { replay: recording });
  assert.equal(drafts.ecosystem, "container");
  assert.deepEqual(
    drafts.rules.map((rule) => [rule.id, rule.purl, rule.vers, rule.deadline]),
    [
      ["container.node.eol-21-and-older", "pkg:docker/library/node", "vers:semver/<22.0.0", "2026-04-30"],
      ["container.node.eol-22-and-older", "pkg:docker/library/node", "vers:semver/>=22.0.0|<23.0.0", "2027-04-30"],
      ["container.python.eol-3.10-and-older", "pkg:docker/library/python", "vers:semver/<3.11.0", "2026-10-01"],
    ],
  );
  for (const rule of drafts.rules) {
    assert.equal(rule.provenance.reviewer, "pending-review");
    assert.equal(rule.provenance.importer, "container-official-images");
    assert.ok(rule.sources.every((source) => source.url.startsWith("https://")));
    assert.ok(rule.sources.every((source) => !/docker-library/.test(source.url)), "official-images is not a lifecycle source");
  }
  assert.match(drafts.notes.join("\n"), /PostgreSQL, MySQL, and Ruby/);
});

test("the committed Node.js and Python rules match what the importer drafts from the recording", async () => {
  const drafts = await execute(containerOfficialImagesImporter, { replay: recording });
  const registry = validateRegistryV2(JSON.parse(await readFile("registry/container.json", "utf8")));
  for (const draft of drafts.rules) {
    const committed = registry.rules.find((rule) => rule.id === draft.id);
    assert.ok(committed, `${draft.id} is missing from registry/container.json`);
    const { provenance: _draft, ...draftBody } = draft;
    const { provenance: _committed, ...committedBody } = committed;
    assert.deepEqual(committedBody, draftBody, draft.id);
  }
});

test("parses the tag lists of a library file", () => {
  assert.deepEqual(
    [...officialTags("Maintainers: x\n\nTags: 22-alpine, 22.1-alpine\nArchitectures: amd64\n\nTags: latest\n")],
    ["22-alpine", "22.1-alpine", "latest"],
  );
});

test("an end date in the future or a supported older line stops 'and older' from being drafted", async () => {
  const schedule = { v18: { end: "2025-04-30" }, v20: { end: "2099-01-01" }, v22: { end: "2099-01-01" } };
  const cycle = { "3.9": { status: "end-of-life", end_of_life: "2025-10-31" }, "3.10": { status: "bugfix", end_of_life: "2099-10" } };
  const bodies: Record<string, string> = {
    "https://raw.githubusercontent.com/nodejs/Release/main/schedule.json": JSON.stringify(schedule),
    "https://peps.python.org/api/release-cycle.json": JSON.stringify(cycle),
  };
  const output = await containerOfficialImagesImporter.import({
    now: new Date("2026-10-16T00:00:00Z"),
    async fetchText(url) {
      return bodies[url] ?? "Tags: none\n";
    },
  });
  assert.deepEqual(output.rules.map((rule) => [rule.id, rule.vers]), [
    ["container.node.eol-18-and-older", "vers:semver/<20.0.0"],
    ["container.python.eol-3.9-and-older", "vers:semver/<3.10.0"],
  ]);
});

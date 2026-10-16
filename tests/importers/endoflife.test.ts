import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { validateRegistryV2 } from "../../src/registry.js";
import { ENDOFLIFE_CANDIDATES } from "../../tools/importers/endoflife-candidates.js";
import { ENDOFLIFE_API, endoflifeDateImporter } from "../../tools/importers/endoflife.js";
import { execute } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/endoflife-date.json");

test("drafts at least twenty products from the recording, each evidenced by the vendor's own page", async () => {
  const drafts = await execute(endoflifeDateImporter, { replay: recording });
  assert.ok(drafts.rules.length >= 20, `${drafts.rules.length} drafts`);
  for (const rule of drafts.rules) {
    assert.equal(rule.ecosystem, "container");
    assert.equal(rule.provenance.importer, "endoflife-date");
    assert.equal(rule.provenance.reviewer, "pending-review");
    const [vendor, ...rest] = rule.sources;
    assert.ok(vendor && !/endoflife\.date|archive\.org/.test(vendor.url), `${rule.id} first source must be the vendor`);
    assert.ok(rest.every((source) => /^https:\/\/endoflife\.date\//.test(source.url) && /index/.test(source.title)), `${rule.id} labels endoflife.date as an index`);
  }
  assert.ok(drafts.notes.some((note) => /^Skipped clear-linux: no release-policy link to the vendor/.test(note)));
  assert.equal(drafts.rules.length + drafts.notes.filter((note) => note.startsWith("Skipped")).length, ENDOFLIFE_CANDIDATES.length);
});

test("agrees with the hand-reviewed PostgreSQL and Python rules", async () => {
  const drafts = await execute(endoflifeDateImporter, { replay: recording });
  const registry = validateRegistryV2(JSON.parse(await readFile("registry/container.json", "utf8")));
  for (const id of ["container.postgres.eol-13-and-older", "container.python.eol-3.10-and-older"]) {
    const draft = drafts.rules.find((rule) => rule.id === id);
    const committed = registry.rules.find((rule) => rule.id === id);
    assert.ok(draft && committed, id);
    assert.equal(draft.vers, committed.vers);
    assert.equal(draft.deadline, committed.deadline);
  }
});

function inline(product: object, now = "2026-10-16"): ImporterContext {
  return {
    now: new Date(`${now}T00:00:00Z`),
    async fetchText(url) {
      return url.endsWith("/postgresql/") ? JSON.stringify({ result: product }) : JSON.stringify({ result: { releases: [] } });
    },
  };
}

const releases = [
  { name: "16", eolFrom: "2028-11-09" },
  { name: "14", eolFrom: "2026-11-12" },
  { name: "13", eolFrom: "2025-11-13" },
  { name: "12", eolFrom: "2024-11-21" },
];
const base = { label: "PostgreSQL", identifiers: [{ type: "purl", id: "pkg:docker/library/postgres" }], links: { html: "https://endoflife.date/postgresql", releasePolicy: "https://www.postgresql.org/support/versioning/" }, releases };

test("cuts at the oldest supported release and uses the calendar, not a fixed day", async () => {
  const now = await endoflifeDateImporter.import(inline(base));
  const draft = now.rules.find((rule) => rule.id.startsWith("container.postgres."));
  assert.equal(draft?.id, "container.postgres.eol-13-and-older");
  assert.equal(draft?.vers, "vers:semver/<14.0.0");
  const later = await endoflifeDateImporter.import(inline(base, "2026-11-13"));
  assert.equal(later.rules.find((rule) => rule.id.startsWith("container.postgres."))?.id, "container.postgres.eol-14-and-older");
});

test("rejects a product without a vendor link, an archive snapshot, or an image", async () => {
  for (const [change, reason] of [
    [{ links: { html: "https://endoflife.date/postgresql", releasePolicy: null } }, /no release-policy link/],
    [{ links: { releasePolicy: "https://endoflife.date/postgresql" } }, /no release-policy link/],
    [{ links: { releasePolicy: "https://web.archive.org/web/2026/https://www.postgresql.org/" } }, /no release-policy link/],
    [{ links: { releasePolicy: "http://www.postgresql.org/support/versioning/" } }, /no release-policy link/],
    [{ identifiers: [] }, /no official Docker image/],
  ] as const) {
    const output = await endoflifeDateImporter.import(inline({ ...base, ...change }));
    assert.equal(output.rules.find((rule) => rule.id.startsWith("container.postgres.")), undefined);
    assert.ok(output.notes.some((note) => note.startsWith("Skipped postgresql") && reason.test(note)), JSON.stringify(change));
  }
});

test("a failed request stops the run instead of looking like nothing is end-of-life", async () => {
  await assert.rejects(endoflifeDateImporter.import({ now: new Date(), async fetchText() { throw new Error(`GET ${ENDOFLIFE_API} failed: HTTP 503`); } }), /HTTP 503/);
});

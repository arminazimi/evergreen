import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { databaseVendorLifecycleImporter, ENDOFLIFE_API } from "../../tools/importers/database-2.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/database-2.json");

interface Line {
  name: string;
  eolFrom: string | null;
}

function endoflife(products: Record<string, { policy?: string | null; releases: Line[] }>, now = "2026-10-22"): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url) {
      const slug = url.slice(ENDOFLIFE_API.length + 1).replace(/\/$/, "");
      const product = products[slug];
      assert.ok(product, url);
      return JSON.stringify({
        result: {
          links: { html: `https://endoflife.date/${slug}`, releasePolicy: product.policy === undefined ? `https://vendor.example/${slug}` : product.policy },
          releases: product.releases,
        },
      });
    },
  };
}

test("drafts an end-of-life rule for each ended Redis and MongoDB line from the real recording, offline", async () => {
  const drafts = await execute(databaseVendorLifecycleImporter, { replay: recording });
  const ids = drafts.rules.map((rule) => rule.id);
  assert.ok(ids.includes("database.redis.end-of-life-7.0"));
  assert.ok(ids.includes("database.mongodb.end-of-life-4.4"));
  assert.ok(!ids.includes("database.redis.end-of-life-7.4"));

  const rule = drafts.rules.find((candidate) => candidate.id === "database.mongodb.end-of-life-4.4")!;
  assert.equal(rule.purl, "pkg:generic/mongodb");
  assert.equal(rule.vers, "vers:semver/>=4.4.0|<4.5.0");
  assert.equal(rule.event, "end-of-life");
  assert.equal(rule.deadline, "2024-02-29");
  assert.equal(rule.provenance.importer, "database-2");
  assert.equal(rule.provenance.reviewer, "pending-review");
  assert.equal(rule.sources[0]!.url, "https://www.mongodb.com/legal/support-policy");
  assert.ok(rule.sources.every((source) => /^https:\/\//.test(source.url)));
});

test("emits drafts that diff against the existing database registry without removals", async () => {
  const registry = JSON.parse(await readFile("registry/database.json", "utf8")) as RegistryV2;
  const diff = diffDrafts(await execute(databaseVendorLifecycleImporter, { replay: recording }), registry);
  assert.deepEqual(diff.removed, []);
  assert.ok(diff.added.length > 0);
});

test("a line with no end date or an end date in the future is never drafted", async () => {
  const context = endoflife({
    mongodb: { releases: [{ name: "6.0", eolFrom: "2025-07-31" }, { name: "7.0", eolFrom: "2027-08-31" }, { name: "7.1", eolFrom: null }] },
    redis: { releases: [] },
  });
  const result = await runImporter(databaseVendorLifecycleImporter, context);
  assert.deepEqual(result.rules.map((rule) => rule.id), ["database.mongodb.end-of-life-6.0"]);
  assert.ok(result.notes.includes("Skipped mongodb 7.0: its end of life (2027-08-31) is in the future."));
  assert.ok(result.notes.includes("Skipped mongodb 7.1: no end date."));
});

test("the calendar moving past an end date drafts the rule", async () => {
  const products = { mongodb: { releases: [] }, redis: { releases: [{ name: "6.2", eolFrom: "2027-04-01" }] } };
  assert.deepEqual((await runImporter(databaseVendorLifecycleImporter, endoflife(products, "2027-03-31"))).rules, []);
  assert.deepEqual(
    (await runImporter(databaseVendorLifecycleImporter, endoflife(products, "2027-04-01"))).rules.map((rule) => rule.id),
    ["database.redis.end-of-life-6.2"],
  );
});

test("lines below the first drafted major and non-numeric names are skipped", async () => {
  const result = await runImporter(
    databaseVendorLifecycleImporter,
    endoflife({
      mongodb: { releases: [{ name: "3.6", eolFrom: "2021-04-30" }, { name: "latest", eolFrom: "2020-01-01" }] },
      redis: { releases: [{ name: "4.0", eolFrom: "2020-01-01" }, { name: "5.0", eolFrom: "2022-04-27" }] },
    }),
  );
  assert.deepEqual(result.rules.map((rule) => rule.id), ["database.redis.end-of-life-5.0"]);
});

test("endoflife.date alone is not evidence: a product without a vendor policy link drafts nothing", async () => {
  for (const policy of [null, "https://endoflife.date/redis", "http://vendor.example/redis", "https://web.archive.org/web/2024/https://redis.io", "not a url"]) {
    const result = await runImporter(
      databaseVendorLifecycleImporter,
      endoflife({
        mongodb: { releases: [] },
        redis: { policy, releases: [{ name: "5.0", eolFrom: "2022-04-27" }] },
      }),
    );
    assert.deepEqual(result.rules, [], String(policy));
    assert.ok(result.notes.some((note) => /^Skipped redis: no release-policy link/.test(note)), String(policy));
  }
});

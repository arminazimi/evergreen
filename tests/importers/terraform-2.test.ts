import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import { execute, runImporter } from "../../tools/importers/run.js";
import {
  datedStatements,
  guideUrl,
  MAXIMUM_GUIDE_BYTES,
  PROVIDER_GUIDES,
  terraformProviderGuidesImporter,
} from "../../tools/importers/terraform-2.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/terraform-2.json");

function guides(text: string): ImporterContext {
  return {
    now: new Date("2026-10-21T12:00:00Z"),
    async fetchText(url) {
      assert.ok(PROVIDER_GUIDES.some((guide) => guideUrl(guide.path) === url), url);
      return text;
    },
  };
}

test("reads the three real guides offline and drafts no provider-version rule", async () => {
  const drafts = await execute(terraformProviderGuidesImporter, { replay: recording });
  assert.deepEqual(drafts.rules, []);
  assert.match(drafts.notes[0]!, /^aws: .* states \d+ dated lifecycle event\(s\) for services or resources, none for a provider version\.$/);
  assert.ok(drafts.notes.some((note) => /Elastic Transcoder will be discontinued on November 13, 2025\.$/.test(note)));
  assert.ok(drafts.notes.some((note) => /^azurerm: .* has no dated lifecycle statement\.$/.test(note)));
  assert.ok(drafts.notes.some((note) => /^google: .* has no dated lifecycle statement\.$/.test(note)));
});

test("a newer major guide is never evidence: undated and undated-deprecation text drafts nothing", async () => {
  const result = await runImporter(
    terraformProviderGuidesImporter,
    guides("# Version 7 upgrade\n\nThis resource is deprecated and will be removed in a future version.\n"),
  );
  assert.deepEqual(result.rules, []);
  assert.equal(result.notes.length, PROVIDER_GUIDES.length);
  assert.ok(result.notes.every((note) => /has no dated lifecycle statement\.$/.test(note)));
});

test("extracts only lines with both a lifecycle word and a full date, without link markup", () => {
  const text = [
    "Amazon Foo will be [discontinued](https://example.com/x) on **March 3, 2027**.",
    "The provider was released on March 3, 2027.",
    "Support is ending soon.",
    `Retired on June 1, 2027 ${"x".repeat(2000)}`,
  ].join("\n");
  assert.deepEqual(datedStatements(text), ["Amazon Foo will be discontinued on March 3, 2027."]);
  assert.deepEqual(datedStatements(""), []);
});

test("an oversized guide stops the run", async () => {
  await assert.rejects(
    runImporter(terraformProviderGuidesImporter, guides("x".repeat(MAXIMUM_GUIDE_BYTES + 1))),
    /returned more than/,
  );
});

test("the guide list is sorted and uses only the three named providers", () => {
  const providers = PROVIDER_GUIDES.map((guide) => guide.provider);
  assert.deepEqual(providers, [...providers].sort());
  assert.deepEqual(providers, ["aws", "azurerm", "google"]);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { validateRegistryV2 } from "../src/registry.js";
import { versContains } from "../src/vers/index.js";

async function rules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/android.json", "utf8"))).rules;
}

test("the Android registry has five valid rules with authoritative https sources", async () => {
  const all = await rules();
  assert.equal(all.length, 5);
  for (const rule of all) {
    assert.ok(rule.sources.every((source) => source.url.startsWith("https://")), rule.id);
    assert.ok(
      rule.sources.some((source) =>
        /^https:\/\/developer\.android\.com\/(?:google\/play\/requirements\/target-sdk|build\/releases\/about-agp)$/.test(source.url),
      ),
      `${rule.id} cites the Play target API page or the AGP about page`,
    );
    assert.ok(rule.replacement, rule.id);
    assert.ok(rule.provenance.observedAt && rule.provenance.reviewedAt, rule.id);
  }
});

test("targetSdk rules cover below-35 and the 35-only submission gap, nothing else", async () => {
  const target = (await rules()).filter((rule) => rule.purl === "pkg:generic/android/targetSdk");
  assert.deepEqual(
    target.map((rule) => rule.id).sort(),
    ["android.target-sdk.below-35", "android.target-sdk.below-36-for-submissions"],
  );
  const affected = (version: string) => target.filter((rule) => versContains(rule.vers, version)).map((rule) => rule.id);
  assert.deepEqual(affected("34"), ["android.target-sdk.below-35"]);
  assert.deepEqual(affected("35"), ["android.target-sdk.below-36-for-submissions"]);
  assert.deepEqual(affected("36"), []);
  for (const rule of target) {
    assert.equal(rule.deadline, "2026-08-31", rule.id);
    assert.equal(rule.severity, "high", rule.id);
  }
});

test("AGP rules partition below 7.1, 7.1–8.6, and 8.6–8.9.1", async () => {
  const agp = (await rules()).filter((rule) => rule.purl === "pkg:maven/com.android.tools.build/gradle");
  assert.equal(agp.length, 3);
  const affected = (version: string) => agp.filter((rule) => versContains(rule.vers, version)).map((rule) => rule.id);
  assert.deepEqual(affected("7.0.0"), ["android.agp.below-7.1"]);
  assert.deepEqual(affected("7.4.2"), ["android.agp.below-8.6-for-api-35"]);
  assert.deepEqual(affected("8.5.2"), ["android.agp.below-8.6-for-api-35"]);
  assert.deepEqual(affected("8.7.0"), ["android.agp.below-8.9.1-for-api-36"]);
  assert.deepEqual(affected("8.9.0"), ["android.agp.below-8.9.1-for-api-36"]);
  assert.deepEqual(affected("8.9.1"), []);
  assert.deepEqual(affected("9.4.0"), []);
});

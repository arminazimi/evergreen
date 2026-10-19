import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { validateRegistryV2 } from "../src/registry.js";
import { versContains } from "../src/vers/index.js";

async function rules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/android.json", "utf8"))).rules;
}

test("every Android rule validates and carries deadline, replacement, and an https source", async () => {
  const all = await rules();
  assert.equal(all.length, 5);
  for (const rule of all) {
    assert.ok(rule.deadline, `${rule.id} needs deadline`);
    assert.ok(rule.replacement, `${rule.id} needs replacement`);
    assert.ok(rule.severity, `${rule.id} needs severity`);
    assert.ok(rule.sources.every((source) => source.url.startsWith("https://")), rule.id);
    assert.ok(rule.provenance.observedAt && rule.provenance.reviewedAt && rule.provenance.reviewer, rule.id);
    assert.ok(
      rule.sources.some((source) =>
        /^https:\/\/developer\.android\.com\/(?:google\/play\/requirements\/target-sdk|google\/play\/billing\/deprecation-faq)$/.test(
          source.url,
        ),
      ),
      `${rule.id} cites Play target API or Billing deprecation FAQ`,
    );
  }
});

test("targetSdk rules match just below, at, and just above each Play floor", async () => {
  const target = (await rules()).filter((rule) => rule.purl === "pkg:generic/android/targetSdk");
  assert.deepEqual(
    target.map((rule) => [rule.id, rule.deadline, rule.severity]).sort(),
    [
      ["android.target-sdk.below-35", "2026-08-31", "high"],
      ["android.target-sdk.below-36-for-submissions", "2026-08-31", "high"],
    ],
  );
  const affected = (version: string) => target.filter((rule) => versContains(rule.vers, version)).map((rule) => rule.id);
  assert.deepEqual(affected("34"), ["android.target-sdk.below-35"]);
  assert.deepEqual(affected("35"), ["android.target-sdk.below-36-for-submissions"]);
  assert.deepEqual(affected("36"), []);
  for (const rule of target) {
    assert.match(rule.summary, /Wear OS/, rule.id);
    assert.match(rule.summary, /form factor/, rule.id);
  }
});

test("Play Billing major lines match just below, at, and just above each table cutoff", async () => {
  const billing = (await rules()).filter((rule) => rule.purl === "pkg:maven/com.android.billingclient/billing");
  assert.deepEqual(
    billing.map((rule) => [rule.id, rule.deadline]).sort(),
    [
      ["android.play-billing.version-5", "2024-08-31"],
      ["android.play-billing.version-6", "2025-08-31"],
      ["android.play-billing.version-7", "2026-08-31"],
    ],
  );
  const affected = (version: string) => billing.filter((rule) => versContains(rule.vers, version)).map((rule) => rule.id);
  assert.deepEqual(affected("4.1.0"), []);
  assert.deepEqual(affected("5.0.0"), ["android.play-billing.version-5"]);
  assert.deepEqual(affected("5.2.1"), ["android.play-billing.version-5"]);
  assert.deepEqual(affected("6.0.0"), ["android.play-billing.version-6"]);
  assert.deepEqual(affected("6.2.1"), ["android.play-billing.version-6"]);
  assert.deepEqual(affected("7.0.0"), ["android.play-billing.version-7"]);
  assert.deepEqual(affected("7.1.1"), ["android.play-billing.version-7"]);
  assert.deepEqual(affected("8.0.0"), []);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { validateRegistryV2 } from "../src/registry.js";
import { versContains } from "../src/vers/index.js";

async function rules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/android.json", "utf8"))).rules;
}

test("every Android rule is a dated Play Billing rule with https evidence", async () => {
  const all = await rules();
  assert.equal(all.length, 5);
  for (const rule of all) {
    assert.equal(rule.purl, "pkg:maven/com.android.billingclient/billing", rule.id);
    assert.ok(rule.deadline, `${rule.id} needs deadline`);
    assert.ok(rule.replacement, `${rule.id} needs replacement`);
    assert.ok(rule.sources.every((source) => source.url === "https://developer.android.com/google/play/billing/deprecation-faq"), rule.id);
    assert.match(rule.summary, /extension deadline of November 1/, rule.id);
    assert.match(rule.summary, /two-year deprecation cycle/, rule.id);
  }
});

test("Billing majors match exact deadlines and vers boundaries", async () => {
  const billing = await rules();
  assert.deepEqual(
    billing.map((rule) => [rule.id, rule.deadline, rule.event, rule.severity]).sort(),
    [
      ["android.play-billing.version-5", "2024-08-31", "deprecated", "high"],
      ["android.play-billing.version-6", "2025-08-31", "deprecated", "high"],
      ["android.play-billing.version-7", "2026-08-31", "deprecated", "high"],
      ["android.play-billing.version-8", "2027-08-31", "scheduled-end-of-life", "low"],
      ["android.play-billing.version-9", "2028-08-31", "scheduled-end-of-life", "low"],
    ],
  );

  const affected = (version: string) => billing.filter((rule) => versContains(rule.vers, version)).map((rule) => rule.id);
  assert.deepEqual(affected("4.1.0"), []);
  assert.deepEqual(affected("5.0.0"), ["android.play-billing.version-5"]);
  assert.deepEqual(affected("5.2.1"), ["android.play-billing.version-5"]);
  assert.deepEqual(affected("6.0.0"), ["android.play-billing.version-6"]);
  assert.deepEqual(affected("7.0.0"), ["android.play-billing.version-7"]);
  assert.deepEqual(affected("7.1.1"), ["android.play-billing.version-7"]);
  assert.deepEqual(affected("8.0.0"), ["android.play-billing.version-8"]);
  assert.deepEqual(affected("8.9.9"), ["android.play-billing.version-8"]);
  assert.deepEqual(affected("9.0.0"), ["android.play-billing.version-9"]);
  assert.deepEqual(affected("10.0.0"), []);
});

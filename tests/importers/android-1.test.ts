import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { TARGET_SDK_URL, androidTargetSdkImporter } from "../../tools/importers/android-1.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/android-1.json");

const PAGE = `<!DOCTYPE html><html><body>
<p>Starting August 31 2026:</p>
<ul>
<li>New apps and app updates must target Android 16 (API level 36) or higher to be submitted to Google Play; except for Wear OS and Android Automotive OS apps, which must target Android 15 (API level 35) or higher, and Android TV and Android XR apps, which must target Android 14 (API level 34) or higher.</li>
<li>Existing apps must target Android 15 (API level 35) or higher to remain available to new users on devices running Android OS higher than your app's target API level. Apps that target Android 14 (API level 34) or lower, including Android 13 (API level 33) or lower for Wear OS, Android TV, and Android XR, and Android 12 (API level 31) or lower for Android Automotive OS, will only be available on devices running Android OS that are the same or lower than your app's target API level.</li>
</ul>
<p>If you need more time to update your app, you'll be able to request an extension to November 1, 2026.</p>
<p>Exceptions to these requirements include:</p>
<ul><li>Permanently private apps that are restricted to users in a specific organization and intended for internal distribution only.</li></ul>
</body></html>`;

function inline(body: string, now = "2026-10-19"): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url, options) {
      assert.equal(url, TARGET_SDK_URL);
      assert.equal(options?.accept, "text/html");
      return body;
    },
  };
}

test("drafts one form-factor rule per Play targetSdk floor from the recording", async () => {
  const drafts = await execute(androidTargetSdkImporter, { replay: recording, now: "2026-10-19" });
  assert.equal(drafts.observedAt, "2026-10-19");
  assert.deepEqual(
    drafts.rules.map((rule) => [rule.id, rule.vers, rule.event, rule.severity, rule.deadline, rule["x-android"]]),
    [
      [
        "android.target-sdk.existing.automotive-below-32",
        "vers:intdot/<32",
        "end-of-support",
        "high",
        "2026-08-31",
        { declaration: "targetSdk", audience: "existing-apps", formFactors: ["automotive"], minApiLevel: 32 },
      ],
      [
        "android.target-sdk.existing.default-below-35",
        "vers:intdot/<35",
        "end-of-support",
        "high",
        "2026-08-31",
        { declaration: "targetSdk", audience: "existing-apps", formFactors: ["default"], minApiLevel: 35 },
      ],
      [
        "android.target-sdk.existing.wear-tv-xr-below-34",
        "vers:intdot/<34",
        "end-of-support",
        "high",
        "2026-08-31",
        { declaration: "targetSdk", audience: "existing-apps", formFactors: ["wear", "tv", "xr"], minApiLevel: 34 },
      ],
      [
        "android.target-sdk.new-apps.default-below-36",
        "vers:intdot/<36",
        "end-of-support",
        "high",
        "2026-08-31",
        { declaration: "targetSdk", audience: "new-apps-and-updates", formFactors: ["default"], minApiLevel: 36 },
      ],
      [
        "android.target-sdk.new-apps.tv-xr-below-34",
        "vers:intdot/<34",
        "end-of-support",
        "high",
        "2026-08-31",
        { declaration: "targetSdk", audience: "new-apps-and-updates", formFactors: ["tv", "xr"], minApiLevel: 34 },
      ],
      [
        "android.target-sdk.new-apps.wear-automotive-below-35",
        "vers:intdot/<35",
        "end-of-support",
        "high",
        "2026-08-31",
        { declaration: "targetSdk", audience: "new-apps-and-updates", formFactors: ["wear", "automotive"], minApiLevel: 35 },
      ],
    ],
  );
  const phoneNew = drafts.rules.find((rule) => rule.id === "android.target-sdk.new-apps.default-below-36")!;
  assert.equal(phoneNew.purl, "pkg:generic/android/targetSdk");
  assert.match(phoneNew.summary, /New apps and app updates must target Android 16 \(API level 36\)/);
  assert.match(phoneNew.summary, /extension to 2026-11-01/);
  assert.deepEqual(phoneNew.sources, [{ title: "Meet Google Play's target API level requirement", url: TARGET_SDK_URL }]);
  assert.deepEqual(phoneNew.provenance, {
    observedAt: "2026-10-19",
    reviewedAt: "2026-10-19",
    reviewer: "pending-review",
    importer: "android-1",
  });
  assert.ok(drafts.notes.some((note) => /x-android\.formFactors/.test(note)));
  assert.ok(drafts.notes.some((note) => /Google Play/.test(note)));
  assert.ok(drafts.notes.some((note) => note.includes("2026-11-01")));
});

test("recorded drafts are additions against the Billing-only Android registry", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/android.json"), "utf8")) as RegistryV2;
  const drafts = await execute(androidTargetSdkImporter, { replay: recording, now: "2026-10-19" });
  const diff = diffDrafts(drafts, registry);
  assert.equal(diff.added.length, 6);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.duplicates, []);
  assert.ok(registry.rules.every((rule) => rule.id.startsWith("android.play-billing.")));
});

test("before the requirement date the same floors are scheduled-end-of-life at low severity", async () => {
  const drafts = await execute(androidTargetSdkImporter, { replay: recording, now: "2026-08-01" });
  assert.ok(drafts.rules.every((rule) => rule.event === "scheduled-end-of-life" && rule.severity === "low"));
  assert.ok(drafts.rules.every((rule) => rule.deadline === "2026-08-31"));
});

test("a missing or reworded requirement block produces a review note, not guessed rules", async () => {
  for (const body of ["<html></html>", "<p>Starting August 31 2026:</p><p>Something else entirely.</p>"]) {
    const result = await runImporter(androidTargetSdkImporter, inline(body));
    assert.deepEqual(result.rules, []);
    assert.ok(result.notes.length >= 1);
  }
});

test("a source failure stops the run", async () => {
  await assert.rejects(
    runImporter(androidTargetSdkImporter, {
      now: new Date("2026-10-19T12:00:00Z"),
      async fetchText() {
        throw new Error("source is down");
      },
    }),
    /source is down/,
  );
});

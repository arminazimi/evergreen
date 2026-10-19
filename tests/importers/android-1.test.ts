/**
 * Recording provenance: `tests/importers/recordings/android-1.json` is the unedited raw HTML from
 * the Wayback Machine `id_` capture dated 2026-09-29 of
 * https://developer.android.com/google/play/requirements/target-sdk
 * (https://web.archive.org/web/20260929090425id_/https://developer.android.com/google/play/requirements/target-sdk).
 * Live `developer.android.com` returns HTTP 403 to the importer user agent; the recording keeps the
 * live URL so replay matches what the importer fetches. Schema `evergreen.importer-recording.v1`
 * has no provenance/note field, so this comment and the PR body carry that history.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { TARGET_SDK_URL, androidTargetSdkImporter } from "../../tools/importers/android-1.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/android-1.json");
const EXISTING_APPS_SENTENCE =
  "including Android 13 (API level 33) or lower for Wear OS, Android TV, and Android XR, and Android 12 (API level 31) or lower for Android Automotive OS";

const NEW_APPS =
  "New apps and app updates must target Android 16 (API level 36) or higher to be submitted to Google Play; except for Wear OS and Android Automotive OS apps, which must target Android 15 (API level 35) or higher, and Android TV and Android XR apps, which must target Android 14 (API level 34) or higher.";
const EXISTING =
  "Existing apps must target Android 15 (API level 35) or higher to remain available to new users on devices running Android OS higher than your app's target API level. Apps that target Android 14 (API level 34) or lower, including Android 13 (API level 33) or lower for Wear OS, Android TV, and Android XR, and Android 12 (API level 31) or lower for Android Automotive OS, will only be available on devices running Android OS that are the same or lower than your app's target API level.";

function page(options: {
  start?: string;
  newApps?: string;
  existing?: string;
  extension?: string | false;
}): string {
  const start = options.start ?? "Starting August 31 2026:";
  const newApps = options.newApps ?? NEW_APPS;
  const existing = options.existing ?? EXISTING;
  const extension =
    options.extension === false
      ? ""
      : `<p>${options.extension ?? "If you need more time to update your app, you'll be able to request an extension to November 1, 2026."}</p>`;
  return `<!DOCTYPE html><html><body>
<p>${start}</p>
<ul>
<li>${newApps}</li>
<li>${existing}</li>
</ul>
${extension}
</body></html>`;
}

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

const EXPECTED_AFTER_DEADLINE = [
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
] as const;

test("drafts one form-factor rule per Play targetSdk floor from the recording", async () => {
  const recordedBody = (JSON.parse(readFileSync(recording, "utf8")) as { responses: { body: string }[] }).responses[0]!
    .body;
  const collapsed = recordedBody.replace(/\s+/g, " ");
  assert.ok(collapsed.includes("Starting August 31 2026:"));
  assert.ok(collapsed.includes(EXISTING_APPS_SENTENCE));

  const drafts = await execute(androidTargetSdkImporter, { replay: recording, now: "2026-10-19" });
  assert.equal(drafts.observedAt, "2026-10-19");
  assert.deepEqual(
    drafts.rules.map((rule) => [rule.id, rule.vers, rule.event, rule.severity, rule.deadline, rule["x-android"]]),
    EXPECTED_AFTER_DEADLINE,
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

test("recorded drafts are additions against an unrelated inline Android registry", async () => {
  const registry: RegistryV2 = {
    schemaVersion: "evergreen.registry.v2",
    ecosystem: "android",
    rules: [
      {
        id: "android.example.unrelated",
        ecosystem: "android",
        purl: "pkg:maven/com.example/unrelated",
        vers: "vers:maven/<1.0.0",
        event: "deprecated",
        title: "example unrelated rule",
        summary: "A stand-in rule so the diff test does not read registry/android.json.",
        severity: "low",
        sources: [{ title: "example", url: "https://example.com/android-unrelated" }],
        provenance: { observedAt: "2026-10-19", reviewedAt: "2026-10-19", reviewer: "test" },
      },
    ],
  };
  const drafts = await execute(androidTargetSdkImporter, { replay: recording, now: "2026-10-19" });
  const diff = diffDrafts(drafts, registry);
  assert.equal(diff.added.length, 6);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.duplicates, []);
});

test("before the requirement date the same floors are scheduled-end-of-life at low severity", async () => {
  const drafts = await execute(androidTargetSdkImporter, { replay: recording, now: "2026-08-01" });
  assert.ok(drafts.rules.every((rule) => rule.event === "scheduled-end-of-life" && rule.severity === "low"));
  assert.ok(drafts.rules.every((rule) => rule.deadline === "2026-08-31"));
});

test("deadline equal to the run day is end-of-support at high severity", async () => {
  const drafts = await runImporter(androidTargetSdkImporter, inline(page({}), "2026-08-31"));
  assert.equal(drafts.rules.length, 6);
  assert.ok(drafts.rules.every((rule) => rule.event === "end-of-support" && rule.severity === "high"));
  assert.ok(drafts.rules.every((rule) => rule.deadline === "2026-08-31"));
});

test("a calendar-invalid start date produces no rules and a note", async () => {
  const result = await runImporter(androidTargetSdkImporter, inline(page({ start: "Starting February 30 2026:" })));
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, ["No usable 'Starting <date>:' requirement block was found on the target API page."]);
});

test("a page without the extension sentence still drafts six rules and notes the gap", async () => {
  const result = await runImporter(androidTargetSdkImporter, inline(page({ extension: false })));
  assert.deepEqual(
    result.rules.map((rule) => [rule.id, rule.vers, rule.event, rule.severity, rule.deadline, rule["x-android"]]),
    EXPECTED_AFTER_DEADLINE,
  );
  assert.ok(!result.rules.some((rule) => /extension to/.test(rule.summary)));
  assert.ok(result.notes.includes("No extension deadline sentence was found on the page."));
});

test("changed floors update ids, vers, and minApiLevel together", async () => {
  const result = await runImporter(
    androidTargetSdkImporter,
    inline(
      page({
        newApps:
          "New apps and app updates must target Android 17 (API level 37) or higher to be submitted to Google Play; except for Wear OS and Android Automotive OS apps, which must target Android 16 (API level 36) or higher, and Android TV and Android XR apps, which must target Android 15 (API level 35) or higher.",
        existing:
          "Existing apps must target Android 16 (API level 36) or higher to remain available to new users on devices running Android OS higher than your app's target API level. Apps that target Android 15 (API level 35) or lower, including Android 14 (API level 34) or lower for Wear OS, Android TV, and Android XR, and Android 13 (API level 32) or lower for Android Automotive OS, will only be available on devices running Android OS that are the same or lower than your app's target API level.",
      }),
    ),
  );
  assert.deepEqual(
    result.rules.map((rule) => [rule.id, rule.vers, rule["x-android"]?.minApiLevel]),
    [
      ["android.target-sdk.existing.automotive-below-33", "vers:intdot/<33", 33],
      ["android.target-sdk.existing.default-below-36", "vers:intdot/<36", 36],
      ["android.target-sdk.existing.wear-tv-xr-below-35", "vers:intdot/<35", 35],
      ["android.target-sdk.new-apps.default-below-37", "vers:intdot/<37", 37],
      ["android.target-sdk.new-apps.tv-xr-below-35", "vers:intdot/<35", 35],
      ["android.target-sdk.new-apps.wear-automotive-below-36", "vers:intdot/<36", 36],
    ],
  );
});

test("only one of the two requirement sentences produces no rules", async () => {
  const onlyNew = await runImporter(
    androidTargetSdkImporter,
    inline(page({ existing: "Existing apps are mentioned without the form-factor floors." })),
  );
  assert.deepEqual(onlyNew.rules, []);
  assert.deepEqual(onlyNew.notes, [
    "The starting-date block was found, but the new-apps or existing-apps form-factor sentences did not match the expected wording.",
  ]);

  const onlyExisting = await runImporter(
    androidTargetSdkImporter,
    inline(page({ newApps: "New apps are mentioned without the form-factor floors." })),
  );
  assert.deepEqual(onlyExisting.rules, []);
  assert.deepEqual(onlyExisting.notes, [
    "The starting-date block was found, but the new-apps or existing-apps form-factor sentences did not match the expected wording.",
  ]);
});

test("typographic and entity forms of the requirement text still draft the same six rules", async () => {
  const variants = [
    EXISTING.replace(/app's/g, "app\u2019s"),
    EXISTING.replace(/app's/g, "app&rsquo;s"),
    EXISTING.replace(/app's/g, "app&#x27;s"),
    EXISTING.replace(/app's/g, "app&#39;s"),
    EXISTING.replace(/API level/g, "API&nbsp;level").replace(/app's/g, "app&#39;s"),
  ];
  for (const existing of variants) {
    const result = await runImporter(androidTargetSdkImporter, inline(page({ existing })));
    assert.deepEqual(
      result.rules.map((rule) => [rule.id, rule.vers, rule.event, rule.severity, rule.deadline, rule["x-android"]]),
      EXPECTED_AFTER_DEADLINE,
      existing.slice(0, 80),
    );
  }
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

test("unterminated script tags strip in linear time without drafting rules", async () => {
  const body = "<script>".repeat(40_000);
  const started = performance.now();
  const result = await runImporter(androidTargetSdkImporter, inline(body));
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 200, `expected under 200ms, took ${elapsed}ms`);
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, ["No usable 'Starting <date>:' requirement block was found on the target API page."]);
});

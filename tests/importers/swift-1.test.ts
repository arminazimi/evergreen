import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import {
  APP_STORE_REQUIREMENTS_URL,
  parseArticles,
  swiftAppStoreImporter,
  xcodeFloors,
} from "../../tools/importers/swift-1.js";
import { execute } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/swift-1.json");

test("drafts Xcode App Store upload bands from the recording", async () => {
  const drafts = await execute(swiftAppStoreImporter, { replay: recording, now: "2026-10-19" });
  assert.equal(drafts.importer, "swift-1");
  assert.equal(drafts.ecosystem, "swift");
  assert.equal(drafts.observedAt, "2026-10-19");
  assert.deepEqual(
    drafts.rules.map((rule) => [rule.id, rule.vers, rule.deadline]),
    [
      ["swift.xcode.app-store-14-1-through-14", "vers:semver/>=14.1.0|<15.0.0", "2024-04-29"],
      ["swift.xcode.app-store-15-through-25", "vers:semver/>=15.0.0|<26.0.0", "2026-04-28"],
      ["swift.xcode.app-store-below-14-1", "vers:semver/<14.1.0", "2023-04-25"],
    ],
  );

  const through25 = drafts.rules.find((rule) => rule.id === "swift.xcode.app-store-15-through-25")!;
  assert.equal(through25.purl, "pkg:generic/xcode");
  assert.equal(through25.event, "end-of-support");
  assert.equal(through25.severity, "high");
  assert.equal(through25.replacement, "Xcode 26 or later");
  assert.equal(
    through25.summary,
    "Since April 28, 2026. Apps uploaded to App Store Connect must be built with Xcode 26 or later using an SDK for iOS 26, iPadOS 26, tvOS 26, visionOS 26, or watchOS 26.",
  );
  assert.deepEqual(through25.sources, [
    {
      title: "SDK minimum requirements — App Store upcoming requirements (Xcode 26)",
      url: "https://developer.apple.com/news/upcoming-requirements/?id=04282026a",
    },
  ]);
  assert.deepEqual(through25.provenance, {
    observedAt: "2026-10-19",
    reviewedAt: "2026-10-19",
    reviewer: "pending-review",
    importer: "swift-1",
  });

  const below141 = drafts.rules.find((rule) => rule.id === "swift.xcode.app-store-below-14-1")!;
  assert.match(below141.summary, /built with Xcode 14\.1 and the iOS 16\.1 SDK or later/);

  const through14 = drafts.rules.find((rule) => rule.id === "swift.xcode.app-store-14-1-through-14")!;
  assert.equal(
    through14.summary,
    "Since April 29, 2024. Apps uploaded to App Store Connect must be built with Xcode 15 for iOS 17, iPadOS 17, tvOS 17, or watchOS 10 starting April 29, 2024.",
  );

  assert.ok(drafts.notes.some((note) => note.includes("iOS and iPadOS minimum system requirements")));
  assert.ok(drafts.notes.some((note) => note.includes("notary")));
  assert.ok(drafts.notes.some((note) => note.includes("tvOS-only")));
});

test("diff against the curated registry reports the finer 14.1 bands as additions", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/swift.json"), "utf8")) as RegistryV2;
  const drafts = await execute(swiftAppStoreImporter, { replay: recording, now: "2026-10-19" });
  const diff = diffDrafts(drafts, registry);
  assert.deepEqual(
    diff.added.map((rule) => rule.id).sort(),
    ["swift.xcode.app-store-14-1-through-14", "swift.xcode.app-store-below-14-1"],
  );
  assert.deepEqual(diff.unchanged, ["swift.xcode.app-store-15-through-25"]);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.duplicates, []);
});
test("an empty page yields a note and no rules", async () => {
  const context: ImporterContext = {
    now: new Date("2026-10-19T12:00:00Z"),
    async fetchText(url, options) {
      assert.equal(url, APP_STORE_REQUIREMENTS_URL);
      assert.equal(options?.accept, "text/html");
      return "<html><body>no articles</body></html>";
    },
  };
  const result = await swiftAppStoreImporter.import(context);
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, ["No usable upcoming-requirements articles were found in the page."]);
});

test("the recording contains the Xcode floors the importer reads", async () => {
  const recorded = JSON.parse(await readFile(recording, "utf8")) as {
    responses: { url: string; body?: string }[];
  };
  const body = recorded.responses.find((response) => response.url === APP_STORE_REQUIREMENTS_URL)!.body!;
  const { floors } = xcodeFloors(parseArticles(body));
  assert.deepEqual(
    floors.map((floor) => [floor.version, floor.deadline]),
    [
      ["14.1", "2023-04-25"],
      ["15", "2024-04-29"],
      ["26", "2026-04-28"],
    ],
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import {
  APP_STORE_REQUIREMENTS_URL,
  MAXIMUM_ARTICLES,
  parseArticles,
  swiftAppStoreImporter,
  xcodeFloors,
} from "../../tools/importers/swift-1.js";
import { execute } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/swift-1.json");

function article(id: string, options: { title?: string; since?: string; text?: string | null } = {}): string {
  const title = options.title ?? `Title ${id}`;
  const since = options.since ?? "Since April 28, 2026";
  const text =
    options.text === null
      ? ""
      : (options.text ??
        `<p>Apps uploaded to App Store Connect must be built with Xcode 26 or later using an SDK for iOS 26.</p>`);
  const textSpan = options.text === null ? "" : `<span class="article-text">${text}</span>`;
  return [
    `<article id="article-${id}">`,
    `<a class="article-title" href="/news/upcoming-requirements/?id=${id}"><h2>${title}</h2></a>`,
    `<p class="lighter  article-date">${since}</p>`,
    textSpan,
    `</article>`,
  ].join("");
}

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

// Draft bands below-14.1 and 14.1-through-14 overlap the curated swift.xcode.app-store-below-15
// rule (vers:<15); a reviewer must pick one set. This PR does not change registry/swift.json.
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
  const { floors } = xcodeFloors(parseArticles(body).articles);
  assert.deepEqual(
    floors.map((floor) => [floor.version, floor.deadline]),
    [
      ["14.1", "2023-04-25"],
      ["15", "2024-04-29"],
      ["26", "2026-04-28"],
    ],
  );
});

test("a block missing article-text between two valid blocks is skipped with an exact note", () => {
  const body = [
    article("first", {
      title: "Xcode 14.1",
      since: "Since April 25, 2023",
      text: "<p>iOS and iPadOS apps submitted to the App Store must be built with Xcode 14.1 and the iOS 16.1 SDK or later.</p>",
    }),
    article("incomplete", { title: "Incomplete Title", text: null }),
    article("third", {
      title: "SDK minimum requirements",
      since: "Since April 28, 2026",
      text: "<p>Apps uploaded to App Store Connect must be built with Xcode 26 or later using an SDK for iOS 26.</p>",
    }),
  ].join("\n");
  const parsed = parseArticles(body);
  assert.deepEqual(
    parsed.notes,
    ['Skipped article "Incomplete Title" (id=incomplete): missing article-text.'],
  );
  const { floors } = xcodeFloors(parsed.articles);
  assert.deepEqual(
    floors.map((floor) => [floor.version, floor.deadline]),
    [
      ["14.1", "2023-04-25"],
      ["26", "2026-04-28"],
    ],
  );
});

test("parseArticles stays under 500ms for large and incomplete pages", () => {
  const wellFormed = Array.from({ length: MAXIMUM_ARTICLES }, (_, index) =>
    article(`n${index}`, {
      title: `Floor ${index}`,
      text: `<p>Apps uploaded to App Store Connect must be built with Xcode ${(index % 5) + 10} or later.</p>`,
    }),
  ).join("\n");
  const missingText = Array.from({ length: 1000 }, (_, index) =>
    article(`m${index}`, { title: `Missing ${index}`, text: null }),
  ).join("\n");
  const bareOpens = Array.from({ length: 1000 }, () => '<article id="article-a">').join("");

  const startWell = performance.now();
  const well = parseArticles(wellFormed);
  const wellMs = performance.now() - startWell;
  assert.ok(wellMs < 500, `2000 well-formed articles took ${wellMs.toFixed(1)}ms`);
  assert.equal(well.articles.length, MAXIMUM_ARTICLES);

  const startMissing = performance.now();
  const missing = parseArticles(missingText);
  const missingMs = performance.now() - startMissing;
  assert.ok(missingMs < 500, `1000 articles without article-text took ${missingMs.toFixed(1)}ms`);
  assert.equal(missing.articles.length, 0);
  assert.equal(xcodeFloors(missing.articles).floors.length, 0);

  const startBare = performance.now();
  const bare = parseArticles(bareOpens);
  const bareMs = performance.now() - startBare;
  assert.ok(bareMs < 500, `1000 consecutive article opens took ${bareMs.toFixed(1)}ms`);
  assert.equal(bare.articles.length, 0);
});

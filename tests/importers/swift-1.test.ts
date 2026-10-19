import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import {
  APP_STORE_REQUIREMENTS_URL,
  MAXIMUM_ARTICLES,
  MAXIMUM_BODY_BYTES,
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

function xcodeArticle(id: string, version: string, since: string, title?: string): string {
  return article(id, {
    title: title ?? `Xcode ${version}`,
    since,
    text: `<p>Apps uploaded to App Store Connect must be built with Xcode ${version} or later using an SDK for iOS.</p>`,
  });
}

async function importHtml(body: string, now = "2026-10-19") {
  const context: ImporterContext = {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url, options) {
      assert.equal(url, APP_STORE_REQUIREMENTS_URL);
      assert.equal(options?.accept, "text/html");
      return body;
    },
  };
  return swiftAppStoreImporter.import(context);
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
  assert.deepEqual(
    drafts.rules.map((rule) => rule.id).sort(),
    [
      "swift.xcode.app-store-14-1-through-14",
      "swift.xcode.app-store-15-through-25",
      "swift.xcode.app-store-below-14-1",
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

  for (const rule of drafts.rules) {
    assert.equal(rule.replacement, "Xcode 26 or later");
  }

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

// Draft bands below-14.1 and 14.1-through-14 overlap curated swift.xcode.app-store-below-15;
// a reviewer must pick one set. This PR does not change registry/swift.json.
test("diff against the curated registry reports additions and leaves below-15 for the reviewer", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/swift.json"), "utf8")) as RegistryV2;
  const drafts = await execute(swiftAppStoreImporter, { replay: recording, now: "2026-10-19" });
  const diff = diffDrafts(drafts, registry);
  assert.deepEqual(
    diff.added.map((rule) => rule.id).sort(),
    ["swift.xcode.app-store-14-1-through-14", "swift.xcode.app-store-below-14-1"],
  );
  // Hand-written rules lack provenance.importer, so diff.removed stays empty. The curated
  // below-15 rule is still in the registry and absent from drafts — that is the overlap to resolve.
  assert.deepEqual(diff.removed.map((rule) => rule.id), []);
  assert.deepEqual(
    registry.rules.map((rule) => rule.id).filter((id) => !drafts.rules.some((draft) => draft.id === id)),
    ["swift.xcode.app-store-below-15"],
  );
  assert.deepEqual(diff.unchanged, ["swift.xcode.app-store-15-through-25"]);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.duplicates, []);
});

test("draft id, title, and vers use through for whole majors and up-to for dotted floors", async () => {
  const body = [
    xcodeArticle("a", "14.1", "Since April 25, 2023"),
    xcodeArticle("b", "15", "Since April 29, 2024"),
    xcodeArticle("c", "26.1", "Since April 28, 2026"),
    xcodeArticle("d", "27", "Since May 1, 2026"),
  ].join("\n");
  const result = await importHtml(body);
  assert.deepEqual(
    result.rules
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((rule) => [rule.id, rule.title, rule.vers, rule.replacement]),
    [
      [
        "swift.xcode.app-store-14-1-through-14",
        "Xcode 14.1 through 14 are not accepted for App Store uploads",
        "vers:semver/>=14.1.0|<15.0.0",
        "Xcode 27 or later",
      ],
      [
        "swift.xcode.app-store-15-up-to-26-1",
        "Xcode 15 up to 26.1 are not accepted for App Store uploads",
        "vers:semver/>=15.0.0|<26.1.0",
        "Xcode 27 or later",
      ],
      [
        "swift.xcode.app-store-26-1-through-26",
        "Xcode 26.1 through 26 are not accepted for App Store uploads",
        "vers:semver/>=26.1.0|<27.0.0",
        "Xcode 27 or later",
      ],
      [
        "swift.xcode.app-store-below-14-1",
        "Xcode older than 14.1 is not accepted for App Store uploads",
        "vers:semver/<14.1.0",
        "Xcode 27 or later",
      ],
    ],
  );
});

test("a floor whose Since date is after the run day is skipped with an exact note", async () => {
  const body = [
    xcodeArticle("past", "15", "Since April 29, 2024", "Xcode 15 floor"),
    xcodeArticle("future", "26", "Since April 28, 2027", "Future Xcode 26 floor"),
  ].join("\n");
  const result = await importHtml(body, "2026-10-19");
  assert.deepEqual(
    result.rules.map((rule) => [rule.id, rule.vers, rule.deadline, rule.replacement]),
    [["swift.xcode.app-store-below-15", "vers:semver/<15.0.0", "2024-04-29", "Xcode 26 or later"]],
  );
  assert.deepEqual(result.notes, [
    'Skipped Xcode 26 floor from "Future Xcode 26 floor": deadline 2027-04-28 is still in the future.',
  ]);
});

test("two articles with the same Xcode version keep the first and note the duplicate", () => {
  const body = [
    xcodeArticle("first", "15", "Since April 29, 2024", "First Xcode 15"),
    xcodeArticle("second", "15", "Since May 1, 2024", "Second Xcode 15"),
  ].join("\n");
  const { floors, notes } = xcodeFloors(parseArticles(body).articles);
  assert.deepEqual(
    floors.map((floor) => [floor.version, floor.deadline, floor.title]),
    [["15", "2024-04-29", "First Xcode 15"]],
  );
  assert.deepEqual(notes, [
    'Skipped duplicate Xcode 15 floor from "Second Xcode 15" (keeping "First Xcode 15").',
  ]);
});

test("a Since line with an invalid month produces a note and no rule", async () => {
  const body = article("bad-month", {
    title: "Bad month Xcode floor",
    since: "Since Smarch 15, 2024",
    text: "<p>Apps uploaded to App Store Connect must be built with Xcode 15 or later.</p>",
  });
  const result = await importHtml(body);
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, ['Skipped "Bad month Xcode floor": no readable Since date.']);
});

test('an article that mentions "must target iOS" is skipped with the exact note', async () => {
  const body = article("ios-min", {
    title: "iOS and iPadOS minimum system requirements",
    since: "Since April 28, 2026",
    text: "<p>Apps uploaded to App Store Connect must target iOS 26 or later.</p>",
  });
  const result = await importHtml(body);
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, [
    'Skipped "iOS and iPadOS minimum system requirements": iOS/iPadOS deployment-target minima apply to App Store Connect uploads, not library Package.swift platforms (see follow-up for app-vs-library detection).',
  ]);
});

test("inverted deadlines still produce non-overlapping version bands", async () => {
  const body = [
    xcodeArticle("low", "14", "Since June 1, 2025", "Later deadline on lower floor"),
    xcodeArticle("high", "15", "Since April 29, 2024", "Earlier deadline on higher floor"),
  ].join("\n");
  const result = await importHtml(body);
  assert.deepEqual(
    result.rules
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((rule) => [rule.id, rule.vers, rule.deadline]),
    [
      ["swift.xcode.app-store-14-through-14", "vers:semver/>=14.0.0|<15.0.0", "2024-04-29"],
      ["swift.xcode.app-store-below-14", "vers:semver/<14.0.0", "2025-06-01"],
    ],
  );
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

test('an article whose text is only "<" characters returns empty text', () => {
  const parsed = parseArticles(article("angles", { text: "<".repeat(60_000) }));
  assert.equal(parsed.notes.length, 0);
  assert.equal(parsed.articles.length, 1);
  assert.equal(parsed.articles[0]!.text, "");
});

test('plainText keeps a lone "<" comparison and strips real tags', () => {
  const parsed = parseArticles(article("mixed", { text: "a < b <b>bold</b> c" }));
  assert.equal(parsed.articles.length, 1);
  assert.equal(parsed.articles[0]!.text, "a < b bold c");
});

test("pathological article text finishes under 1 second", () => {
  const wall = article("wall", { text: "<".repeat(1_900_000) });
  assert.ok(Buffer.byteLength(wall, "utf8") <= MAXIMUM_BODY_BYTES);
  const startWall = performance.now();
  const wallParsed = parseArticles(wall);
  const wallMs = performance.now() - startWall;
  assert.ok(wallMs < 1000, `1.9M "<" article took ${wallMs.toFixed(1)}ms`);
  assert.equal(wallParsed.articles.length, 1);
  assert.equal(wallParsed.articles[0]!.text, "");

  const bold = article("bold", { text: "<b>x</b>".repeat(100_000) });
  const startBold = performance.now();
  const boldParsed = parseArticles(bold);
  const boldMs = performance.now() - startBold;
  assert.ok(boldMs < 1000, `100k <b>x</b> article took ${boldMs.toFixed(1)}ms`);
  assert.equal(boldParsed.articles.length, 1);
  assert.equal(boldParsed.articles[0]!.text, Array.from({ length: 100_000 }, () => "x").join(" "));

  const long = "y".repeat(40_000);
  const blocks: string[] = [];
  while (Buffer.byteLength(`${blocks.join("\n")}\n`, "utf8") < MAXIMUM_BODY_BYTES - 50_000) {
    blocks.push(
      article(`big${blocks.length}`, {
        text: `<p>Apps uploaded to App Store Connect must be built with Xcode 15 or later. ${long}</p>`,
      }),
    );
  }
  const heavy = blocks.join("\n");
  assert.ok(Buffer.byteLength(heavy, "utf8") > 1_500_000);
  assert.ok(Buffer.byteLength(heavy, "utf8") <= MAXIMUM_BODY_BYTES);
  const startHeavy = performance.now();
  const heavyParsed = parseArticles(heavy);
  const heavyMs = performance.now() - startHeavy;
  assert.ok(heavyMs < 1000, `~2MB article body took ${heavyMs.toFixed(1)}ms`);
  assert.ok(heavyParsed.articles.length >= 10);
});

test("parseArticles stays under 5000ms for large and incomplete pages", () => {
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

  const n = 500;
  const bodyN = wellFormed.split("\n").slice(0, n).join("\n");
  const startN = performance.now();
  const atN = parseArticles(bodyN);
  const msN = performance.now() - startN;
  const start4N = performance.now();
  const at4N = parseArticles(wellFormed);
  const ms4N = performance.now() - start4N;
  assert.equal(atN.articles.length, n);
  assert.equal(at4N.articles.length, MAXIMUM_ARTICLES);
  assert.ok(ms4N < 5000, `${MAXIMUM_ARTICLES} well-formed articles took ${ms4N.toFixed(1)}ms`);
  if (msN >= 25) {
    const ratio = ms4N / msN;
    assert.ok(
      ratio < 12,
      `4N/N runtime ratio was ${ratio.toFixed(2)} (N=${msN.toFixed(1)}ms, 4N=${ms4N.toFixed(1)}ms)`,
    );
  }

  const startMissing = performance.now();
  const missing = parseArticles(missingText);
  const missingMs = performance.now() - startMissing;
  assert.ok(missingMs < 5000, `1000 articles without article-text took ${missingMs.toFixed(1)}ms`);
  assert.equal(missing.articles.length, 0);
  assert.equal(xcodeFloors(missing.articles).floors.length, 0);

  const startBare = performance.now();
  const bare = parseArticles(bareOpens);
  const bareMs = performance.now() - startBare;
  assert.ok(bareMs < 5000, `1000 consecutive article opens took ${bareMs.toFixed(1)}ms`);
  assert.equal(bare.articles.length, 0);
});

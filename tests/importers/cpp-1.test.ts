import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import {
  CMAKE_MINIMUM_REQUIRED_URL,
  RELEASE_TAG,
  cmakePolicyImporter,
  compareVersions,
  compatibilitySignals,
  draftSignals,
  semverBound,
  type PolicyDraft,
} from "../../tools/importers/cpp-1.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";
import { ImporterError } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/cpp-1.json");

const PAGE = (body: string) =>
  body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p><span>${line}</span></p>`)
    .join("\n");

test("drafts the removed <3.5 and deprecated 3.5–3.10 bands from the recording", async () => {
  const drafts = await execute(cmakePolicyImporter, { replay: recording });
  assert.deepEqual(
    drafts.rules.map((rule) => [rule.id, rule.vers, rule.event, rule.deadline]),
    [
      ["cpp.cmake.policy-below-3.10.deprecated", "vers:semver/>=3.5.0|<3.10.0", "deprecated", "2024-11-06"],
      ["cpp.cmake.policy-below-3.5.removed", "vers:semver/<3.5.0", "removed", "2025-03-27"],
    ],
  );
  assert.ok(drafts.rules.every((rule) => rule.purl === "pkg:generic/cmake"));
  assert.ok(drafts.rules.every((rule) => rule.provenance.importer === "cpp-1" && rule.provenance.observedAt === "2026-10-19"));
  assert.ok(drafts.rules.every((rule) => rule.sources.some((source) => source.url === CMAKE_MINIMUM_REQUIRED_URL)));
  assert.ok(drafts.notes.some((note) => /2\.8\.12/.test(note)));
  assert.ok(drafts.notes.some((note) => /3\.5/.test(note) && /3\.27/.test(note)));
});

test("recorded drafts match the curated C and C++ registry policy rules", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/cpp.json"), "utf8")) as RegistryV2;
  const drafts = await execute(cmakePolicyImporter, { replay: recording });
  const diff = diffDrafts(drafts, registry);
  assert.deepEqual([diff.added, diff.changed, diff.removed], [[], [], []]);
});

test("missing compatibility notes produce a review note, not guessed rules", async () => {
  const result = await runImporter(cmakePolicyImporter, {
    now: new Date("2026-10-19T12:00:00Z"),
    async fetchText(url) {
      assert.equal(url, CMAKE_MINIMUM_REQUIRED_URL);
      return "<p>cmake_minimum_required(VERSION 3.16)</p>";
    },
  });
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, ["No usable CMake compatibility Changed-in-version notes were found."]);
});

test("deprecation bands partition above removals and each other", () => {
  const { drafts, notes } = draftSignals([
    { cmake: "4.0", floor: "3.5", kind: "removed" },
    { cmake: "3.31", floor: "3.10", kind: "deprecated" },
    { cmake: "4.2", floor: "3.16", kind: "deprecated" },
  ]);
  assert.deepEqual(
    drafts.map((draft: PolicyDraft) => [draft.floor, draft.kind, draft.lower, draft.lowerKind]),
    [
      ["3.5", "removed", undefined, undefined],
      ["3.10", "deprecated", "3.5", "removed"],
      ["3.16", "deprecated", "3.10", "deprecated"],
    ],
  );
  assert.deepEqual(
    drafts
      .filter((draft: PolicyDraft) => draft.kind === "deprecated")
      .map((draft: PolicyDraft) => `vers:semver/>=${semverBound(draft.lower!)}|<${semverBound(draft.floor)}`),
    ["vers:semver/>=3.5.0|<3.10.0", "vers:semver/>=3.10.0|<3.16.0"],
  );
  assert.deepEqual(notes, []);
});

test("duplicate same-floor same-kind signals keep the earliest CMake release", () => {
  const laterFirst = draftSignals([
    { cmake: "4.1", floor: "3.5", kind: "removed" },
    { cmake: "4.0", floor: "3.5", kind: "removed" },
  ]);
  assert.deepEqual(
    laterFirst.drafts.map((draft: PolicyDraft) => [draft.floor, draft.kind, draft.cmake]),
    [["3.5", "removed", "4.0"]],
  );
  assert.ok(laterFirst.notes.some((note: string) => /4\.1/.test(note) && /4\.0/.test(note) && /earlier/.test(note)));

  const earlierFirst = draftSignals([
    { cmake: "4.0", floor: "3.5", kind: "removed" },
    { cmake: "4.1", floor: "3.5", kind: "removed" },
  ]);
  assert.deepEqual(
    earlierFirst.drafts.map((draft: PolicyDraft) => [draft.floor, draft.kind, draft.cmake]),
    [["3.5", "removed", "4.0"]],
  );
  assert.ok(earlierFirst.notes.some((note: string) => /keeping the earlier announcement in CMake 4\.0/.test(note)));
});

test("a deprecation whose floor is at or below an existing removal floor is skipped with a note", () => {
  const { drafts, notes } = draftSignals([
    { cmake: "4.0", floor: "3.5", kind: "removed" },
    { cmake: "3.27", floor: "3.5", kind: "deprecated" },
    { cmake: "3.19", floor: "2.8.12", kind: "deprecated" },
  ]);
  assert.deepEqual(
    drafts.map((draft: PolicyDraft) => [draft.floor, draft.kind]),
    [["3.5", "removed"]],
  );
  assert.ok(notes.some((note: string) => /3\.5/.test(note) && /3\.27/.test(note)));
  assert.ok(notes.some((note: string) => /2\.8\.12/.test(note) && /3\.5/.test(note)));
});

test("compatibilitySignals still parse the real page shape", () => {
  const html = PAGE(`
    Changed in version 4.0: Compatibility with versions of CMake older than 3.5 is removed.
    Changed in version 3.31: Compatibility with versions of CMake older than 3.10 is deprecated.
    Changed in version 3.27: Compatibility with versions of CMake older than 3.5 is deprecated.
    Changed in version 3.19: Compatibility with versions of CMake older than 2.8.12 is deprecated.
  `);
  assert.equal(compatibilitySignals(html).length, 4);
  assert.ok(compareVersions("3.5", "3.10") < 0);
  assert.equal(semverBound("3.5"), "3.5.0");
  assert.equal(semverBound("2.8.12"), "2.8.12");
});

function contextWith(
  html: string,
  releases: Record<string, { published_at?: string; html_url?: string }>,
  now = "2026-10-19",
): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url, options) {
      if (url === CMAKE_MINIMUM_REQUIRED_URL) {
        assert.equal(options?.accept, "text/html");
        return html;
      }
      for (const [cmake, payload] of Object.entries(releases)) {
        if (url === RELEASE_TAG(cmake)) {
          assert.equal(options?.accept, "application/vnd.github+json");
          return JSON.stringify(payload);
        }
      }
      throw new ImporterError(`GET ${url} failed: HTTP 404`);
    },
  };
}

test("a signal with a release date after the run day is skipped with a note", async () => {
  const result = await runImporter(
    cmakePolicyImporter,
    contextWith(
      PAGE("Changed in version 4.0: Compatibility with versions of CMake older than 3.5 is removed."),
      {
        "4.0": {
          published_at: "2026-12-01T00:00:00Z",
          html_url: "https://github.com/Kitware/CMake/releases/tag/v4.0.0",
        },
      },
      "2026-10-19",
    ),
  );
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, [
    "Skipped policy floor 3.5 (removed): CMake 4.0.0 is dated 2026-12-01, after 2026-10-19.",
  ]);
});

test("a GitHub release lookup with no published_at gives a note and no rule", async () => {
  const result = await runImporter(
    cmakePolicyImporter,
    contextWith(PAGE("Changed in version 4.0: Compatibility with versions of CMake older than 3.5 is removed."), {
      "4.0": { html_url: "https://github.com/Kitware/CMake/releases/tag/v4.0.0" },
    }),
  );
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, ["Skipped policy floor 3.5 (removed): no published date for CMake 4.0.0."]);
});

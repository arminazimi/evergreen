import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import {
  CMAKE_MINIMUM_REQUIRED_URL,
  cmakePolicyImporter,
  compareVersions,
  compatibilitySignals,
  draftSignals,
  semverBound,
} from "../../tools/importers/cpp-1.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { execute, runImporter } from "../../tools/importers/run.js";

const recording = resolve("tests/importers/recordings/cpp-1.json");

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

test("diff against the curated registry keeps the two policy rule ids and never writes the registry", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/cpp.json"), "utf8")) as RegistryV2;
  const drafts = await execute(cmakePolicyImporter, { replay: recording });
  const diff = diffDrafts(drafts, registry);
  assert.deepEqual(
    diff.added.map((rule) => rule.id),
    [],
  );
  assert.deepEqual(
    diff.removed.map((rule) => rule.id),
    [],
  );
  assert.deepEqual(
    diff.changed.map((change) => change.id).sort(),
    ["cpp.cmake.policy-below-3.10.deprecated", "cpp.cmake.policy-below-3.5.removed"],
  );
  assert.ok(registry.rules.some((rule) => rule.id === "cpp.cmake.generator.visual-studio-12-2013.removed"));
  assert.ok(!diff.changed.some((change) => change.id.includes("generator") || change.id.includes("module")));
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

test("compatibilitySignals and draftSignals collapse overlapping floors", () => {
  const html = `
    <p><span>Changed in version 4.0: </span>Compatibility with versions of CMake older than 3.5 is removed.</p>
    <p><span>Changed in version 3.31: </span>Compatibility with versions of CMake older than 3.10 is deprecated.</p>
    <p><span>Changed in version 3.27: </span>Compatibility with versions of CMake older than 3.5 is deprecated.</p>
    <p><span>Changed in version 3.19: </span>Compatibility with versions of CMake older than 2.8.12 is deprecated.</p>
  `;
  const signals = compatibilitySignals(html);
  assert.equal(signals.length, 4);
  const { drafts, notes } = draftSignals(signals);
  assert.deepEqual(
    drafts.map((draft) => [draft.floor, draft.kind, draft.lower]),
    [
      ["3.5", "removed", undefined],
      ["3.10", "deprecated", "3.5"],
    ],
  );
  assert.ok(notes.length >= 2);
  assert.ok(compareVersions("3.5", "3.10") < 0);
  assert.ok(compareVersions("3.10", "3.5") > 0);
  assert.equal(semverBound("3.5"), "3.5.0");
  assert.equal(semverBound("2.8.12"), "2.8.12");
});

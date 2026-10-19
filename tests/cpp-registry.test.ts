import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { validateRegistryV2 } from "../src/registry.js";
import { versContains } from "../src/vers/index.js";

const CMAKE_ORG = /^https:\/\/cmake\.org\/cmake\/help\/latest\//;

async function rules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/cpp.json", "utf8"))).rules;
}

test("the C and C++ registry has five valid rules, each citing cmake.org", async () => {
  const all = await rules();
  assert.equal(all.length, 5);
  for (const rule of all) {
    assert.ok(rule.sources.every((source) => source.url.startsWith("https://")), rule.id);
    assert.ok(rule.sources.every((source) => CMAKE_ORG.test(source.url)), `${rule.id} cites cmake.org docs`);
  }
});

test("the cmake_minimum_required policy rules cover below 3.5 and the 3.5–3.10 deprecation band", async () => {
  const all = await rules();
  const removed = all.find((rule) => rule.id === "cpp.cmake.policy-below-3.5.removed")!;
  const deprecated = all.find((rule) => rule.id === "cpp.cmake.policy-below-3.10.deprecated")!;
  assert.equal(removed.event, "removed");
  assert.equal(removed.deadline, "2025-03-27");
  assert.equal(deprecated.event, "deprecated");
  assert.equal(deprecated.deadline, "2024-11-06");
  for (const [version, hit] of [
    ["2.8.12", "removed"],
    ["3.4.3", "removed"],
    ["3.5.0", "deprecated"],
    ["3.9.6", "deprecated"],
    ["3.10.0", undefined],
    ["3.16.0", undefined],
    ["4.0.0", undefined],
  ] as const) {
    const match = all.filter((rule) => rule.purl === "pkg:generic/cmake" && versContains(rule.vers, version)).map((rule) =>
      rule.id.includes("removed") ? "removed" : "deprecated",
    );
    assert.deepEqual(match, hit === undefined ? [] : [hit], version);
  }
});

test("the generator and module rules match any version of their generic PURL", async () => {
  const targets = [
    ["cpp.cmake.generator.visual-studio-12-2013.removed", "pkg:generic/cmake-generator/visual-studio-12-2013", "removed"],
    ["cpp.cmake.module.find-gdal.deprecated", "pkg:generic/cmake-module/find-gdal", "deprecated"],
    ["cpp.cmake.module.cmake-find-frameworks.deprecated", "pkg:generic/cmake-module/cmake-find-frameworks", "deprecated"],
  ] as const;
  const all = await rules();
  for (const [id, purl, event] of targets) {
    const rule = all.find((candidate) => candidate.id === id)!;
    assert.equal(rule.purl, purl);
    assert.equal(rule.event, event);
    assert.ok(versContains(rule.vers, "0.0.1") && versContains(rule.vers, "99.0.0"), id);
  }
});

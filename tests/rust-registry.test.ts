import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { validateRegistryV2 } from "../src/registry.js";
import { versContains } from "../src/vers/index.js";

async function rules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/rust.json", "utf8"))).rules;
}

test("the Rust registry has five valid rules, each citing an authoritative source", async () => {
  const all = await rules();
  assert.equal(all.length, 5);
  for (const rule of all) {
    assert.ok(rule.sources.every((source) => source.url.startsWith("https://")), rule.id);
    assert.ok(rule.sources.some((source) => /^https:\/\/(?:rustsec\.org\/advisories\/RUSTSEC-\d{4}-\d{4}\.html|www\.rust-lang\.org\/policies\/security)$/.test(source.url)), `${rule.id} cites RustSec or the Rust policy`);
  }
});

test("the toolchain rule covers every release below the newest stable and nothing at or above it", async () => {
  const toolchain = (await rules()).find((rule) => rule.purl === "pkg:generic/rust")!;
  assert.equal(toolchain.event, "end-of-support");
  assert.equal(toolchain.deadline, "2026-10-01");
  for (const [version, affected] of [["1.0.0", true], ["1.70.0", true], ["1.98.1", true], ["1.99.0", false], ["1.99.1", false], ["1.100.0", false]] as const) {
    assert.equal(versContains(toolchain.vers, version), affected, version);
  }
  const registry = JSON.parse(await readFile("registry/rust.json", "utf8")) as { freshness: { maxReviewAgeDays: number } };
  assert.equal(registry.freshness.maxReviewAgeDays, 45, "a moving rule needs a short review window");
});

test("the crate rules match any version of the crate and no other crate", async () => {
  const crates = (await rules()).filter((rule) => rule.purl.startsWith("pkg:cargo/"));
  assert.deepEqual(crates.map((rule) => rule.purl).sort(), ["pkg:cargo/ansi_term", "pkg:cargo/atty", "pkg:cargo/failure", "pkg:cargo/tempdir"]);
  for (const rule of crates) {
    assert.equal(rule.event, "deprecated");
    assert.ok(versContains(rule.vers, "0.0.1") && versContains(rule.vers, "99.0.0"), rule.id);
  }
});

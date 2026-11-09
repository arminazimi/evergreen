import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { test, after } from "node:test";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine/index.js";
import { legacyRule, registryV2Issues } from "@velella/ebb/registry";
import type { RegistryV2 } from "@velella/ebb/registry";

import { copyFixtureTree } from "./fixture-copies.js";

const fixtureRoots: string[] = [];
const equivalenceFixture = await copyFixtureTree(resolve("tests/fixtures/registry-equivalence"), fixtureRoots);
after(async () => {
  await Promise.all(fixtureRoots.map((root) => rm(root, { recursive: true, force: true })));
});

// Registries were migrated from v1 to v2 without changing what detectors see. These tests keep that true.

test("scanning the equivalence fixture reports every bundled rule exactly as before the v2 migration", async () => {
  const root = equivalenceFixture;
  const result = await scanRepository(root, builtInDetectors);
  // `data` and `coverage` describe the environment around the rules, not the findings the registries produce.
  const {
    root: _root,
    scannedAt: _scannedAt,
    unclassified: _unclassified,
    data: _data,
    coverage: _coverage,
    ...stable
  } = result;
  // Node.js runtime finding ids embed the scanned folder's absolute path, so compare with it masked.
  const masked = JSON.parse(JSON.stringify(stable).split(root).join("<root>"));
  const expected = JSON.parse(await readFile(resolve("tests/fixtures/registry-equivalence.expected.json"), "utf8"));
  assert.deepEqual(masked, expected);
  assert.equal(new Set(stable.findings.map((finding) => finding.ruleId)).size, 17);
});

test("each migrated registry reads back as the v1 rules it replaced", async () => {
  const snapshots = (await readdir(resolve("tests/fixtures/registry-v1"))).filter((name) => name.endsWith(".json"));
  assert.ok(snapshots.length > 0);
  for (const name of snapshots) {
    const v1 = JSON.parse(await readFile(resolve("tests/fixtures/registry-v1", name), "utf8")) as { rules: unknown[] };
    const v2 = JSON.parse(await readFile(resolve("node_modules/@velella/ebb/registry", name), "utf8")) as RegistryV2;
    assert.equal(v2.schemaVersion, "ebb.registry.v2", `${name} is migrated`);
    assert.deepEqual(registryV2Issues(v2), [], name);
    const views = v2.rules.slice(0, v1.rules.length).map((rule) => {
      const view = legacyRule(rule);
      // v2 adds when each source was retrieved; that evidence is not part of the v1 rule shape.
      return { ...view, sources: rule.sources.map(({ accessedAt: _accessedAt, ...source }) => source) };
    });
    assert.deepEqual(views, v1.rules, name);
  }
});

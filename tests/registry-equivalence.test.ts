import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { legacyRule, registryV2Issues } from "../src/registry.js";
import type { RegistryV2 } from "../src/registry.js";

// Registries were migrated from v1 to v2 without changing what detectors see. These tests keep that true.

test("scanning the equivalence fixture reports every bundled rule exactly as before the v2 migration", async () => {
  const root = resolve("tests/fixtures/registry-equivalence");
  const result = await scanRepository(root, builtInDetectors);
  const { root: _root, scannedAt: _scannedAt, unclassified: _unclassified, ...stable } = result;
  // Node.js runtime finding ids embed the scanned folder's absolute path, so compare with it masked.
  const masked = JSON.parse(JSON.stringify(stable).split(root).join("<root>"));
  const expected = JSON.parse(await readFile(resolve("tests/fixtures/registry-equivalence.expected.json"), "utf8"));
  assert.deepEqual(masked, expected);
  assert.equal(new Set(stable.findings.map((finding) => finding.ruleId)).size, 15);
});

test("each migrated registry reads back as the v1 rules it replaced", async () => {
  const snapshots = (await readdir(resolve("tests/fixtures/registry-v1"))).filter((name) => name.endsWith(".json"));
  assert.ok(snapshots.length > 0);
  for (const name of snapshots) {
    const v1 = JSON.parse(await readFile(resolve("tests/fixtures/registry-v1", name), "utf8")) as { rules: unknown[] };
    const v2 = JSON.parse(await readFile(resolve("registry", name), "utf8")) as RegistryV2;
    assert.equal(v2.schemaVersion, "evergreen.registry.v2", `${name} is migrated`);
    assert.deepEqual(registryV2Issues(v2), [], name);
    assert.deepEqual(v2.rules.map(legacyRule), v1.rules, name);
  }
});

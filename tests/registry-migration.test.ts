import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { isDeprecationRule, isMigrationGuidance } from "../src/sdk.js";

const registryPaths = [
  "registry/github-actions.json",
  "registry/nodejs.json",
  "registry/npm.json",
  "registry/python.json",
];

test("every built-in rule provides valid, agent-ready migration guidance", async () => {
  let ruleCount = 0;

  for (const registryPath of registryPaths) {
    const registry = JSON.parse(await readFile(resolve(registryPath), "utf8")) as {
      rules: unknown[];
    };

    assert.ok(Array.isArray(registry.rules), `${registryPath} must contain rules`);
    for (const rule of registry.rules) {
      assert.ok(isDeprecationRule(rule), `${registryPath} contains an invalid rule`);
      assert.ok(rule.migration, `${rule.id} is missing migration guidance`);
      assert.ok(isMigrationGuidance(rule.migration), `${rule.id} has invalid migration guidance`);
      ruleCount += 1;
    }
  }

  assert.ok(ruleCount >= registryPaths.length, "the bundled registries contain reviewed rules");
});

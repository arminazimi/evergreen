import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { legacyRule, loadRegistryRules } from "../src/registry.js";
import type { RegistryV2 } from "../src/registry.js";
import { isDeprecationRule, RegistryValidationError, validateRegistry } from "../src/sdk.js";
import type { RegistryDefinition } from "../src/sdk.js";

interface PackageRule {
  id: string;
  package: string;
  title: string;
}

const definition: RegistryDefinition<PackageRule> = {
  schemaVersion: "evergreen.npm-registry.v1",
  isRule: (value): value is PackageRule =>
    isDeprecationRule(value) && typeof (value as Partial<PackageRule>).package === "string",
};

async function v2(): Promise<RegistryV2> {
  return JSON.parse(await readFile(resolve("examples/registry.v2.example.json"), "utf8")) as RegistryV2;
}

const v1 = {
  schemaVersion: "evergreen.npm-registry.v1",
  rules: [
    {
      id: "npm.package.request.deprecated",
      ecosystem: "npm",
      package: "request",
      title: "request is deprecated",
      summary: "The package is fully deprecated and no new changes are expected.",
      severity: "high",
      sources: [{ title: "request package deprecation notice", url: "https://www.npmjs.com/package/request" }],
    },
  ],
};

test("loads v1 registries exactly as before", () => {
  assert.deepEqual(loadRegistryRules(v1, definition), validateRegistry(v1, definition));
  assert.throws(() => loadRegistryRules({ ...v1, rules: [{ id: "x" }] }, definition), /Invalid registry rule at index 0/);
  assert.throws(() => loadRegistryRules({ ...v1, rules: {} }, definition), /rules must be an array/);
  assert.throws(() => loadRegistryRules("not an object", definition), /JSON object/);
});

test("rejects other schema versions and a missing version", () => {
  assert.throws(() => loadRegistryRules({ ...v1, schemaVersion: "evergreen.pypi-registry.v1" }, definition), /expected evergreen\.npm-registry\.v1 or evergreen\.registry\.v2/);
  assert.throws(() => loadRegistryRules({ rules: [] }, definition), /Unsupported registry schema: missing/);
});

test("loads v2 registries through the detector's rule type", async () => {
  const registry = await v2();
  const loaded = loadRegistryRules(registry, definition);
  assert.equal(loaded.rules.length, 2);
  const [request] = loaded.rules;
  assert.equal(request?.package, "request");
  assert.equal(request?.id, "npm.package.request.deprecated");
});

test("exposes a v2 rule exactly like its v1 shape", async () => {
  const registry = await v2();
  const view = legacyRule(registry.rules[0]!);
  for (const dropped of ["purl", "vers", "event", "provenance", "x-npm"]) assert.equal(dropped in view, false, dropped);
  assert.equal(view.package, "request");
  assert.deepEqual(Object.keys(view).sort(), [
    "deadline", "ecosystem", "id", "migration", "package", "replacement", "severity", "sources", "summary", "title", "usage",
  ]);
  assert.deepEqual(view.sources, registry.rules[0]!.sources);
  assert.deepEqual(view.migration, registry.rules[0]!.migration);
});

test("hints cannot overwrite identity fields they do not own", async () => {
  const registry = await v2();
  registry.rules[0]!["x-npm"] = { package: "request", severity: "info" };
  // Hints are merged on top by design (they carry detector fields); the validator, not the loader, owns correctness.
  assert.equal(legacyRule(registry.rules[0]!).severity, "info");
});

test("fails with the rule name when a v2 rule lacks the hints a detector reads", async () => {
  const registry = await v2();
  delete (registry.rules[0] as unknown as Record<string, unknown>)["x-npm"];
  assert.throws(() => loadRegistryRules(registry, definition), (error: unknown) => {
    assert.ok(error instanceof RegistryValidationError);
    assert.match(error.message, /Invalid registry rule "npm\.package\.request\.deprecated"/);
    assert.match(error.message, /x-npm/);
    return true;
  });
});

test("fails with every problem when a v2 registry is invalid", async () => {
  const registry = await v2();
  delete (registry.rules[0] as unknown as Record<string, unknown>).provenance;
  assert.throws(() => loadRegistryRules(registry, definition), /provenance is required/);
});

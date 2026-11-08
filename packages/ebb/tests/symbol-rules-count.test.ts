import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

// Compiled to dist/tests/, two levels below the package root.
const packageRoot = join(import.meta.dirname, "..", "..");

test("the registries carry at least 100 symbol-level rules, every one unique and sourced", async () => {
  let total = 0;
  const ids = new Set<string>();
  for (const name of await readdir(join(packageRoot, "registry"))) {
    if (!name.endsWith(".json") || name === "sources.lock.json") continue;
    const registry = JSON.parse(await readFile(join(packageRoot, "registry", name), "utf8")) as {
      rules?: { id: string; event: string; sources: unknown[]; usage?: { kind: string }[] }[];
    };
    for (const rule of registry.rules ?? []) {
      if (!rule.usage?.some((matcher) => matcher.kind === "symbol")) continue;
      total += 1;
      assert.ok(!ids.has(rule.id), `${rule.id} is unique`);
      ids.add(rule.id);
      assert.ok(rule.sources.length > 0, `${rule.id} has a source`);
    }
  }
  assert.ok(total >= 100, `found ${total} symbol-level rules`);
});

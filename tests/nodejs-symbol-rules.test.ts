import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import type { SymbolUsageMatcher } from "../src/domain.js";
import { registryV2Issues, type RegistryV2Rule } from "../src/registry.js";

const root = join(import.meta.dirname, "..", "..");
const prefix = "nodejs.symbol.";

async function symbolRules(): Promise<(RegistryV2Rule & { usage: SymbolUsageMatcher[] })[]> {
  const registry = JSON.parse(await readFile(join(root, "registry", "nodejs.json"), "utf8")) as { rules: (RegistryV2Rule & { usage?: SymbolUsageMatcher[] })[] };
  assert.deepEqual(registryV2Issues(registry), []);
  return registry.rules.filter((rule) => rule.id.startsWith(prefix)) as (RegistryV2Rule & { usage: SymbolUsageMatcher[] })[];
}

test("the Node.js registry carries ten symbol-level rules with official evidence", async () => {
  const rules = await symbolRules();
  assert.equal(rules.length, 10);
  for (const rule of rules) {
    assert.ok(rule.replacement, `${rule.id} names a replacement`);
    assert.ok(rule.sources.every((source) => source.url.startsWith("https://nodejs.org/")), `${rule.id} cites nodejs.org`);
    assert.ok(rule.usage.length > 0 && rule.usage.every((matcher) => matcher.kind === "symbol"), `${rule.id} has only symbol entries`);
    for (const language of ["javascript", "typescript"]) {
      assert.ok(rule.usage.some((matcher) => matcher.language === language), `${rule.id} covers ${language}`);
    }
  }
});

test("each symbol rule has a fixture that marks what is reported and what is not", async () => {
  for (const rule of await symbolRules()) {
    const fixture = await readFile(join(root, "tests", "fixtures", "symbol-rules", "nodejs", `${rule.id.slice(prefix.length)}.js`), "utf8");
    const reported = fixture.split("\n").filter((line) => line.includes("// reported:"));
    const ignored = fixture.split("\n").filter((line) => line.includes("// not reported:"));
    assert.ok(reported.length > 0, `${rule.id} fixture has reported usages`);
    assert.ok(ignored.length > 0, `${rule.id} fixture has lookalikes`);
    for (const matcher of rule.usage) {
      const name = matcher.symbol.split(".").pop()!;
      assert.ok(reported.some((line) => line.includes(name)), `${rule.id} fixture reports ${matcher.symbol}`);
    }
  }
});

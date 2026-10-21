import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import type { SymbolUsageMatcher } from "../src/domain.js";
import { analyzeJavaScriptFile } from "../src/usage/javascript.js";
import { registryV2Issues, type RegistryV2Rule } from "../src/registry.js";

const root = join(import.meta.dirname, "..", "..");
const prefix = "nodejs.symbol.";

async function symbolRules(): Promise<(RegistryV2Rule & { usage: SymbolUsageMatcher[] })[]> {
  const registry = JSON.parse(await readFile(join(root, "registry", "nodejs.json"), "utf8")) as { rules: (RegistryV2Rule & { usage?: SymbolUsageMatcher[] })[] };
  assert.deepEqual(registryV2Issues(registry), []);
  return registry.rules.filter((rule) => rule.id.startsWith(prefix)) as (RegistryV2Rule & { usage: SymbolUsageMatcher[] })[];
}

test("the Node.js registry carries 72 symbol-level rules with official evidence", async () => {
  const rules = await symbolRules();
  assert.equal(rules.length, 72);
  for (const rule of rules) {
    assert.ok(rule.sources.every((source) => source.url.startsWith("https://nodejs.org/")), `${rule.id} cites nodejs.org`);
    assert.ok(rule.usage.length > 0 && rule.usage.every((matcher) => matcher.kind === "symbol"), `${rule.id} has only symbol entries`);
    for (const language of ["javascript", "typescript"]) {
      assert.ok(rule.usage.some((matcher) => matcher.language === language), `${rule.id} covers ${language}`);
    }
  }
});

test("each symbol rule reports exactly the usages its fixture marks", async () => {
  for (const rule of await symbolRules()) {
    const path = `${rule.id.slice(prefix.length)}.js`;
    const fixture = await readFile(join(root, "tests", "fixtures", "symbol-rules", "nodejs", path), "utf8");
    const lines = fixture.split("\n");
    const marked = lines.flatMap((line, index) => (line.includes("// reported:") ? [index + 1] : []));
    assert.ok(marked.length > 0, `${rule.id} fixture has reported usages`);
    assert.ok(lines.some((line) => line.includes("// not reported:")), `${rule.id} fixture has lookalikes`);
    const matchers = rule.usage.filter((matcher) => matcher.language === "javascript");
    assert.ok(matchers.length > 0, `${rule.id} covers JavaScript`);
    const result = await analyzeJavaScriptFile({ path, language: "javascript", source: fixture }, [{ id: rule.id, matchers }]);
    assert.ok(result, `${rule.id} fixture parsed`);
    const found = [...new Set(result.get(rule.id)!.map((usage) => usage.location.line ?? 0))].sort((left, right) => left - right);
    assert.deepEqual(found, marked, `${rule.id} reports the marked lines`);
  }
});

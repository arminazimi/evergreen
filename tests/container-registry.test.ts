import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { validateRegistryV2 } from "../src/registry.js";
import { versContains } from "../src/vers.js";

async function rules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/container.json", "utf8"))).rules;
}

test("container registry has sixteen valid rules with vendor sources", async () => {
  const all = await rules();
  assert.equal(all.length, 16);
  for (const rule of all) {
    assert.match(rule.purl, /^pkg:docker\/library\//);
    assert.ok(rule.sources.every((source) => source.url.startsWith("https://")));
    assert.ok(!rule.sources.some((source) => /endoflife\.date/.test(source.url)), `${rule.id} cites an aggregator`);
  }
});

test("release lines fall on the right side of each range", async () => {
  const byPurl = new Map((await rules()).map((rule) => [rule.purl.split("/").pop(), rule.vers]));
  const cases: Array<[string, string, boolean]> = [
    ["node", "18.0.0", true],
    ["node", "20.0.0", true],
    ["node", "21.0.0", true],
    ["node", "22.0.0", false],
    ["python", "3.9.0", true],
    ["python", "3.10.0", true],
    ["python", "3.11.0", false],
    ["postgres", "11.0.0", true],
    ["postgres", "13.0.0", true],
    ["postgres", "14.0.0", false],
    ["mysql", "5.7.0", true],
    ["mysql", "8.0.0", true],
    ["mysql", "8.4.0", false],
    ["ruby", "3.2.0", true],
    ["ruby", "3.3.0", false],
  ];
  for (const [name, version, affected] of cases) {
    assert.equal(versContains(byPurl.get(name)!, version), affected, `${name} ${version}`);
  }
});

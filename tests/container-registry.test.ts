import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { validateRegistryV2 } from "../src/registry.js";
import { versContains } from "../src/vers.js";

async function rules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/container.json", "utf8"))).rules;
}

test("container registry has twenty-four valid rules with vendor sources", async () => {
  const all = await rules();
  assert.equal(all.length, 24);
  for (const rule of all) {
    assert.match(rule.purl, /^pkg:docker\/library\//);
    assert.ok(rule.sources.every((source) => source.url.startsWith("https://")));
    assert.ok(!rule.sources.some((source) => /endoflife\.date/.test(source.url)), `${rule.id} cites an aggregator`);
  }
});

test("release lines fall on the right side of each range", async () => {
  const byPurl = new Map((await rules()).filter((rule) => rule.event !== "scheduled-end-of-life").map((rule) => [rule.purl.split("/").pop(), rule.vers]));
  const cases: Array<[string, string, boolean]> = [
    ["node", "18.0.0", true],
    ["node", "20.0.0", true],
    ["node", "21.0.0", true],
    ["node", "22.0.0", false],
    ["python", "3.9.0", true],
    ["python", "3.10.0", true],
    ["python", "3.11.0", false],
    ["debian", "10.0.0", true],
    ["debian", "11.0.0", true],
    ["debian", "12.0.0", false],
    ["alpine", "3.17.0", true],
    ["alpine", "3.20.0", true],
    ["alpine", "3.21.0", false],
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

test("a scheduled image line is a low-severity rule for exactly that line", async () => {
  const scheduled = (await rules()).filter((rule) => rule.event === "scheduled-end-of-life");
  assert.deepEqual(scheduled.map((rule) => [rule.id, rule.vers, rule.severity, rule.deadline]), [
    ["container.node.eol-22-and-older", "vers:semver/>=22.0.0|<23.0.0", "low", "2027-04-30"],
    ["container.postgres.eol-14-and-older", "vers:semver/>=14.0.0|<15.0.0", "low", "2026-11-12"],
    ["container.redis.eol-6.2-and-older", "vers:semver/>=6.2.0|<6.3.0", "low", "2027-04-01"],
    ["container.ubuntu.eol-22.04", "vers:semver/>=22.0.0|<22.10.0", "low", "2027-06-01"],
    ["container.alpine.eol-3.21", "vers:semver/>=3.21.0|<3.22.0", "low", "2026-11-01"],
  ]);
  for (const [rule, version, affected] of [["container.node.eol-22-and-older", "22.4.0", true], ["container.node.eol-22-and-older", "21.9.0", false], ["container.node.eol-22-and-older", "24.0.0", false], ["container.postgres.eol-14-and-older", "14.5.0", true], ["container.postgres.eol-14-and-older", "15.0.0", false], ["container.postgres.eol-14-and-older", "13.9.0", false], ["container.redis.eol-6.2-and-older", "6.2.0", true], ["container.redis.eol-6.2-and-older", "6.2.7", true], ["container.redis.eol-6.2-and-older", "6.3.0", false], ["container.redis.eol-6.2-and-older", "6.1.9", false]] as const) {
    assert.equal(versContains(scheduled.find((item) => item.id === rule)!.vers, version), affected, `${rule} ${version}`);
  }
});

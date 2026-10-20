import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { jdkRuleVersion } from "../src/detectors/java/jdk-version.js";
import { validateRegistryV2 } from "../src/registry.js";
import { versContains } from "../src/vers/index.js";

async function allRules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/java.json", "utf8"))).rules;
}

/** The JDK end-of-support rules; the Maven relocation rules are checked separately. */
async function rules() {
  return (await allRules()).filter((rule) => rule.id.startsWith("java.jdk."));
}

const ORACLE = "https://www.oracle.com/java/technologies/java-se-support-roadmap.html";
const TEMURIN = "https://adoptium.net/support/";

test("java registry has five valid end-of-support rules that cite the Oracle roadmap", async () => {
  const all = await rules();
  assert.equal(all.length, 5);
  for (const rule of all) {
    assert.equal(rule.purl, "pkg:generic/java");
    assert.equal(rule.event, "end-of-support");
    assert.ok(rule.sources.some((source) => source.url === ORACLE), `${rule.id} does not cite the Oracle roadmap`);
    assert.ok(rule.sources.every((source) => [ORACLE, TEMURIN].includes(source.url)), `${rule.id} cites another source`);
    assert.equal(rule.deadline, undefined, `${rule.id}: the sources give a month, not a day`);
  }
});

test("rules that mention Temurin cite its support page", async () => {
  for (const rule of await rules()) {
    assert.equal(/Temurin/.test(rule.summary), rule.sources.some((source) => source.url === TEMURIN), rule.id);
  }
});

test("only non-LTS feature releases fall inside a range; LTS releases never do", async () => {
  const ranges = (await rules()).map((rule) => rule.vers);
  const affected = (major: number) => ranges.some((range) => versContains(range, jdkRuleVersion(major)));
  for (const major of [9, 10, 12, 13, 14, 15, 16, 18, 19, 20, 22, 23, 24, 26]) assert.equal(affected(major), true, `Java ${major}`);
  for (const major of [8, 11, 17, 21, 25, 27, 28, 29]) assert.equal(affected(major), false, `Java ${major}`);
});

test("relocation rules name Maven coordinates and cite the artifact's own POM", async () => {
  const relocations = (await allRules()).filter((rule) => rule.id.startsWith("java.maven."));
  assert.deepEqual(relocations.map((rule) => rule.purl), ["pkg:maven/mysql/mysql-connector-java", "pkg:maven/org.slf4j/slf4j-log4j12", "pkg:maven/org.hibernate/hibernate-entitymanager"]);
  for (const rule of relocations) {
    assert.equal(rule.event, "deprecated");
    assert.ok(rule.replacement, rule.id);
    assert.match(rule.sources[0]!.url, /^https:\/\/repo1\.maven\.org\/maven2\/.+\.pom$/, rule.id);
    assert.ok(rule.vers.startsWith("vers:maven/>="), rule.id);
  }
  const mysql = relocations[0]!;
  assert.equal(versContains(mysql.vers, "8.0.33"), true);
  assert.equal(versContains(mysql.vers, "8.0.28"), false);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { ORACLE_ROADMAP_URL, TEMURIN_SUPPORT_URL, javaJdkSupportImporter } from "../../tools/importers/java-1.js";
import { execute, runImporter } from "../../tools/importers/run.js";

const recording = resolve("tests/importers/recordings/java-1.json");

test("drafts one rule per ended non-LTS group from the real recordings", async () => {
  const drafts = await execute(javaJdkSupportImporter, { replay: recording });
  assert.deepEqual(drafts.rules.map((rule) => rule.id), [
    "java.jdk.end-of-support-12-16",
    "java.jdk.end-of-support-18-20",
    "java.jdk.end-of-support-22-24",
    "java.jdk.end-of-support-26",
    "java.jdk.end-of-support-9-10",
  ]);
  assert.ok(drafts.rules.every((rule) => rule.event === "end-of-support" && rule.deadline === undefined));
  assert.ok(drafts.rules.every((rule) => rule.provenance.importer === "java-1" && rule.provenance.observedAt === "2026-10-17"));
  assert.deepEqual(drafts.notes, ["Long-term-support releases are not drafted: Java 8, 11, 17, 21, and 25 stay in Premier or Extended Support."]);
});

test("recorded drafts match the reviewed Java registry", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/java.json"), "utf8")) as RegistryV2;
  const diff = diffDrafts(await execute(javaJdkSupportImporter, { replay: recording }), registry);
  assert.deepEqual([diff.added, diff.changed, diff.removed], [[], [], []]);
});

const ORACLE = (rows: string) =>
  `<table><tr><th>Release GA Date Premier Support Until Extended Support Until Sustaining Support</th></tr>${rows}</table>`;
const ROWS =
  "<tr><td>11 (LTS)</td><td>September 2018</td><td>September 2023</td><td>January 2032</td><td>Indefinite</td></tr>" +
  "<tr><td>12 - 16 (non-LTS)</td><td>March 2019 - March 2021</td><td>September 2019 - September 2021</td><td>Not Available</td></tr>" +
  "<tr><td>26 (non-LTS)</td><td>March 2026</td><td>September 2026</td><td>Not Available</td></tr>" +
  "<tr><td>27 (non-LTS)***</td><td>September 2026</td><td>March 2027</td><td>Not Available</td></tr>";
const TEMURIN = "<p>Java 16 Mar 2021 Jul 2021 jdk-16.0.2+7 EOSL [2] Sep 2021</p>";

function java(oracle: string, temurin: string, now: string) {
  return runImporter(javaJdkSupportImporter, {
    now: new Date(now),
    async fetchText(url) {
      if (url === ORACLE_ROADMAP_URL) return oracle;
      assert.equal(url, TEMURIN_SUPPORT_URL);
      return temurin;
    },
  });
}

test("time decides which groups have ended", async () => {
  const later = await java(ORACLE(ROWS), TEMURIN, "2026-10-17T12:00:00Z");
  assert.deepEqual(later.rules.map((rule) => rule.id), ["java.jdk.end-of-support-12-16", "java.jdk.end-of-support-26"]);
  const earlier = await java(ORACLE(ROWS), TEMURIN, "2026-09-15T12:00:00Z");
  assert.deepEqual(earlier.rules.map((rule) => rule.id), ["java.jdk.end-of-support-12-16"]);
});

test("a group Temurin does not list cites only the Oracle roadmap", async () => {
  const result = await java(ORACLE(ROWS), TEMURIN, "2026-10-17T12:00:00Z");
  const [sixteen, twentySix] = result.rules;
  assert.deepEqual(sixteen!.sources.map((source) => source.url), [ORACLE_ROADMAP_URL, TEMURIN_SUPPORT_URL]);
  assert.deepEqual(twentySix!.sources.map((source) => source.url), [ORACLE_ROADMAP_URL]);
  assert.doesNotMatch(twentySix!.summary, /Temurin/);
});

test("a changed table header produces a review note, not rules", async () => {
  const result = await java("<table><tr><th>Release Premier Support Until GA Date</th></tr></table>", TEMURIN, "2026-10-17T12:00:00Z");
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, ["No usable support table was found in the Oracle Java SE roadmap."]);
});

test("without Temurin EOSL rows the drafts cite only Oracle and say so", async () => {
  const result = await java(ORACLE(ROWS), "<p>Nothing here</p>", "2026-10-17T12:00:00Z");
  assert.ok(result.rules.every((rule) => rule.sources.length === 1));
  assert.match(result.notes.at(-1)!, /No EOSL rows were found on the Temurin support page/);
});

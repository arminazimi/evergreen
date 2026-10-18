import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { MAVEN_CENTRAL, mavenRelocationImporter, metadataUrl, pomUrl } from "../../tools/importers/java-2.js";
import { MAVEN_CANDIDATES } from "../../tools/importers/maven-candidates.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import { ImporterError } from "../../tools/importers/types.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/java-2.json");

test("drafts relocation rules from the real recording", async () => {
  const drafts = await execute(mavenRelocationImporter, { replay: recording });
  assert.deepEqual(drafts.rules.map((rule) => [rule.id, rule.vers, rule.replacement]), [
    ["java.maven.mysql.mysql-connector-java.relocated", "vers:maven/>=8.0.31", "com.mysql:mysql-connector-j"],
    ["java.maven.org.hibernate.hibernate-entitymanager.relocated", "vers:maven/>=6.0.0.Alpha3", "org.hibernate.orm:hibernate-entitymanager"],
    ["java.maven.org.slf4j.slf4j-log4j12.relocated", "vers:maven/>=2.0.13", "org.slf4j:slf4j-reload4j"],
  ]);
  assert.ok(drafts.rules.every((rule) => rule.provenance.importer === "java-2" && rule.provenance.observedAt === "2026-10-17"));
  assert.deepEqual(drafts.notes, ["xml-apis:xml-apis was skipped: its relocation keeps the same coordinates and only changes the version."]);
  assert.match(drafts.rules[0]!.summary, /Its message says: "MySQL Connector\/J artifacts moved/);
});

test("reviewed rules match their drafts; the rest are left for review", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/java.json"), "utf8")) as RegistryV2;
  const diff = diffDrafts(await execute(mavenRelocationImporter, { replay: recording }), registry);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.added.map((rule) => rule.id), ["java.maven.org.hibernate.hibernate-entitymanager.relocated"]);
});

test("the candidate list is sorted and holds Maven coordinates", () => {
  assert.deepEqual([...MAVEN_CANDIDATES], [...MAVEN_CANDIDATES].sort());
  for (const candidate of MAVEN_CANDIDATES) assert.match(candidate, /^[a-z0-9._-]+:[a-z0-9._-]+$/);
});

const pom = (relocation: string) => `<project><distributionManagement>${relocation}</distributionManagement></project>`;
const metadata = (versions: string[], release = versions.at(-1)!) =>
  `<metadata><versioning><release>${release}</release><versions>${versions.map((version) => `<version>${version}</version>`).join("")}</versions></versioning></metadata>`;

function context(files: Record<string, string | Error>): ImporterContext {
  return {
    now: new Date("2026-10-17T12:00:00Z"),
    async fetchText(url) {
      const value = files[url];
      if (value instanceof Error) throw value;
      if (value === undefined) throw new ImporterError(`GET ${url} failed: HTTP 404`);
      return value;
    },
  };
}

test("walks down from the newest version and stops where the relocation ends", async () => {
  const relocation = "<relocation><groupId>new.group</groupId><artifactId>new-art</artifactId></relocation>";
  const files: Record<string, string> = {};
  for (const candidate of MAVEN_CANDIDATES) {
    const [group, artifact] = candidate.split(":") as [string, string];
    files[metadataUrl(group, artifact)] = metadata(["1.0", "2.0", "3.0"]);
    files[pomUrl(group, artifact, "3.0")] = pom(relocation);
    files[pomUrl(group, artifact, "2.0")] = pom(relocation);
    files[pomUrl(group, artifact, "1.0")] = pom("");
  }
  const result = await runImporter(mavenRelocationImporter, context(files));
  assert.equal(result.rules.length, MAVEN_CANDIDATES.length);
  assert.ok(result.rules.every((rule) => rule.vers === "vers:maven/>=2.0" && rule.replacement === "new.group:new-art"));
  assert.ok(result.rules.every((rule) => rule.sources[0]!.url.endsWith("/3.0/" + rule.sources[0]!.url.split("/").at(-3) + "-3.0.pom")));
});

test("a candidate with no relocation or no metadata is a note, not a rule", async () => {
  const files: Record<string, string> = {};
  const [first, ...rest] = MAVEN_CANDIDATES;
  const [group, artifact] = first!.split(":") as [string, string];
  files[metadataUrl(group, artifact)] = metadata(["1.0"]);
  files[pomUrl(group, artifact, "1.0")] = pom("");
  const result = await runImporter(mavenRelocationImporter, context(files));
  assert.deepEqual(result.rules, []);
  assert.equal(result.notes[0], `${first} 1.0 does not declare a relocation.`);
  assert.deepEqual(result.notes.slice(1), rest.map((candidate) => `${candidate} was not found on Maven Central.`));
});

test("a failure other than a missing file stops the run", async () => {
  const failing = context({});
  const broken: ImporterContext = {
    ...failing,
    async fetchText(url) {
      throw new ImporterError(`GET ${url} failed: HTTP 503`);
    },
  };
  await assert.rejects(runImporter(mavenRelocationImporter, broken), /HTTP 503/);
  assert.ok(MAVEN_CENTRAL.startsWith("https://"));
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { Ajv2020 } from "ajv/dist/2020.js";

import { BUNDLED_ECOSYSTEMS } from "../src/data-bundle.js";
import type { ActiveData } from "../src/data-source.js";
import { CLE_SCHEMA, exportActiveCle, exportCle } from "../src/export/cle.js";
import type { RegistryV2Rule } from "../src/registry.js";

const execute = promisify(execFile);
const rule: RegistryV2Rule = {
  id: "example.eol", ecosystem: "npm", purl: "pkg:npm/example", vers: "vers:npm/<2.0.0",
  event: "end-of-life", title: "Example EOL", summary: "No longer supported", severity: "high",
  deadline: "2026-01-01", sources: [{ title: "Policy", url: "https://example.com/policy" }],
  provenance: { observedAt: "2025-12-01", reviewedAt: "2026-02-01", reviewer: "test" },
};

// Unmodified upstream schema fetched from CLE_SCHEMA on 2026-10-27. Kept local so tests stay offline.
const schema = JSON.parse(await readFile(resolve("tests/fixtures/cle/cle-1.0.0.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addFormat("date-time", (value: string) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value)));
for (const format of ["uri", "iri"]) ajv.addFormat(format, (value: string) => URL.canParse(value));
const validate = ajv.compile(schema);

test("CLE snapshots group PURLs, preserve VERS, map supported events and validate against CLE 1.0", () => {
  const rules: RegistryV2Rule[] = [
    rule,
    { ...rule, id: "example.support", event: "end-of-support", provenance: { ...rule.provenance, observedAt: "2025-11-01" } },
    { ...rule, id: "example.scheduled", event: "scheduled-end-of-life", deadline: "2028-01-01" },
    { ...rule, id: "other.eol", purl: "pkg:npm/%40scope/other" },
  ];
  const result = exportCle(rules);
  assert.equal(result.skipped, 0);
  assert.equal(result.documents.length, 2);
  assert.deepEqual(result, exportCle([...rules].reverse()));
  for (const document of result.documents) assert.ok(validate(document), JSON.stringify(validate.errors));
  const document = result.documents.find((entry) => entry.identifier === rule.purl)!;
  assert.equal(document.$schema, CLE_SCHEMA);
  assert.equal(document.updatedAt, "2026-02-01T00:00:00Z");
  assert.deepEqual(document.events.map((event) => event.id), [3, 2, 1]);
  assert.deepEqual(document.events.map((event) => event.type), ["endOfLife", "endOfLife", "endOfSupport"]);
  assert.equal(document.events[0]!.effective, "2028-01-01T00:00:00Z");
  assert.equal(document.events[0]!.published, "2025-12-01T00:00:00Z");
  assert.deepEqual(document.events[0]!.versions, [{ range: rule.vers }]);
  assert.equal(document.events[2]!.supportId, document.definitions!.support[0]!.id);
  assert.equal(result.documents[0]!.definitions, undefined);
  assert.equal(rules[0], rule);
  const invalid = structuredClone(document);
  delete invalid.events[2]!.supportId;
  assert.equal(validate(invalid), false, "the real schema requires supportId for endOfSupport");
});

test("CLE omits unsupported claims and unknown dates instead of inventing lifecycle evidence", () => {
  const { deadline: _, ...undated } = rule;
  const result = exportCle([
    { ...rule, event: "deprecated" }, { ...rule, event: "removed" }, undated,
    { ...rule, usage: [{ kind: "symbol", language: "javascript", symbol: "oldApi", shape: "call" }] },
  ]);
  assert.deepEqual(result, { documents: [], skipped: 4 });
  assert.deepEqual(exportCle([]), { documents: [], skipped: 0 });
});

test("CLE reads every ecosystem from the supplied active data, including rules absent from check", async () => {
  const paths: string[] = [];
  const data = {
    async read(path: string) {
      paths.push(path);
      const ecosystem = path.slice("registry/".length, -".json".length);
      return { schemaVersion: "evergreen.registry.v2", ecosystem, rules: ecosystem === "rust" ? [{ ...rule, ecosystem, purl: "pkg:cargo/example", vers: "vers:cargo/<2.0.0" }] : [] };
    },
  } as ActiveData;
  const result = await exportActiveCle(data);
  assert.deepEqual(paths, BUNDLED_ECOSYSTEMS.map((ecosystem) => `registry/${ecosystem}.json`));
  assert.equal(result.documents[0]!.identifier, "pkg:cargo/example");
});

test("CLI exports only valid CLE documents, deterministically, with offline bundled data", async () => {
  const args = [resolve("dist/src/cli.js"), "export", "--format", "cle", "--data-version", "bundled"];
  const first = await execute(process.execPath, args);
  const second = await execute(process.execPath, args);
  assert.equal(first.stdout, second.stdout);
  assert.match(first.stderr, /Skipped \d+ rules/);
  const documents = first.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.ok(documents.length > 0);
  for (const document of documents) assert.ok(validate(document), JSON.stringify(validate.errors));
  assert.equal(new Set(documents.map((document) => document.identifier)).size, documents.length);
});

test("CLI rejects incomplete export options and CLE on other commands", async () => {
  for (const args of [
    ["export"], ["export", "--format"], ["export", "--format", "json"],
    ["export", "--format", "cle", "--json"], ["export", "--format", "cle", "unexpected"],
    ["scan", "--format", "cle"],
  ]) {
    await assert.rejects(execute(process.execPath, [resolve("dist/src/cli.js"), ...args]), (error: unknown) => {
      const failure = error as { code: number; stderr: string; stdout: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr, /Usage: evergreen export|Unknown format/);
      return true;
    });
  }
});

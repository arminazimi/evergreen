import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

const hex = (character: string) => character.repeat(64);

function bundle() {
  return {
    manifest: {
      schemaVersion: "evergreen.data-bundle.v1",
      version: "2026.10.16",
      createdAt: "2026-10-16T09:30:00Z",
      minimumEvergreenVersion: "0.2.0",
      contentDigest: `sha256:${hex("a")}`,
      files: [
        { path: "registry/npm.json", kind: "registry", ecosystem: "npm", schemaVersion: "evergreen.registry.v2", rules: 23, maxReviewAgeDays: 365, sha256: hex("b"), bytes: 41234 },
        { path: "registry/github-actions-shas.json", kind: "sha-map", sha256: hex("c"), bytes: 9000 },
      ],
    },
    files: {
      "registry/npm.json": { schemaVersion: "evergreen.registry.v2", ecosystem: "npm", rules: [] },
      "registry/github-actions-shas.json": { schemaVersion: "evergreen.github-actions-shas.v1", actions: {} },
    },
  };
}

async function validator() {
  const schema = JSON.parse(await readFile(resolve("schemas/data-bundle.v1.schema.json"), "utf8")) as object;
  return new Ajv2020({ allErrors: true }).compile(schema);
}

test("a well-formed bundle matches the schema", async () => {
  const validate = await validator();
  assert.equal(validate(bundle()), true, JSON.stringify(validate.errors));
  const sameDay = bundle();
  sameDay.manifest.version = "2026.10.16.2";
  assert.equal(validate(sameDay), true, "a second bundle on the same day takes a .N suffix");
});

test("the schema rejects each malformed field", async () => {
  const validate = await validator();
  const mutations: Array<[string, (value: ReturnType<typeof bundle>) => void]> = [
    ["wrong schemaVersion", (value) => { value.manifest.schemaVersion = "evergreen.data-bundle.v2"; }],
    ["version without a date", (value) => { value.manifest.version = "0.2.0"; }],
    ["impossible month", (value) => { value.manifest.version = "2026.13.01"; }],
    ["revision 0", (value) => { value.manifest.version = "2026.10.16.0"; }],
    ["createdAt with an offset", (value) => { value.manifest.createdAt = "2026-10-16T09:30:00+02:00"; }],
    ["createdAt that is only a date", (value) => { value.manifest.createdAt = "2026-10-16"; }],
    ["contentDigest without the prefix", (value) => { value.manifest.contentDigest = hex("a"); }],
    ["uppercase digest", (value) => { value.manifest.files[0]!.sha256 = hex("A"); }],
    ["short digest", (value) => { value.manifest.files[0]!.sha256 = "abc"; }],
    ["path outside registry/", (value) => { value.manifest.files[0]!.path = "src/npm.json"; }],
    ["path traversal", (value) => { value.manifest.files[0]!.path = "registry/../npm.json"; }],
    ["unknown file kind", (value) => { value.manifest.files[0]!.kind = "script"; }],
    ["registry without ecosystem", (value) => { delete (value.manifest.files[0] as Record<string, unknown>).ecosystem; }],
    ["registry without rule count", (value) => { delete (value.manifest.files[0] as Record<string, unknown>).rules; }],
    ["zero bytes", (value) => { value.manifest.files[0]!.bytes = 0; }],
    ["no files listed", (value) => { value.manifest.files = []; }],
    ["no file contents", (value) => { value.files = {} as never; }],
    ["file content under an invalid path", (value) => { (value.files as Record<string, unknown>)["../escape.json"] = {}; }],
    ["unknown top-level field", (value) => { (value as Record<string, unknown>).signature = "x"; }],
    ["unknown manifest field", (value) => { (value.manifest as Record<string, unknown>).channel = "stable"; }],
  ];
  for (const [name, mutate] of mutations) {
    const value = structuredClone(bundle());
    mutate(value);
    assert.equal(validate(value), false, name);
  }
});

test("the decision record describes the same format as the schema", async () => {
  const record = await readFile(resolve("docs/decisions/0006-data-bundle.md"), "utf8");
  const schema = JSON.parse(await readFile(resolve("schemas/data-bundle.v1.schema.json"), "utf8")) as { $defs: { manifest: { required: string[] } } };
  assert.match(record, /^Status: accepted$/m);
  assert.ok(record.includes("schemas/data-bundle.v1.schema.json"));
  for (const field of schema.$defs.manifest.required) assert.ok(record.includes(`"${field}"`) || record.includes(`\`${field}\``), `the record should explain ${field}`);
  for (const topic of ["Canonical form", "Content address", "Compatibility", "Trust", "Freshness and downgrade"]) assert.ok(record.includes(`**${topic}`), topic);
});

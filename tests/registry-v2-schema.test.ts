import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

async function exampleAndValidator() {
  const example = JSON.parse(await readFile(resolve("examples/registry.v2.example.json"), "utf8"));
  const schema = JSON.parse(await readFile(resolve("schemas/registry.v2.schema.json"), "utf8"));
  return { example, validate: new Ajv2020({ allErrors: true }).compile(schema) };
}

test("the v2 registry example matches the registry v2 JSON Schema", async () => {
  const { example, validate } = await exampleAndValidator();
  assert.ok(validate(example), JSON.stringify(validate.errors));
});

test("the registry v2 schema rejects incomplete or ambiguous rules", async (t) => {
  const { example, validate } = await exampleAndValidator();
  type Example = typeof example;
  for (const [name, mutate] of [
    ["wrong schema version", (value: Example) => { value.schemaVersion = "evergreen.npm-registry.v1"; }],
    ["missing purl", (value: Example) => { delete value.rules[0].purl; }],
    ["versioned purl", (value: Example) => { value.rules[0].purl = "pkg:npm/request@2.88.2"; }],
    ["purl without type", (value: Example) => { value.rules[0].purl = "request"; }],
    ["missing vers", (value: Example) => { delete value.rules[0].vers; }],
    ["vers without scheme", (value: Example) => { value.rules[0].vers = "<5.0.0"; }],
    ["unknown event", (value: Example) => { value.rules[0].event = "sunset"; }],
    ["no sources", (value: Example) => { value.rules[0].sources = []; }],
    ["non-https source", (value: Example) => { value.rules[0].sources[0].url = "http://example.com"; }],
    ["missing provenance", (value: Example) => { delete value.rules[0].provenance; }],
    ["missing reviewer", (value: Example) => { delete value.rules[0].provenance.reviewer; }],
    ["timestamp instead of date", (value: Example) => { value.rules[0].provenance.reviewedAt = "2026-10-13T00:00:00Z"; }],
    ["unknown top-level field", (value: Example) => { value.rules[0].package = "request"; }],
    ["malformed extension name", (value: Example) => { value.rules[1]["x-GitHub"] = {}; }],
    ["non-object extension", (value: Example) => { value.rules[1]["x-github-actions"] = 5; }],
    ["unknown usage kind", (value: Example) => { value.rules[0].usage[0].kind = "regex"; }],
    ["zero freshness window", (value: Example) => { value.freshness.maxReviewAgeDays = 0; }],
  ] as const) {
    await t.test(name, () => {
      const invalid = structuredClone(example);
      mutate(invalid);
      assert.equal(validate(invalid), false);
      assert.ok(validate.errors?.length);
    });
  }
});

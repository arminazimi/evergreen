import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import { registryV2Issues } from "../src/registry.js";

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

const symbolMatcher = {
  kind: "symbol",
  language: "javascript",
  module: "react-dom",
  symbol: "render",
  shape: "call",
};

async function symbolValidator() {
  const example = JSON.parse(await readFile(resolve("examples/registry.v2.symbol.example.json"), "utf8"));
  const schema = JSON.parse(await readFile(resolve("schemas/registry.v2.schema.json"), "utf8"));
  return { example, validate: new Ajv2020({ allErrors: true }).compile(schema) };
}

test("the symbol-level example matches the schema and the runtime validator", async () => {
  const { example, validate } = await symbolValidator();
  assert.ok(validate(example), JSON.stringify(validate.errors));
  assert.deepEqual(registryV2Issues(example), []);
});

test("schema and validator agree on symbol matchers", async () => {
  const { example, validate } = await symbolValidator();
  const cases: [string, Record<string, unknown>, boolean][] = [
    ["global without module", { kind: "symbol", language: "typescript", symbol: "Buffer", shape: "construct" }, true],
    ["dotted symbol path", { ...symbolMatcher, symbol: "datetime.utcnow", language: "python" }, true],
    ["option with argument", { ...symbolMatcher, shape: "option", option: "useNewUrlParser", argument: 1 }, true],
    ["option without a name", { ...symbolMatcher, shape: "option" }, false],
    ["option name on a call", { ...symbolMatcher, option: "x" }, false],
    ["argument on a call", { ...symbolMatcher, argument: 0 }, false],
    ["negative argument", { ...symbolMatcher, shape: "option", option: "x", argument: -1 }, false],
    ["construct in Python", { ...symbolMatcher, language: "python", shape: "construct" }, false],
    ["unknown shape", { ...symbolMatcher, shape: "import" }, false],
    ["unsupported language", { ...symbolMatcher, language: "go" }, false],
    ["missing symbol", { kind: "symbol", language: "javascript", shape: "call" }, false],
    ["symbol with a call expression", { ...symbolMatcher, symbol: "render()" }, false],
    ["symbol with empty segment", { ...symbolMatcher, symbol: "a..b" }, false],
    ["blank replacement", { ...symbolMatcher, replacement: " " }, false],
    ["unknown field", { ...symbolMatcher, regex: "render" }, false],
  ];
  for (const [name, matcher, valid] of cases) {
    const registry = structuredClone(example);
    registry.rules[0].usage = [matcher];
    assert.equal(validate(registry), valid, `schema: ${name}`);
    assert.equal(registryV2Issues(registry).length === 0, valid, `validator: ${name}`);
  }
});

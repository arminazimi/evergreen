import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  DEFAULT_MAX_REVIEW_AGE_DAYS,
  isIsoDate,
  registryV2Issues,
  staleRules,
  validateRegistryV2,
} from "../src/registry.js";
import type { RegistryV2 } from "../src/registry.js";
import { RegistryValidationError } from "../src/sdk.js";

async function example(): Promise<RegistryV2> {
  return JSON.parse(await readFile(resolve("examples/registry.v2.example.json"), "utf8")) as RegistryV2;
}

test("accepts the v2 registry example", async () => {
  const registry = await example();
  assert.deepEqual(registryV2Issues(registry), []);
  assert.equal(validateRegistryV2(registry), registry);
});

test("every bundled v2 registry validates", async () => {
  for (const name of await readdir(resolve("registry"))) {
    const registry = JSON.parse(await readFile(resolve("registry", name), "utf8")) as { schemaVersion?: string };
    if (registry.schemaVersion !== "evergreen.registry.v2") continue;
    assert.deepEqual(registryV2Issues(registry), [], name);
  }
});

const invalidCases: [name: string, mutate: (registry: any) => void, expected: RegExp][] = [
  ["missing observedAt", (r) => { delete r.rules[0].provenance.observedAt; }, /rule "npm\.package\.request\.deprecated": provenance\.observedAt is required/],
  ["missing reviewedAt", (r) => { delete r.rules[0].provenance.reviewedAt; }, /provenance\.reviewedAt is required/],
  ["missing reviewer", (r) => { delete r.rules[0].provenance.reviewer; }, /provenance\.reviewer is required/],
  ["missing provenance", (r) => { delete r.rules[0].provenance; }, /provenance is required/],
  ["impossible date", (r) => { r.rules[0].provenance.reviewedAt = "2026-02-30"; }, /provenance\.reviewedAt must be a valid date/],
  ["timestamp instead of date", (r) => { r.rules[0].provenance.observedAt = "2026-10-13T00:00:00Z"; }, /provenance\.observedAt must be a valid date/],
  ["review before observation", (r) => { r.rules[0].provenance.reviewedAt = "2026-01-01"; }, /reviewedAt must not be earlier than/],
  ["no sources", (r) => { r.rules[0].sources = []; }, /sources must list at least one/],
  ["http source", (r) => { r.rules[0].sources[0].url = "http://example.com"; }, /sources\[0\]\.url must be an https URL/],
  ["source without title", (r) => { delete r.rules[0].sources[0].title; }, /sources\[0\]\.title is required/],
  ["versioned purl", (r) => { r.rules[0].purl = "pkg:npm/request@2.88.2"; }, /purl must be canonical and version-less \(expected "pkg:npm\/request"\)/],
  ["non-canonical purl", (r) => { r.rules[0].purl = "pkg:npm/Request"; }, /expected "pkg:npm\/request"/],
  ["malformed purl", (r) => { r.rules[0].purl = "request"; }, /purl is invalid/],
  ["missing purl", (r) => { delete r.rules[0].purl; }, /purl is required/],
  ["vers without scheme", (r) => { r.rules[0].vers = "<5.0.0"; }, /vers is invalid/],
  ["vers with unknown scheme", (r) => { r.rules[0].vers = "vers:nonexistent/1.0"; }, /vers is invalid: Unsupported VERS scheme/],
  ["vers with invalid version", (r) => { r.rules[0].vers = "vers:npm/<next"; }, /vers is invalid: Invalid semver version/],
  ["non-canonical vers", (r) => { r.rules[0].vers = "vers:npm/>=2.0.0|<1.0.0"; }, /vers is invalid: non-canonical VERS/],
  ["scheme that does not fit the purl type", (r) => { r.rules[0].vers = "vers:pypi/<2.0"; }, /vers scheme "pypi" does not fit purl type "npm"/],
  ["unknown event", (r) => { r.rules[0].event = "sunset"; }, /event must be one of/],
  ["unknown severity", (r) => { r.rules[0].severity = "urgent"; }, /severity must be one of/],
  ["bad deadline", (r) => { r.rules[0].deadline = "soon"; }, /deadline must be a valid date/],
  ["empty title", (r) => { r.rules[0].title = " "; }, /title is required/],
  ["invalid id", (r) => { r.rules[0].id = "Request!"; }, /id must use lowercase/],
  ["missing id", (r) => { delete r.rules[0].id; }, /rules\[0\]: id is required/],
  ["duplicate id", (r) => { r.rules[1].id = r.rules[0].id; }, /id is duplicated/],
  ["rule ecosystem mismatch", (r) => { r.rules[1].ecosystem = "pypi"; }, /ecosystem "pypi" does not match the registry ecosystem "npm"/],
  ["unknown rule field", (r) => { r.rules[0].package = "request"; }, /unknown field "package"/],
  ["extension that is not an object", (r) => { r.rules[0]["x-npm"] = "request"; }, /x-npm must be an object/],
  ["invalid migration", (r) => { r.rules[0].migration.steps = []; }, /migration is not valid migration guidance/],
  ["invalid usage matcher", (r) => { r.rules[0].usage = [{ kind: "regex" }]; }, /usage must be a list of valid usage matchers/],
  ["wrong schema version", (r) => { r.schemaVersion = "evergreen.npm-registry.v1"; }, /schemaVersion must be "evergreen\.registry\.v2"/],
  ["zero freshness window", (r) => { r.freshness.maxReviewAgeDays = 0; }, /freshness\.maxReviewAgeDays must be a positive integer/],
  ["unknown envelope field", (r) => { r.extra = true; }, /unknown field "extra"/],
  ["rules not an array", (r) => { r.rules = {}; }, /rules must be an array/],
];

test("rejects invalid rules with errors that name the rule and field", async (t) => {
  const ajv = new Ajv2020({ allErrors: true });
  const validateSchema = ajv.compile(JSON.parse(await readFile(resolve("schemas/registry.v2.schema.json"), "utf8")));
  const base = await example();
  for (const [name, mutate, expected] of invalidCases) {
    await t.test(name, () => {
      const registry = structuredClone(base);
      mutate(registry);
      const issues = registryV2Issues(registry);
      assert.ok(issues.some((issue) => expected.test(issue)), `${expected} not in ${JSON.stringify(issues)}`);
      assert.throws(() => validateRegistryV2(registry), (error: unknown) => {
        assert.ok(error instanceof RegistryValidationError);
        assert.match(error.message, expected);
        return true;
      });
    });
  }

  // The runtime validator is at least as strict as the JSON Schema on every case the schema can express.
  await t.test("schema and validator agree on the example", () => {
    assert.ok(validateSchema(base));
    assert.deepEqual(registryV2Issues(base), []);
  });
  for (const [name, mutate] of invalidCases) {
    await t.test(`validator rejects whatever the schema rejects: ${name}`, () => {
      const registry = structuredClone(base);
      mutate(registry);
      if (!validateSchema(registry)) assert.ok(registryV2Issues(registry).length > 0);
    });
  }
});

test("reports every problem at once and caps long lists", async () => {
  const registry = structuredClone(await example());
  delete (registry.rules[0] as any).provenance;
  registry.rules[1]!.severity = "urgent" as never;
  const issues = registryV2Issues(registry);
  assert.equal(issues.length, 2);
  assert.throws(() => validateRegistryV2(registry), /Invalid registry \(2 problems\)/);

  const many = structuredClone(await example());
  many.rules = Array.from({ length: 30 }, (_, index) => ({ ...structuredClone(many.rules[0]!), id: `npm.rule-${index}`, title: "" }));
  assert.throws(() => validateRegistryV2(many), /and 10 more/);
});

test("recognizes real calendar dates only", () => {
  for (const value of ["2026-10-15", "2024-02-29"]) assert.equal(isIsoDate(value), true, value);
  for (const value of ["2026-02-29", "2026-13-01", "2026-1-5", "20261015", "", 5, null]) assert.equal(isIsoDate(value), false, String(value));
});

test("reports rules reviewed longer ago than the review window", async () => {
  const registry = structuredClone(await example());
  registry.freshness = { maxReviewAgeDays: 30 };
  registry.rules[0]!.provenance.reviewedAt = "2026-09-01";
  registry.rules[1]!.provenance.reviewedAt = "2026-09-15";

  assert.deepEqual(staleRules(registry, new Date("2026-10-15T12:00:00Z")), [
    { ruleId: "npm.package.request.deprecated", reviewedAt: "2026-09-01", ageDays: 44, maxReviewAgeDays: 30 },
  ]);
  // The boundary day is not stale; one more day is.
  assert.deepEqual(staleRules(registry, new Date("2026-10-01T00:00:00Z")), []);
  assert.equal(staleRules(registry, new Date("2026-10-02T00:00:00Z")).length, 1);
});

test("uses a 365-day window when none is declared", async () => {
  const registry = structuredClone(await example());
  delete registry.freshness;
  registry.rules[0]!.provenance.reviewedAt = "2025-10-01";
  assert.equal(DEFAULT_MAX_REVIEW_AGE_DAYS, 365);
  assert.equal(staleRules(registry, new Date("2026-10-01T00:00:00Z")).length, 0);
  assert.equal(staleRules(registry, new Date("2026-10-02T00:00:00Z")).length, 1);
});

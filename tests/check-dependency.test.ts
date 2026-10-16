import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import { checkAgainst, checkDependency, CheckDependencyError } from "../src/check-dependency.js";
import type { RegistryV2Rule } from "../src/registry.js";

const rule = (id: string, purl: string, vers: string, severity: RegistryV2Rule["severity"], extra: Partial<RegistryV2Rule> = {}): RegistryV2Rule => ({
  id,
  ecosystem: purl.split("/")[0]!.replace("pkg:", ""),
  purl,
  vers,
  event: "deprecated",
  title: `Title ${id}`,
  summary: `Summary ${id}.`,
  severity,
  sources: [{ title: "Source", url: "https://example.com/source" }],
  provenance: { observedAt: "2026-10-16", reviewedAt: "2026-10-16", reviewer: "test" },
  ...extra,
});

test("a deprecated npm package is affected with or without a version", async () => {
  for (const input of ["pkg:npm/request", "pkg:npm/request@2.88.2"]) {
    const check = await checkDependency(input);
    assert.equal(check.status, "affected", input);
    assert.equal(check.purl, "pkg:npm/request");
    assert.equal(check.findings[0]!.ruleId, "npm.package.request.deprecated");
    assert.ok(check.findings[0]!.sources.length > 0);
    assert.ok(check.findings[0]!.replacement);
  }
  assert.equal((await checkDependency("pkg:npm/request@2.88.2")).version, "2.88.2");
});

test("PyPI names are normalized before lookup", async () => {
  const check = await checkDependency("pkg:pypi/Django_Nose@1.4.7");
  assert.equal(check.purl, "pkg:pypi/django-nose");
  assert.equal(check.status, "affected");
});

test("GitHub Action refs are matched by major, with or without the v and minor parts", async () => {
  assert.equal((await checkDependency("pkg:github/actions/checkout@v4")).status, "affected");
  assert.equal((await checkDependency("pkg:github/actions/checkout@v4.2.1")).status, "affected");
  assert.equal((await checkDependency("pkg:github/actions/checkout@4")).status, "affected");
  assert.equal((await checkDependency("pkg:github/Actions/Checkout@v5")).status, "not-affected");
  const unversioned = await checkDependency("pkg:github/actions/checkout");
  assert.equal(unversioned.status, "version-dependent");
  assert.match(unversioned.message, /Check again with a version/);
});

test("a package with no rule is no-data, never described as safe", async () => {
  const check = await checkDependency("pkg:npm/express@4.0.0");
  assert.equal(check.status, "no-data");
  assert.deepEqual(check.findings, []);
  assert.equal("severity" in check, false);
  assert.match(check.message, /does not mean it is safe/);
});

test("the version option overrides a version in the PURL", async () => {
  assert.equal((await checkDependency({ purl: "pkg:github/actions/checkout@v5", version: "v4" })).status, "affected");
});

test("invalid input is rejected with a clear error", async () => {
  await assert.rejects(checkDependency("npm/request"), (error: unknown) => error instanceof CheckDependencyError && /pkg:/.test(error.message));
  await assert.rejects(checkDependency("pkg:github/actions/checkout@latest"), (error: unknown) => error instanceof CheckDependencyError && /not a valid version/.test(error.message));
});

test("findings are ordered by severity, then rule id, and the top severity is reported", () => {
  const rules = [
    rule("npm.b", "pkg:npm/left", "vers:npm/*", "low"),
    rule("npm.c", "pkg:npm/left", "vers:npm/*", "critical"),
    rule("npm.a", "pkg:npm/left", "vers:npm/*", "critical"),
  ];
  const check = checkAgainst(rules, { purl: "pkg:npm/left" });
  assert.deepEqual(check.findings.map((finding) => finding.ruleId), ["npm.a", "npm.c", "npm.b"]);
  assert.equal(check.severity, "critical");
});

test("range rules need a version: version-dependent without one, scoped to the range with one", () => {
  const rules = [rule("npm.old", "pkg:npm/lib", "vers:npm/<3.0.0", "high"), rule("npm.new", "pkg:npm/lib", "vers:npm/>=5.0.0|<6.0.0", "medium")];
  const none = checkAgainst(rules, { purl: "pkg:npm/lib" });
  assert.equal(none.status, "version-dependent");
  assert.equal(none.findings.length, 2);
  assert.deepEqual(checkAgainst(rules, { purl: "pkg:npm/lib@2.9.0" }).findings.map((finding) => finding.ruleId), ["npm.old"]);
  assert.equal(checkAgainst(rules, { purl: "pkg:npm/lib@4.0.0" }).status, "not-affected");
  assert.deepEqual(checkAgainst(rules, { purl: "pkg:npm/lib@5.5.0" }).findings.map((finding) => finding.ruleId), ["npm.new"]);
});

test("a rule that covers every version makes an unversioned check affected", () => {
  const rules = [rule("npm.all", "pkg:npm/gone", "vers:npm/*", "high"), rule("npm.range", "pkg:npm/gone", "vers:npm/<1.0.0", "critical")];
  const check = checkAgainst(rules, { purl: "pkg:npm/gone" });
  assert.equal(check.status, "affected");
  assert.deepEqual(check.findings.map((finding) => finding.ruleId), ["npm.all"]);
});

test("results are deterministic and match the published schema", async () => {
  const schema = JSON.parse(await readFile(resolve("schemas/check.v1.schema.json"), "utf8")) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema(JSON.parse(await readFile(resolve("schemas/scan.v1.schema.json"), "utf8")) as object);
  const validate = ajv.compile(schema);
  for (const input of ["pkg:npm/request@2.88.2", "pkg:github/actions/checkout", "pkg:github/actions/checkout@v5", "pkg:npm/express", "pkg:generic/nodejs@18.0.0", "pkg:pypi/nose"]) {
    const first = await checkDependency(input);
    assert.equal(validate(first), true, `${input}: ${JSON.stringify(validate.errors)}`);
    assert.equal(JSON.stringify(await checkDependency(input)), JSON.stringify(first));
  }
});

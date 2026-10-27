import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { CycloneDxError } from "../src/sbom/cyclonedx.js";
import { SpdxError, scanCycloneDx, scanCycloneDxFile, scanSpdx, scanSpdxFile } from "../src/sbom/input.js";

const bom = (components: unknown = []) => ({ bomFormat: "CycloneDX", specVersion: "1.6", version: 1, components });
const fixture = resolve("tests/fixtures/cyclonedx/input.json");
const purlRef = (locator: string) => ({ referenceCategory: "PACKAGE-MANAGER", referenceType: "purl", referenceLocator: locator });
const pkg = (spdxId: string, externalRefs: unknown, versionInfo?: string) => ({
  name: spdxId, SPDXID: spdxId, externalRefs, ...(versionInfo !== undefined ? { versionInfo } : {}),
});
const document = (packages: unknown = []) =>
  ({ spdxVersion: "SPDX-2.3", dataLicense: "CC0-1.0", SPDXID: "SPDXRef-DOCUMENT", packages });
const spdxFixture = resolve("tests/fixtures/spdx/input.json");

test("fixture SBOM produces lifecycle findings with evidence and exact component locations", async () => {
  const before = await readFile(fixture, "utf8");
  const results = await scanCycloneDxFile(fixture);
  assert.deepEqual(results.map(({ location }) => location), [
    "/components/0", "/components/1/components/0", "/components/1/components/1",
    "/components/2", "/components/3", "/metadata/component",
  ]);
  const request = results[0]!;
  assert.equal(request.bomRef, "request-2.88.2");
  assert.equal(request.version, "2.88.2");
  assert.equal(request.status, "affected");
  assert.equal(request.findings[0]!.ruleId, "npm.package.request.deprecated");
  assert.ok(request.findings[0]!.sources.length);
  assert.ok(request.findings[0]!.replacement);
  assert.ok(request.severity);
  assert.equal(results[1]!.purl, "pkg:pypi/django-nose");
  assert.equal(results[1]!.status, "affected");
  assert.equal(results[2]!.status, "no-data");
  assert.deepEqual(results[2]!.findings, []);
  assert.equal(results[3]!.version, "v5");
  assert.equal(results[3]!.status, "not-affected");
  assert.equal(results[4]!.status, "version-dependent");
  assert.equal(await readFile(fixture, "utf8"), before);
  assert.deepEqual(await scanCycloneDxFile(fixture), results);
});

test("component version is used when the PURL has no version", async () => {
  const [result] = await scanCycloneDx(bom([{ purl: "pkg:github/actions/checkout", version: "v4" }]));
  assert.equal(result!.version, "v4");
  assert.equal(result!.status, "affected");
});

test("empty BOMs and components without PURLs produce no checks; input is preserved", async () => {
  for (const specVersion of ["1.3", "1.4", "1.5", "1.6"]) {
    const input = { ...bom([{ name: "local", components: [] }]), specVersion };
    const original = structuredClone(input);
    assert.deepEqual(await scanCycloneDx(input), []);
    assert.deepEqual(input, original);
  }
  assert.deepEqual(await scanCycloneDx({ bomFormat: "CycloneDX", specVersion: "1.6", metadata: {} }), []);
});

test("reject malformed BOMs and component fields with a contextual error", async () => {
  for (const input of [
    null, [], {}, { ...bom(), bomFormat: "SPDX" }, { ...bom(), specVersion: "2.0" },
    { ...bom(), specVersion: 1.6 }, bom({}), bom([null]), bom([[]]),
    bom([{ components: {} }]), bom([{ purl: 1 }]),
    bom([{ purl: "pkg:npm/request", version: 1 }]),
    bom([{ purl: "pkg:npm/request", "bom-ref": 1 }]),
    { ...bom(), metadata: null }, { ...bom(), metadata: [] },
    { ...bom(), metadata: { component: null } },
  ]) {
    await assert.rejects(scanCycloneDx(input), CycloneDxError);
  }
  for (const purl of ["not-a-purl", "pkg:npm/%ZZ", "pkg:github/actions/checkout@latest"]) {
    await assert.rejects(scanCycloneDx(bom([{ purl }])),
      (error: unknown) => error instanceof CycloneDxError && /\/components\/0/.test(error.message));
  }
});

test("file reader reports missing files and malformed JSON", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-sbom-input-"));
  try {
    const path = join(directory, "bom.json");
    await assert.rejects(scanCycloneDxFile(path), /Cannot read CycloneDX BOM/);
    await writeFile(path, "{");
    await assert.rejects(scanCycloneDxFile(path), /Cannot read CycloneDX BOM/);
    await writeFile(path, "{}");
    await assert.rejects(scanCycloneDxFile(path), /Expected a CycloneDX/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("deep component nesting is traversed without recursive stack growth", async () => {
  let component: Record<string, unknown> = { purl: "pkg:npm/request" };
  for (let index = 0; index < 1000; index++) component = { components: [component] };
  const results = await scanCycloneDx(bom([component]));
  assert.equal(results.length, 1);
  assert.equal(results[0]!.status, "affected");
});

test("SPDX fixture produces lifecycle findings with evidence and exact reference locations", async () => {
  const before = await readFile(spdxFixture, "utf8");
  const results = await scanSpdxFile(spdxFixture);
  assert.deepEqual(results.map(({ location }) => location), [
    "/packages/0/externalRefs/0", "/packages/1/externalRefs/0", "/packages/2/externalRefs/0",
    "/packages/3/externalRefs/0", "/packages/4/externalRefs/0", "/packages/5/externalRefs/1",
  ]);
  const request = results[0]!;
  assert.equal(request.spdxId, "SPDXRef-request");
  assert.equal(request.version, "2.88.2");
  assert.equal(request.status, "affected");
  assert.equal(request.findings[0]!.ruleId, "npm.package.request.deprecated");
  assert.ok(request.findings[0]!.sources.length);
  assert.ok(request.findings[0]!.replacement);
  assert.ok(request.severity);
  assert.equal(results[1]!.purl, "pkg:pypi/django-nose");
  assert.equal(results[1]!.status, "affected");
  assert.equal(results[2]!.status, "no-data");
  assert.deepEqual(results[2]!.findings, []);
  assert.equal(results[3]!.version, "v5");
  assert.equal(results[3]!.status, "not-affected");
  assert.equal(results[4]!.status, "version-dependent");
  assert.equal(await readFile(spdxFixture, "utf8"), before);
  assert.deepEqual(await scanSpdxFile(spdxFixture), results);
});

test("package versionInfo is used when the reference PURL has no version", async () => {
  const [result] = await scanSpdx(document([pkg("SPDXRef-checkout", [purlRef("pkg:github/actions/checkout")], "v4")]));
  assert.equal(result!.version, "v4");
  assert.equal(result!.status, "affected");
});

test("empty SPDX documents and references without PURLs produce no checks; input is preserved", async () => {
  const inputs = [
    document(),
    { ...document(), packages: [] },
    { ...document(), relationships: [] },
    document([{ ...pkg("SPDXRef-local", undefined), externalRefs: undefined }]),
    document([pkg("SPDXRef-cpe", [{ referenceCategory: "SECURITY", referenceType: "cpe23Type",
      referenceLocator: "cpe:2.3:a:example:example:1.0.0:*:*:*:*:*:*:*" }])]),
  ];
  for (const input of inputs) {
    const original = structuredClone(input);
    assert.deepEqual(await scanSpdx(input), []);
    assert.deepEqual(input, original);
  }
});

test("reject malformed SPDX documents and reference fields with a contextual error", async () => {
  for (const input of [
    null, [], {}, { ...document(), spdxVersion: "SPDX-2.2" }, { ...document(), spdxVersion: 2.3 },
    { spdxVersion: "SPDX-2.3", packages: {} }, document([null]), document([[]]),
    document([pkg("SPDXRef-example", {})]), document([pkg("SPDXRef-example", [null])]),
    document([pkg("SPDXRef-example", [{}])]), document([pkg("SPDXRef-example", [{ ...purlRef("pkg:npm/request"), referenceLocator: 1 }])]),
    document([{ ...pkg("SPDXRef-example", [purlRef("pkg:npm/request")]), versionInfo: 1 }]),
    document([{ ...pkg("SPDXRef-example", [purlRef("pkg:npm/request")]), SPDXID: 1 }]),
  ]) {
    await assert.rejects(scanSpdx(input), SpdxError);
  }
  for (const locator of ["not-a-purl", "pkg:npm/%ZZ", "pkg:github/actions/checkout@latest"]) {
    await assert.rejects(scanSpdx(document([pkg("SPDXRef-example", [purlRef(locator)])])),
      (error: unknown) => error instanceof SpdxError && /\/packages\/0\/externalRefs\/0/.test(error.message));
  }
});

test("SPDX file reader reports missing files and malformed JSON", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-sbom-input-"));
  try {
    const path = join(directory, "spdx.json");
    await assert.rejects(scanSpdxFile(path), /Cannot read SPDX document/);
    await writeFile(path, "{");
    await assert.rejects(scanSpdxFile(path), /Cannot read SPDX document/);
    await writeFile(path, "{}");
    await assert.rejects(scanSpdxFile(path), /Expected an SPDX/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("packages are checked once per PURL reference and non-PURL references are skipped", async () => {
  const results = await scanSpdx(document([
    pkg("SPDXRef-multi", [
      { referenceCategory: "SECURITY", referenceType: "cpe23Type", referenceLocator: "cpe:2.3:a:example:example:1:*" },
      purlRef("pkg:npm/request"),
      { ...purlRef("pkg:npm/request"), referenceType: "PURL" },
    ], "2.88.2"),
  ]));
  assert.deepEqual(results.map(({ location }) => location),
    ["/packages/0/externalRefs/1", "/packages/0/externalRefs/2"]);
  for (const result of results) assert.equal(result.status, "affected");
});

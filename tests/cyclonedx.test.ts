import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { Ajv } from "ajv";

import { BUNDLED_ECOSYSTEMS } from "../src/data-bundle.js";
import type { ActiveData } from "../src/data-source.js";
import type { RegistryV2Rule } from "../src/registry.js";
import { CycloneDxError, enrichCycloneDx, enrichCycloneDxFile } from "../src/sbom/cyclonedx.js";

const execute = promisify(execFile);
const rule: RegistryV2Rule = {
  id: "example.eol", ecosystem: "npm", purl: "pkg:npm/example", vers: "vers:npm/<2.0.0",
  event: "end-of-life", title: "Example EOL", summary: "No longer supported", severity: "high",
  deadline: "2026-01-01", sources: [{ title: "Policy", url: "https://example.com/policy" }],
  provenance: { observedAt: "2025-12-01", reviewedAt: "2026-02-01", reviewer: "test" },
};
const endOfLife = "cdx:lifecycle:milestone:endOfLife";
const bom = <T = Record<string, unknown>>(components: T[] = []) => ({ bomFormat: "CycloneDX", specVersion: "1.6", version: 1, components });
const components = (document: Record<string, unknown>) => document.components as Array<Record<string, unknown>>;

// Unmodified upstream CycloneDX 1.6 schemas, kept local so validation needs no network.
const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addFormat("iri-reference", (value: string) => !/\s/.test(value));
ajv.addFormat("uri", (value: string) => URL.canParse(value));
ajv.addFormat("date-time", (value: string) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)));
ajv.addFormat("idn-email", (value: string) => /^[^\s@]+@[^\s@]+$/.test(value));
for (const file of ["spdx.schema.json", "jsf-0.82.schema.json"]) {
  ajv.addSchema(JSON.parse(await readFile(resolve("tests/fixtures/cyclonedx", file), "utf8")));
}
const validate = ajv.compile<Record<string, unknown>>(JSON.parse(await readFile(resolve("tests/fixtures/cyclonedx/bom-1.6.schema.json"), "utf8")));

test("CycloneDX enrichment preserves data, adds official milestones and evidence, and is idempotent", () => {
  const input = {
    ...bom([{
      type: "library", name: "example", purl: "pkg:npm/EXAMPLE@1.0.0", "bom-ref": "example-1",
      hashes: [{ alg: "SHA-256", content: "a".repeat(64) }], licenses: [{ license: { id: "MIT" } }],
      properties: [{ name: "internal:owner", value: "team" }, { name: endOfLife, value: "2025-01-01" }],
      externalReferences: [{ type: "website", url: "https://example.com/" }],
    }]),
    serialNumber: "urn:uuid:3e671687-395b-41f5-a30f-a58921a69b79",
    dependencies: [{ ref: "example-1", dependsOn: [] }],
  };
  const original = structuredClone(input);
  const rules = [rule, { ...rule, id: "example.support", event: "end-of-support" as const }];
  const result = enrichCycloneDx(input, rules);
  assert.ok(validate(input), JSON.stringify(validate.errors));
  assert.ok(validate(result), JSON.stringify(validate.errors));
  assert.deepEqual(input, original);
  assert.deepEqual(result.dependencies, original.dependencies);
  const component = components(result)[0]!;
  assert.deepEqual(component.hashes, original.components[0]!.hashes);
  assert.deepEqual(component.licenses, original.components[0]!.licenses);
  assert.deepEqual(component.properties, [
    ...original.components[0]!.properties,
    { name: endOfLife, value: rule.deadline },
    { name: "cdx:lifecycle:milestone:endOfSupport", value: rule.deadline },
  ]);
  assert.deepEqual(component.externalReferences, [
    ...original.components[0]!.externalReferences,
    { type: "documentation", url: rule.sources[0]!.url, comment: rule.sources[0]!.title },
  ]);
  assert.deepEqual(enrichCycloneDx(result, rules), result);
  assert.deepEqual(enrichCycloneDx(input, [...rules].reverse()), result);
  assert.equal(validate(bom([{ type: "library", name: "bad", properties: [{ name: endOfLife, value: 123 }] }])), false);
});

test("CycloneDX matches versions and normalized PURLs, including metadata and nested components", () => {
  const input = {
    ...bom([
      { type: "library", name: "example", purl: "pkg:npm/example@3.0.0", version: "1.0.0" },
      { type: "library", name: "example", purl: "pkg:npm/example", version: "1.0.0" },
      { type: "library", name: "unknown", purl: "pkg:npm/unknown@1.0.0" },
      { type: "library", name: "unversioned", purl: "pkg:npm/example" },
      { type: "application", name: "parent", components: [{ type: "library", name: "nested", purl: "pkg:npm/example@1.0.0" }] },
      { type: "library", name: "scoped", purl: "pkg:npm/@scope/example@1.0.0?arch=x86_64#lib" },
      { type: "library", name: "python", purl: "pkg:pypi/My_Package@1.0.0" },
    ]),
    metadata: { component: { type: "application", name: "root", purl: "pkg:npm/example@1.0.0" } },
  };
  const result = enrichCycloneDx(input, [rule,
    { ...rule, id: "scoped.eol", purl: "pkg:npm/%40scope/example" },
    { ...rule, id: "python.eol", purl: "pkg:pypi/my-package", vers: "vers:pypi/<2.0.0" },
  ]);
  const list = components(result);
  for (const index of [0, 2, 3]) assert.deepEqual(list[index], input.components[index]);
  for (const index of [1, 5, 6]) assert.deepEqual(list[index]!.properties, [{ name: endOfLife, value: rule.deadline }]);
  const nested = (list[4]!.components as Array<Record<string, unknown>>)[0]!;
  assert.deepEqual(nested.properties, list[1]!.properties);
  assert.deepEqual((result.metadata as { component: Record<string, unknown> }).component.properties, list[1]!.properties);
  assert.ok(validate(result), JSON.stringify(validate.errors));
});

test("CycloneDX omits unsupported claims, and keeps unknown components and existing evidence unchanged", () => {
  const { deadline: _, ...undated } = rule;
  const input = bom([{ type: "library", name: "example", purl: "pkg:npm/example@1.0.0" }]);
  assert.deepEqual(enrichCycloneDx(input, [
    undated, { ...rule, event: "deprecated" }, { ...rule, event: "removed" },
    { ...rule, usage: [{ kind: "symbol", language: "javascript", symbol: "oldApi", shape: "call" }] },
  ]), input);
  const existing = bom([{ ...input.components[0]!,
    properties: [{ name: endOfLife, value: rule.deadline }],
    externalReferences: [{ type: "other", url: rule.sources[0]!.url, comment: "Keep me" }],
  }]);
  assert.deepEqual(enrichCycloneDx(existing, [rule, rule]), existing);
  const scheduled = enrichCycloneDx(input, [{ ...rule, event: "scheduled-end-of-life", deadline: "2030-01-01" }]);
  assert.deepEqual(components(scheduled)[0]!.properties, [{ name: endOfLife, value: "2030-01-01" }]);
  const unversioned = bom([{ type: "library", name: "example", purl: "pkg:npm/example" }]);
  assert.ok(components(enrichCycloneDx(unversioned, [{ ...rule, vers: "vers:npm/*" }]))[0]!.properties);
  assert.deepEqual(enrichCycloneDx(bom(), []), bom());
  for (const specVersion of ["1.3", "1.4", "1.5"]) {
    assert.equal(enrichCycloneDx({ ...input, specVersion }, [rule]).specVersion, specVersion);
  }
});

test("CycloneDX rejects malformed headers, component structures, PURLs and versions", () => {
  for (const input of [null, [], {}, { ...bom(), specVersion: "1.2" }, { ...bom(), specVersion: 1.6 },
    { ...bom(), components: {} }, bom([null]), bom([{ components: [null] }]),
    bom([{ properties: {} }]), bom([{ externalReferences: null }]),
    bom([{ purl: 123 }]), bom([{ purl: "pkg:npm/example", version: 123 }]),
    bom([{ purl: "invalid" }]), bom([{ purl: "pkg:npm/example@invalid" }]),
    { ...bom(), metadata: [] }, { ...bom(), metadata: { component: null } },
  ]) assert.throws(() => enrichCycloneDx(input, [rule]), CycloneDxError);
});

test("CycloneDX file enrichment reads all active registries, including ecosystems absent from check", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-cdx-"));
  try {
    const path = join(root, "bom.json");
    await writeFile(path, JSON.stringify(bom([{ type: "library", name: "example", purl: "pkg:cargo/example@1.0.0" }])));
    const paths: string[] = [];
    const data = { async read(path: string) {
      paths.push(path);
      const ecosystem = path.slice("registry/".length, -".json".length);
      return { schemaVersion: "evergreen.registry.v2", ecosystem,
        rules: ecosystem === "rust" ? [{ ...rule, ecosystem, purl: "pkg:cargo/example", vers: "vers:cargo/<2.0.0" }] : [] };
    } } as ActiveData;
    const result = await enrichCycloneDxFile(path, data);
    assert.deepEqual(paths, BUNDLED_ECOSYSTEMS.map((ecosystem) => `registry/${ecosystem}.json`));
    assert.deepEqual(components(result)[0]!.properties, [{ name: endOfLife, value: rule.deadline }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI prints schema-valid enriched JSON deterministically and leaves the source file intact", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-cdx-cli-"));
  try {
    const path = join(root, "bom.json");
    const original = JSON.stringify(bom([{ type: "application", name: "nodejs", purl: "pkg:generic/nodejs@20.0.0" }]));
    await writeFile(path, original);
    const args = [resolve("dist/src/cli.js"), "sbom", "enrich", path, "--data-version", "bundled"];
    const first = await execute(process.execPath, args);
    assert.equal(first.stderr, "");
    assert.equal(first.stdout, (await execute(process.execPath, args)).stdout);
    assert.equal(await readFile(path, "utf8"), original);
    const result = JSON.parse(first.stdout);
    assert.ok(validate(result), JSON.stringify(validate.errors));
    assert.deepEqual(components(result)[0]!.properties, [{ name: endOfLife, value: "2026-04-30" }]);
    assert.ok((components(result)[0]!.externalReferences as unknown[]).length > 0);
    await writeFile(path, first.stdout);
    assert.equal((await execute(process.execPath, args)).stdout, first.stdout);
    for (const args of [["sbom"], ["sbom", "enrich"], ["sbom", "other", path],
      ["sbom", "enrich", path, "extra"], ["sbom", "enrich", path, "--json"],
      ["sbom", "enrich", path, "--data-version"]]) {
      await assert.rejects(execute(process.execPath, [resolve("dist/src/cli.js"), ...args]),
        (error: unknown) => (error as { code: number }).code === 2);
    }
    for (const content of ["{", JSON.stringify({ bomFormat: "SPDX" }), JSON.stringify(bom([{ purl: "bad" }]))]) {
      await writeFile(path, content);
      await assert.rejects(execute(process.execPath, args), (error: unknown) => {
        const failure = error as { code: number; stdout: string; stderr: string };
        assert.equal(failure.code, 4);
        assert.equal(failure.stdout, "");
        assert.match(failure.stderr, /CycloneDX|Cannot match component/);
        return true;
      });
      assert.equal(await readFile(path, "utf8"), content);
    }
    await assert.rejects(enrichCycloneDxFile(join(root, "missing.json")), CycloneDxError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

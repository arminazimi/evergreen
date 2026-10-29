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
import { SpdxError, enrichSpdx, enrichSpdxFile } from "../src/sbom/spdx.js";

const execute = promisify(execFile);
const rule: RegistryV2Rule = {
  id: "example.eol", ecosystem: "npm", purl: "pkg:npm/example", vers: "vers:npm/<2.0.0",
  event: "end-of-life", title: "Example EOL", summary: "No longer supported", severity: "high",
  deadline: "2026-01-01", sources: [{ title: "Policy", url: "https://example.com/policy" }],
  provenance: { observedAt: "2025-12-01", reviewedAt: "2026-02-01", reviewer: "test" },
};
const endOfLife = "evergreen:lifecycle:milestone:endOfLife:2026-01-01";
const purlRef = (locator: string) => ({
  referenceCategory: "PACKAGE-MANAGER", referenceType: "purl", referenceLocator: locator,
});
const pkg = (spdxId: string, externalRefs: unknown[] = [], versionInfo?: string) => ({
  name: spdxId, SPDXID: spdxId, downloadLocation: "NOASSERTION",
  externalRefs, ...(versionInfo !== undefined ? { versionInfo } : {}),
});
const document = (packages: unknown[] = []) => ({
  spdxVersion: "SPDX-2.3", dataLicense: "CC0-1.0", SPDXID: "SPDXRef-DOCUMENT",
  name: "example", documentNamespace: "https://example.com/evergreen/spdx/example",
  creationInfo: { created: "2026-10-27T00:00:00Z", creators: ["Tool: evergreen-tests"] },
  packages,
});
const packages = (value: Record<string, unknown>) => value.packages as Array<Record<string, unknown>>;

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile<Record<string, unknown>>(
  JSON.parse(await readFile(resolve("tests/fixtures/spdx/spdx-schema.json"), "utf8")));

test("SPDX enrichment preserves data, adds lifecycle annotations and evidence, and is idempotent", () => {
  const input = {
    ...document([{
      ...pkg("SPDXRef-example", [purlRef("pkg:npm/EXAMPLE@1.0.0")], "1.0.0"),
      checksums: [{ algorithm: "SHA256", checksumValue: "a".repeat(64) }],
      annotations: [{
        annotationDate: "2025-01-01T00:00:00Z", annotationType: "OTHER",
        annotator: "Person: Alice", comment: "keep me",
      }],
      externalRefs: [
        purlRef("pkg:npm/EXAMPLE@1.0.0"),
        { referenceCategory: "OTHER", referenceType: "website", referenceLocator: "https://example.com/" },
      ],
    }]),
    relationships: [{
      spdxElementId: "SPDXRef-DOCUMENT", relationshipType: "DESCRIBES",
      relatedSpdxElement: "SPDXRef-example",
    }],
  };
  const original = structuredClone(input);
  const rules = [rule, { ...rule, id: "example.support", event: "end-of-support" as const }];
  const result = enrichSpdx(input, rules);
  assert.ok(validate(input), JSON.stringify(validate.errors));
  assert.ok(validate(result), JSON.stringify(validate.errors));
  assert.deepEqual(input, original);
  assert.deepEqual(result.relationships, original.relationships);
  const enriched = packages(result)[0]!;
  const originalPackage = packages(original)[0]!;
  assert.deepEqual(enriched.checksums, originalPackage.checksums);
  assert.deepEqual(enriched.annotations, [
    ...(originalPackage.annotations as unknown[]),
    {
      annotationDate: "2026-01-01T00:00:00Z", annotationType: "OTHER",
      annotator: "Tool: evergreen", comment: endOfLife,
    },
    {
      annotationDate: "2026-01-01T00:00:00Z", annotationType: "OTHER",
      annotator: "Tool: evergreen",
      comment: "evergreen:lifecycle:milestone:endOfSupport:2026-01-01",
    },
  ]);
  assert.deepEqual(enriched.externalRefs, [
    ...(originalPackage.externalRefs as unknown[]),
    {
      referenceCategory: "OTHER", referenceType: "documentation",
      referenceLocator: rule.sources[0]!.url, comment: rule.sources[0]!.title,
    },
  ]);
  assert.deepEqual(enrichSpdx(result, rules), result);
  assert.deepEqual(enrichSpdx(input, [...rules].reverse()), result);
});

test("SPDX matches versions and normalized PURLs across packages", () => {
  const input = document([
    pkg("SPDXRef-purl-version", [purlRef("pkg:npm/example@3.0.0")], "1.0.0"),
    pkg("SPDXRef-versionInfo", [purlRef("pkg:npm/example")], "1.0.0"),
    pkg("SPDXRef-unknown", [purlRef("pkg:npm/unknown@1.0.0")]),
    pkg("SPDXRef-unversioned", [purlRef("pkg:npm/example")]),
    pkg("SPDXRef-scoped", [purlRef("pkg:npm/@scope/example@1.0.0?arch=x86_64#lib")]),
    pkg("SPDXRef-python", [purlRef("pkg:pypi/My_Package@1.0.0")]),
    pkg("SPDXRef-local"),
  ]);
  const result = enrichSpdx(input, [rule,
    { ...rule, id: "scoped.eol", purl: "pkg:npm/%40scope/example" },
    { ...rule, id: "python.eol", purl: "pkg:pypi/my-package", vers: "vers:pypi/<2.0.0" },
  ]);
  const list = packages(result);
  for (const index of [0, 2, 3, 6]) assert.deepEqual(list[index], input.packages[index]);
  for (const index of [1, 4, 5]) {
    assert.deepEqual(list[index]!.annotations, [{
      annotationDate: "2026-01-01T00:00:00Z", annotationType: "OTHER",
      annotator: "Tool: evergreen", comment: endOfLife,
    }]);
  }
  assert.equal(list.length, input.packages.length);
  assert.ok(validate(result), JSON.stringify(validate.errors));
});

test("SPDX omits unsupported claims, and keeps unknown packages and existing evidence unchanged", () => {
  const { deadline: _, ...undated } = rule;
  const input = document([pkg("SPDXRef-example", [purlRef("pkg:npm/example@1.0.0")])]);
  assert.deepEqual(enrichSpdx(input, [
    undated, { ...rule, event: "deprecated" }, { ...rule, event: "removed" },
    { ...rule, usage: [{ kind: "symbol", language: "javascript", symbol: "oldApi", shape: "call" }] },
  ]), input);
  const existing = document([{
    ...input.packages[0]!,
    annotations: [{
      annotationDate: "2026-01-01T00:00:00Z", annotationType: "OTHER",
      annotator: "Tool: evergreen", comment: endOfLife,
    }],
    externalRefs: [
      purlRef("pkg:npm/example@1.0.0"),
      {
        referenceCategory: "OTHER", referenceType: "website",
        referenceLocator: rule.sources[0]!.url, comment: "Keep me",
      },
    ],
  }]);
  assert.deepEqual(enrichSpdx(existing, [rule, rule]), existing);
  const scheduled = enrichSpdx(input, [{ ...rule, event: "scheduled-end-of-life", deadline: "2030-01-01" }]);
  assert.deepEqual(packages(scheduled)[0]!.annotations, [{
    annotationDate: "2030-01-01T00:00:00Z", annotationType: "OTHER",
    annotator: "Tool: evergreen",
    comment: "evergreen:lifecycle:milestone:endOfLife:2030-01-01",
  }]);
  const unversioned = document([pkg("SPDXRef-example", [purlRef("pkg:npm/example")])]);
  assert.ok(packages(enrichSpdx(unversioned, [{ ...rule, vers: "vers:npm/*" }]))[0]!.annotations);
  assert.deepEqual(enrichSpdx(document(), []), document());
});

test("SPDX rejects malformed headers, package structures, PURLs and versions", () => {
  for (const input of [
    null, [], {}, { ...document(), spdxVersion: "SPDX-2.2" }, { ...document(), spdxVersion: 2.3 },
    { ...document(), packages: {} }, document([null]), document([[]]),
    document([{ ...pkg("SPDXRef-example"), annotations: {} }]),
    document([{ ...pkg("SPDXRef-example"), externalRefs: null }]),
    document([pkg("SPDXRef-example", [{ ...purlRef("pkg:npm/example"), referenceType: 1 }])]),
    document([pkg("SPDXRef-example", [{ ...purlRef("pkg:npm/example"), referenceLocator: 1 }])]),
    document([{ ...pkg("SPDXRef-example", [purlRef("pkg:npm/example")]), versionInfo: 1 }]),
    document([pkg("SPDXRef-example", [purlRef("invalid")])]),
    document([pkg("SPDXRef-example", [purlRef("pkg:npm/example@invalid")])]),
  ]) assert.throws(() => enrichSpdx(input, [rule]), SpdxError);
});

test("SPDX file enrichment reads all active registries, including ecosystems absent from check", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-spdx-"));
  try {
    const path = join(root, "spdx.json");
    await writeFile(path, JSON.stringify(document([
      pkg("SPDXRef-example", [purlRef("pkg:cargo/example@1.0.0")]),
    ])));
    const paths: string[] = [];
    const data = { async read(path: string) {
      paths.push(path);
      const ecosystem = path.slice("registry/".length, -".json".length);
      return { schemaVersion: "evergreen.registry.v2", ecosystem,
        rules: ecosystem === "rust" ? [{ ...rule, ecosystem, purl: "pkg:cargo/example", vers: "vers:cargo/<2.0.0" }] : [] };
    } } as ActiveData;
    const result = await enrichSpdxFile(path, data);
    assert.deepEqual(paths, BUNDLED_ECOSYSTEMS.map((ecosystem) => `registry/${ecosystem}.json`));
    assert.deepEqual(packages(result)[0]!.annotations, [{
      annotationDate: "2026-01-01T00:00:00Z", annotationType: "OTHER",
      annotator: "Tool: evergreen", comment: endOfLife,
    }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI prints schema-valid enriched SPDX JSON deterministically and leaves the source file intact", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-spdx-cli-"));
  try {
    const path = join(root, "spdx.json");
    const original = JSON.stringify(document([
      pkg("SPDXRef-nodejs", [purlRef("pkg:generic/nodejs@20.0.0")]),
    ]));
    await writeFile(path, original);
    const args = [resolve("dist/src/cli.js"), "sbom", "enrich", path, "--data-version", "bundled"];
    const first = await execute(process.execPath, args);
    assert.equal(first.stderr, "");
    assert.equal(first.stdout, (await execute(process.execPath, args)).stdout);
    assert.equal(await readFile(path, "utf8"), original);
    const result = JSON.parse(first.stdout);
    assert.ok(validate(result), JSON.stringify(validate.errors));
    assert.deepEqual(packages(result)[0]!.annotations, [{
      annotationDate: "2026-04-30T00:00:00Z", annotationType: "OTHER",
      annotator: "Tool: evergreen",
      comment: "evergreen:lifecycle:milestone:endOfLife:2026-04-30",
    }]);
    assert.ok((packages(result)[0]!.externalRefs as unknown[]).length > 1);
    await writeFile(path, first.stdout);
    assert.equal((await execute(process.execPath, args)).stdout, first.stdout);
    for (const content of [JSON.stringify({ spdxVersion: "SPDX-2.2" }),
      JSON.stringify(document([pkg("SPDXRef-bad", [purlRef("bad")])]))]) {
      await writeFile(path, content);
      await assert.rejects(execute(process.execPath, args), (error: unknown) => {
        const failure = error as { code: number; stdout: string; stderr: string };
        assert.equal(failure.code, 4);
        assert.equal(failure.stdout, "");
        assert.match(failure.stderr, /SPDX|Cannot match package/);
        return true;
      });
      assert.equal(await readFile(path, "utf8"), content);
    }
    await assert.rejects(enrichSpdxFile(join(root, "missing.json")), SpdxError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

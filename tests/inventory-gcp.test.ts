import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";

import { gcpImporter } from "../src/inventory/gcp.js";
import { parseExport, runInventory } from "../src/inventory/index.js";
import type { InventoryItem } from "../src/inventory/types.js";
import { runCli } from "./cli-runner.js";

const FIXTURES = resolve("tests/fixtures/inventory");
const GCP = join(FIXTURES, "gcp");
const DOCUMENTS = ["app-engine-versions.json", "cloud-run-services.json", "functions.json", "gke-clusters.json"];

/** Resolves an RFC 6901 JSON Pointer against a parsed document. */
function resolvePointer(document: unknown, pointer: string): unknown {
  let value: unknown = document;
  for (const raw of pointer.split("/").slice(1)) {
    const segment = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(value)) value = value[Number(segment)];
    else if (typeof value === "object" && value !== null) value = (value as Record<string, unknown>)[segment];
    else return undefined;
  }
  return value;
}

async function fixtureFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await fixtureFiles(path)));
    else if (entry.name.endsWith(".json")) files.push(path);
  }
  return files;
}

async function itemsOf(name: string): Promise<InventoryItem[]> {
  const file = join(GCP, name);
  return gcpImporter.items(parseExport(await readFile(file, "utf8")), file);
}

async function invokeCli(...args: string[]) {
  return runCli(args);
}

test("every Google Cloud document type is detected and produces items whose pointers resolve", async () => {
  for (const name of DOCUMENTS) {
    const file = join(GCP, name);
    const document = parseExport(await readFile(file, "utf8"));
    assert.equal(gcpImporter.detect(document, file), true, name);
    const items = gcpImporter.items(document, file);
    assert.ok(items.length > 0, name);
    for (const item of items) {
      assert.equal(item.importer, "gcp");
      assert.equal(item.file, file);
      assert.match(item.purl, /^pkg:/);
      const value = resolvePointer(document, item.pointer);
      assert.equal(typeof value, "string", `${name} ${item.pointer}`);
      if (item.purl.startsWith("pkg:docker/")) {
        // The pointer names the image reference; the version is its tag.
        assert.ok((value as string).endsWith(`:${item.version ?? ""}`), `${name} ${item.pointer} ${String(value)}`);
      } else if (item.version === undefined) {
        // A runtime ID is part of the PURL rather than the version, and the pointer marks where it was read.
        assert.ok(item.purl.endsWith(`/${value as string}`), `${name} ${item.pointer} ${item.purl}`);
      } else {
        assert.equal(value, item.version, `${name} ${item.pointer}`);
      }
    }
  }
});

test("Cloud Functions reads runtime for both generations and buildConfig.runtime for the second", async () => {
  const items = await itemsOf("functions.json");
  assert.deepEqual(
    items.map((item) => [item.pointer, item.resource, item.purl]),
    [
      ["/0/runtime", "legacy-thumbnail", "pkg:generic/google-cloud-functions-runtime/nodejs14"],
      ["/1/buildConfig/runtime", "billing-report", "pkg:generic/google-cloud-functions-runtime/nodejs16"],
      ["/2/buildConfig/runtime", "audit-export", "pkg:generic/google-cloud-functions-runtime/python312"],
      ["/3/runtime", "image-resize", "pkg:generic/google-cloud-functions-runtime/go121"],
      ["/4/buildConfig/runtime", "healthy-api", "pkg:generic/google-cloud-functions-runtime/nodejs24"],
    ],
  );
});

test("App Engine reads each version's runtime and names the version, not the project", async () => {
  const items = await itemsOf("app-engine-versions.json");
  assert.deepEqual(
    items.map((item) => [item.pointer, item.resource, item.purl]),
    [
      ["/0/runtime", "v2", "pkg:generic/google-appengine-runtime/python38"],
      ["/1/runtime", "v1", "pkg:generic/google-appengine-runtime/python312"],
      ["/2/runtime", "v3", "pkg:generic/google-appengine-runtime/nodejs18"],
    ],
  );
});

test("GKE reports the control plane and, when it differs, the node version", async () => {
  const items = await itemsOf("gke-clusters.json");
  assert.deepEqual(
    items.map((item) => [item.pointer, item.resource, item.version]),
    [
      ["/0/currentMasterVersion", "analytics", "1.29.7-gke.1000"],
      ["/0/currentNodeVersion", "analytics", "1.28.15-gke.100"],
      ["/1/currentMasterVersion", "checkout", "1.32.3-gke.1200"],
      ["/2/currentMasterVersion", "web", "1.35.1-gke.100"],
      ["/2/currentNodeVersion", "web", "1.34.2-gke.100"],
      ["/3/currentMasterVersion", "payments", "1.33.4-gke.900"],
    ],
  );
});

test("Cloud Run reads public base images only, and keeps every container of a service", async () => {
  const items = await itemsOf("cloud-run-services.json");
  assert.deepEqual(
    items.map((item) => [item.pointer, item.resource, item.purl, item.version]),
    [
      ["/0/spec/template/spec/containers/0/image", "invoice-api", "pkg:docker/library/node", "20.15.0"],
      ["/1/spec/template/spec/containers/0/image", "reporting", "pkg:docker/library/python", "3.8-slim"],
      ["/6/spec/template/spec/containers/0/image", "multi-container", "pkg:docker/library/redis", "6.2"],
      ["/6/spec/template/spec/containers/1/image", "multi-container", "pkg:docker/library/alpine", "3.20"],
    ],
  );
});

test("the Google Cloud rules give each document type a verdict against the bundled registries", async () => {
  const report = await runInventory(DOCUMENTS.map((name) => join(GCP, name)));
  const find = (name: string, pointer: string) => {
    const file = join(GCP, name);
    const result = report.results.find((entry) => entry.item.file === file && entry.item.pointer === pointer);
    assert.ok(result, `${name} ${pointer}`);
    return result.check;
  };
  assert.equal(find("functions.json", "/0/runtime").status, "affected");
  assert.equal(find("functions.json", "/1/buildConfig/runtime").status, "affected");
  assert.equal(find("functions.json", "/2/buildConfig/runtime").status, "no-data");
  assert.equal(find("app-engine-versions.json", "/0/runtime").status, "affected");
  assert.equal(find("app-engine-versions.json", "/1/runtime").status, "no-data");
  assert.equal(find("gke-clusters.json", "/0/currentMasterVersion").severity, "high");
  assert.equal(find("gke-clusters.json", "/1/currentMasterVersion").severity, "medium");
  assert.equal(find("gke-clusters.json", "/2/currentMasterVersion").status, "not-affected");
  assert.equal(find("cloud-run-services.json", "/0/spec/template/spec/containers/0/image").status, "affected");
});

test("detection rejects every other importer's fixtures", async () => {
  for (const file of await fixtureFiles(FIXTURES)) {
    const document = parseExport(await readFile(file, "utf8"));
    assert.equal(gcpImporter.detect(document, file), file.startsWith(`${GCP}${sep}`), file);
  }
});

test("output never contains a project id, number, service account, URL, IP address, or environment value", async () => {
  const files = DOCUMENTS.map((name) => join(GCP, name));
  const identifiers = ["evergreen-demo-427819", "427819", "s3cr3t-token", "10.128.0.42", "iam.gserviceaccount.com", "cloudfunctions.net", "a.run.app", "appspot.com", "container.googleapis.com"];
  for (const extra of [[], ["--json"]]) {
    const result = await invokeCli("inventory", ...files, ...extra);
    assert.equal(result.code, 1);
    for (const identifier of identifiers) assert.ok(!result.stdout.includes(identifier), `${identifier} leaked${extra.length > 0 ? " in JSON" : " in text"}`);
  }
});

test("--redact hides every resource name in text and JSON output", async () => {
  const files = DOCUMENTS.map((name) => join(GCP, name));
  const resources = ["legacy-thumbnail", "billing-report", "audit-export", "image-resize", "healthy-api", "invoice-api", "reporting", "multi-container", "analytics", "checkout", "payments"];
  for (const extra of [[], ["--json"]]) {
    const result = await invokeCli("inventory", ...files, "--redact", ...extra);
    assert.equal(result.code, 1);
    for (const resource of resources) assert.ok(!result.stdout.includes(resource), `${resource} leaked${extra.length > 0 ? " in JSON" : " in text"}`);
    assert.match(result.stdout, /[0-9a-f]{12}/);
  }
});

test("the examples report an affected Google Cloud resource and exit 1", async () => {
  for (const file of ["examples/inventory/gcp-functions.json", "examples/inventory/gke-clusters.json"]) {
    const result = await invokeCli("inventory", file, "--json");
    assert.equal(result.code, 1, file);
    const report = JSON.parse(result.stdout) as { results: Array<{ check: { status: string } }> };
    assert.ok(report.results.some((entry) => entry.check.status === "affected"), file);
  }
});

test("--format gcp still detects the format, and an unknown importer exits 2", async () => {
  const file = join(GCP, "functions.json");
  const forced = await invokeCli("inventory", file, "--format", "gcp", "--json");
  assert.equal(forced.code, 1);
  assert.ok((JSON.parse(forced.stdout) as { results: unknown[] }).results.length > 0);
  const bad = await invokeCli("inventory", file, "--format", "nope");
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /Unknown importer for --format: nope/);
});

import assert from "node:assert/strict";
import { glob, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { dockerInventoryImporter } from "../src/inventory/docker.js";
import { inventoryImporters, parseExport, runInventory } from "../src/inventory/index.js";
import type { InventoryItem } from "../src/inventory/types.js";

const fixtures = resolve("tests/fixtures/inventory/docker");
const inspectPath = resolve(fixtures, "inspect.json");
const composeLinesPath = resolve(fixtures, "compose-ps.json");
const composeArrayPath = resolve(fixtures, "compose-array.json");
const idOnlyPath = resolve(fixtures, "id-only.json");

async function load(path: string): Promise<unknown> {
  return parseExport(await readFile(path, "utf8"));
}

/** The document a pointer indexes: line-delimited exports are read as an array of their lines. */
async function pointerDocument(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf8");
  const parsed = parseExport(raw);
  if (typeof parsed !== "string") return parsed;
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

function resolvePointer(document: unknown, pointer: string): unknown {
  if (pointer === "") return document;
  let current = document;
  for (const raw of pointer.split("/").slice(1)) {
    const token = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(current)) current = current[Number(token)];
    else if (typeof current === "object" && current !== null) current = (current as Record<string, unknown>)[token];
    else return undefined;
  }
  return current;
}

test("detect recognizes both Docker formats and rejects everything else", async () => {
  assert.equal(dockerInventoryImporter.detect(await load(inspectPath), inspectPath), true);
  assert.equal(dockerInventoryImporter.detect(await load(composeLinesPath), composeLinesPath), true);
  assert.equal(dockerInventoryImporter.detect(await load(composeArrayPath), composeArrayPath), true);

  for (const other of [
    [],
    {},
    "NAME=debian\nVERSION_ID=11\n",
    [{ Service: "api" }],
    [{ Service: "api", Image: 3 }],
    [{ Id: "abc", Config: { Image: "node:18" }, State: "running" }],
    [{ items: ["alpha"] }],
  ]) {
    assert.equal(dockerInventoryImporter.detect(other, "other.json"), false, JSON.stringify(other));
  }
});

test("inspect items read the container name, image, and OCI base labels only", async () => {
  const document = await load(inspectPath);
  const items = dockerInventoryImporter.items(document, inspectPath);
  assert.deepEqual(
    items.map((item) => [item.resource, item.pointer, item.purl, item.version]),
    [
      ["web", "/0/Config/Image", "pkg:docker/library/node", "18-alpine"],
      ["cache", "/1/Config/Image", "pkg:docker/library/redis", "6.0"],
      ["app", "/2/Config/Image", "pkg:docker/ghcr.io/acme/app", "1.0.0"],
      ["labeled", "/3/Config/Image", "pkg:docker/acme/worker", undefined],
      ["labeled", "/3/Config/Labels/org.opencontainers.image.base.name", "pkg:docker/library/node", "20"],
      ["labeled", "/3/Config/Labels/org.opencontainers.image.version", "pkg:docker/acme/worker", "20.11.1"],
    ],
  );
});

test("line-delimited compose output is read one object per line", async () => {
  const items = dockerInventoryImporter.items(await load(composeLinesPath), composeLinesPath);
  assert.deepEqual(
    items.map((item) => [item.resource, item.pointer, item.purl, item.version]),
    [
      ["api", "/0/Image", "pkg:docker/library/node", "18-alpine"],
      ["worker", "/1/Image", "pkg:docker/library/redis", "7.2"],
    ],
  );
});

test("runInventory reports affected containers, base images, and no-data ids", async () => {
  const report = await runInventory([inspectPath, composeLinesPath, composeArrayPath, idOnlyPath]);
  assert.equal(report.schemaVersion, "evergreen.inventory.v1");
  assert.deepEqual(report.unrecognized, []);

  const find = (resource: string, pointer: string) =>
    report.results.find((result) => result.item.resource === resource && result.item.pointer === pointer);

  const web = find("web", "/0/Config/Image");
  assert.equal(web?.check.status, "affected");
  assert.equal(web?.check.findings[0]?.ruleId, "container.node.eol-21-and-older");
  assert.equal(web?.check.purl, "pkg:docker/library/node");

  const cache = find("cache", "/1/Config/Image");
  assert.equal(cache?.check.status, "affected");
  assert.equal(cache?.check.findings[0]?.ruleId, "container.redis.eol-6.0-and-older");

  const app = find("app", "/2/Config/Image");
  assert.equal(app?.check.status, "no-data");
  assert.deepEqual(app?.check.findings, []);

  const base = find("labeled", "/3/Config/Labels/org.opencontainers.image.base.name");
  assert.equal(base?.check.status, "affected");
  assert.equal(base?.check.purl, "pkg:docker/library/node");
  assert.equal(base?.item.version, "20");

  const labelVersion = find("labeled", "/3/Config/Labels/org.opencontainers.image.version");
  assert.equal(labelVersion?.check.status, "no-data");
  assert.equal(labelVersion?.item.purl, "pkg:docker/acme/worker");
  assert.equal(labelVersion?.item.version, "20.11.1");

  const composeApi = find("api", "/0/Image");
  assert.equal(composeApi?.check.status, "affected");

  const composeWorker = find("worker", "/1/Image");
  assert.equal(composeWorker?.check.status, "not-affected");

  const composeDb = find("db", "/1/Image");
  assert.equal(composeDb?.check.status, "affected");

  const pinned = find("pinned", "/0/Config/Image");
  assert.equal(pinned?.check.status, "no-data");
  assert.equal(pinned?.item.purl, "pkg:docker/image-id");
  assert.equal(pinned?.item.version, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
});

test("environment variables, mounts, and addresses never appear in the output", async () => {
  const report = await runInventory([inspectPath, composeLinesPath, composeArrayPath, idOnlyPath]);
  const output = JSON.stringify(report);
  for (const secret of [
    "supersecret-should-not-appear",
    "another-secret-should-not-appear",
    "yet-another-secret-should-not-appear",
    "private-should-not-appear",
    "API_TOKEN",
    "REDIS_PASSWORD",
    "SECRET_TOKEN",
    "Mounts",
    "NetworkSettings",
    "10.0.0.5",
    "10.0.0.6",
    "10.0.0.7",
  ]) {
    assert.equal(output.includes(secret), false, secret);
  }
});

test("every pointer resolves, and names the value the item uses", async () => {
  for (const path of [inspectPath, composeLinesPath, composeArrayPath, idOnlyPath]) {
    const document = await load(path);
    const pointerBase = await pointerDocument(path);
    const items: InventoryItem[] = dockerInventoryImporter.items(document, path);
    assert.ok(items.length > 0, path);
    for (const item of items) {
      const value = resolvePointer(pointerBase, item.pointer);
      assert.equal(typeof value, "string", `${path} ${item.pointer}`);
      if (item.version === undefined) continue;
      if (item.pointer.endsWith("/org.opencontainers.image.version") || item.version.startsWith("sha256:")) {
        assert.equal(value, item.version, `${path} ${item.pointer}`);
      } else {
        assert.ok(
          String(value).includes(item.version),
          `${path} ${item.pointer} names ${String(value)}, not ${item.version}`,
        );
      }
    }
  }
});

test("docker is registered, so the default run picks it", async () => {
  assert.ok(inventoryImporters.some((importer) => importer.id === "docker"));
  const report = await runInventory([inspectPath], undefined, "docker");
  assert.ok(report.results.length > 0);
});

test("docker detect rejects every other importer's fixture", async () => {
  for await (const file of glob("tests/fixtures/inventory/**/*", { cwd: process.cwd() })) {
    if (file.replaceAll("\\", "/").startsWith("tests/fixtures/inventory/docker/")) continue;
    if (!(await stat(resolve(file))).isFile()) continue;
    const raw = await readFile(resolve(file), "utf8");
    assert.equal(dockerInventoryImporter.detect(parseExport(raw), file), false, file);
  }
});

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";

import { awsRdsImporter } from "../src/inventory/aws-rds.js";
import { runInventory } from "../src/inventory/index.js";
import { redactReport } from "../src/inventory/command.js";
import type { InventoryItem, InventoryReport } from "../src/inventory/types.js";

const fixtures = resolve("tests/fixtures/inventory/aws-rds");
const instances = join(fixtures, "describe-db-instances.json");
const clusters = join(fixtures, "describe-db-clusters.json");
const caches = join(fixtures, "describe-cache-clusters.json");
const files = [instances, clusters, caches];

async function readJson<T = unknown>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function resolvePointer(document: unknown, pointer: string): unknown {
  assert.ok(pointer.startsWith("/"), `not a JSON pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split("/")
    .reduce<unknown>((value, token) => {
      const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
      if (Array.isArray(value)) return value[Number(key)];
      if (typeof value === "object" && value !== null) return (value as Record<string, unknown>)[key];
      return undefined;
    }, document);
}

function resultsFor(report: InventoryReport, resource: string) {
  return report.results.filter((result) => result.item.resource === resource);
}

test("detect accepts the three AWS CLI documents and rejects anything else", async () => {
  for (const file of files) assert.equal(awsRdsImporter.detect(await readJson(file), file), true, file);
  for (const document of [
    {},
    [],
    "text",
    null,
    { DBInstances: "nope" },
    { DBInstances: [1] },
    { Functions: [] },
    { Clusters: [] },
  ]) {
    assert.equal(awsRdsImporter.detect(document, "other.json"), false, JSON.stringify(document));
  }
});

async function jsonFilesUnder(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await jsonFilesUnder(path)));
    else if (entry.name.endsWith(".json")) found.push(path);
  }
  return found;
}

test("detect rejects every other importer's fixture under tests/fixtures/inventory", async () => {
  for (const path of await jsonFilesUnder(resolve("tests/fixtures/inventory"))) {
    if (path.startsWith(fixtures + sep)) continue;
    const document = await readJson(path).catch(() => undefined);
    assert.equal(awsRdsImporter.detect(document, path), false, path);
  }
});

test("items read Engine, EngineVersion, and the resource name, and skip unknown engines", async () => {
  const document = await readJson(instances);
  const items = awsRdsImporter.items(document, instances);
  assert.deepEqual(
    [...new Set(items.map((item) => item.resource))],
    ["prod-orders-pg12", "prod-orders-pg14", "prod-billing-mysql80", "legacy-reports-mysql57"],
  );
  assert.ok(items.every((item) => item.importer === "aws-rds"));
  assert.ok(items.every((item) => item.pointer.endsWith("/EngineVersion")));
  assert.equal(resolvePointer(document, items[0]!.pointer), "12.22");
  for (const item of items) assert.equal(resolvePointer(document, item.pointer), item.version);
});

test("each recognized object reports the provider and upstream views", async () => {
  const report = await runInventory(files);
  const pg12 = resultsFor(report, "prod-orders-pg12");
  assert.deepEqual(pg12.map((result) => result.item.purl).sort(), [
    "pkg:generic/aws-rds/postgres",
    "pkg:generic/postgresql",
  ]);
  assert.deepEqual(
    pg12.map((result) => result.check.status),
    ["affected", "affected"],
  );
  assert.ok(pg12.some((result) => /for a fee/.test(result.check.findings[0]!.summary)));

  const aurora = resultsFor(report, "prod-analytics-aurora-pg13");
  assert.deepEqual(aurora.map((result) => result.item.purl).sort(), [
    "pkg:generic/aws-aurora/postgresql",
    "pkg:generic/postgresql",
  ]);
  assert.ok(aurora.every((result) => result.check.status === "affected"));

  const mysql = resultsFor(report, "prod-billing-mysql80");
  assert.deepEqual(mysql.map((result) => result.item.purl).sort(), ["pkg:generic/aws-rds/mysql", "pkg:generic/mysql"]);
  assert.ok(mysql.every((result) => result.check.status === "affected"));
});

test("a scheduled rule is low severity and carries the announced date", async () => {
  const report = await runInventory([instances]);
  const pg14 = resultsFor(report, "prod-orders-pg14");
  assert.equal(pg14.length, 2);
  for (const result of pg14) {
    assert.equal(result.check.status, "affected");
    assert.equal(result.check.severity, "low");
    assert.equal(result.check.findings[0]!.event, "scheduled-end-of-life");
    assert.ok(result.check.findings[0]!.deadline);
  }
});

test("Aurora MySQL reports only its Aurora item, and an uncovered version is not called safe", async () => {
  const report = await runInventory([clusters]);
  const auroraMysql = resultsFor(report, "prod-sessions-aurora-mysql3");
  assert.equal(auroraMysql.length, 1);
  assert.equal(auroraMysql[0]!.item.purl, "pkg:generic/aws-aurora/mysql");
  assert.equal(auroraMysql[0]!.item.version, "8.0.mysql_aurora.3.10.0");
  assert.equal(auroraMysql[0]!.check.status, "not-affected");
  assert.match(auroraMysql[0]!.check.message, /none applies to this version/);
});

test("ElastiCache maps Redis and skips Memcached", async () => {
  const report = await runInventory([caches]);
  assert.ok(
    resultsFor(report, "sessions-redis6").some(
      (result) => result.item.purl === "pkg:generic/aws-elasticache/redis" && result.check.status === "affected",
    ),
  );
  const redis7 = resultsFor(report, "feature-flags-redis7");
  assert.ok(
    redis7.some(
      (result) => result.item.purl === "pkg:generic/aws-elasticache/redis" && result.check.status === "not-affected",
    ),
  );
  assert.ok(
    redis7.some((result) => result.item.purl === "pkg:generic/redis" && result.check.status === "not-affected"),
  );
  assert.deepEqual(resultsFor(report, "page-cache-memcached"), []);
});

test("every pointer resolves to the item's version in its fixture", async () => {
  const report = await runInventory(files);
  assert.ok(report.results.length > 0);
  for (const result of report.results) {
    const document = await readJson(result.item.file);
    assert.equal(
      resolvePointer(document, result.item.pointer),
      result.item.version,
      `${result.item.file} ${result.item.pointer}`,
    );
  }
});

test("the report never contains account ids, ARNs, endpoints, or network identifiers", async () => {
  const report = await runInventory(files);
  const json = JSON.stringify(report);
  for (const secret of [
    "123456789012",
    "arn:aws:",
    ".rds.amazonaws.com",
    ".cache.amazonaws.com",
    "subnet-0a1b2c3d4e5f67890",
    "vpc-0123456789abcdef0",
    "sg-0123456789abcdef0",
  ]) {
    assert.ok(!json.includes(secret), `the report contains ${secret}`);
  }
  assert.ok(json.includes("prod-orders-pg12"));
});

test("--redact removes the fixture's resource names from the report", async () => {
  const report = await runInventory(files);
  const redacted = redactReport(report);
  const json = JSON.stringify(redacted);
  for (const resource of [
    "prod-orders-pg12",
    "prod-billing-mysql80",
    "sessions-redis6",
    "prod-analytics-aurora-pg13",
  ]) {
    assert.ok(!json.includes(resource), `the redacted report contains ${resource}`);
  }
  for (const result of redacted.results) assert.match(result.item.resource, /^[0-9a-f]{12}$/);
  assert.equal(redacted.results.length, report.results.length);
});

test("items returns a stable shape for the same document", async () => {
  const document = await readJson(instances);
  const first: InventoryItem[] = awsRdsImporter.items(document, instances);
  const second: InventoryItem[] = awsRdsImporter.items(document, instances);
  assert.deepEqual(first, second);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, parseDatabaseCompose } from "../src/detectors/database/parse-compose.js";
import { MAXIMUM_INPUT_BYTES as MAXIMUM_TERRAFORM_BYTES, parseDatabaseTerraform } from "../src/detectors/database/parse-terraform.js";

const fixtures = resolve("tests/fixtures/database");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

test("parses database image tags from compose with exact lines", async () => {
  assert.deepEqual(parseDatabaseCompose(await fixture("positive/compose.yaml")), [
    { product: "postgres", value: "12", line: 3 },
    { product: "mysql", value: "5.7", line: 7 },
  ]);
  assert.deepEqual(parseDatabaseCompose(await fixture("zero/compose.yaml")), [
    { product: "postgres", value: "17", line: 3 },
    { product: "mysql", value: "8.4", line: 7 },
  ]);
});

test("ignores comments, variables, labels, extension keys, and unrelated images", async () => {
  assert.deepEqual(parseDatabaseCompose(await fixture("negative/compose.yaml")), []);
});

test("returns nothing for malformed compose", async () => {
  assert.deepEqual(parseDatabaseCompose(await fixture("malformed/compose.yaml")), []);
  assert.deepEqual(parseDatabaseCompose(""), []);
  assert.deepEqual(parseDatabaseCompose("- postgres:12\n"), []);
});

test("reads mariadb, redis, and mongo and keeps qualified tags as written", () => {
  const contents = `services:
  a:
    image: mariadb:10.5
  b:
    image: docker.io/library/redis:6.2-alpine
  c:
    image: 'mongo:4.4'
`;
  assert.deepEqual(parseDatabaseCompose(contents), [
    { product: "mariadb", value: "10.5", line: 3 },
    { product: "redis", value: "6.2-alpine", line: 5 },
    { product: "mongo", value: "4.4", line: 7 },
  ]);
});

test("skips untagged, digest-only, other-registry, and lookalike images", () => {
  const contents = `services:
  a:
    image: postgres
  b:
    image: postgres@sha256:${"a".repeat(64)}
  c:
    image: ghcr.io/acme/postgres:12
  d:
    image: bitnami/postgresql:12
  e:
    image: acme/redis:6
  f:
    image: postgres-exporter:12
  g:
    image: \${DB_IMAGE:-postgres:12}
`;
  assert.deepEqual(parseDatabaseCompose(contents), []);
});

test("returns nothing for aliases and oversized input", () => {
  assert.deepEqual(
    parseDatabaseCompose("services:\n  a: &a\n    image: postgres:12\n  b: *a\n"),
    [],
  );
  const padding = "# ".padEnd(MAXIMUM_INPUT_BYTES + 1, "x");
  assert.deepEqual(parseDatabaseCompose(`${padding}\nservices:\n  a:\n    image: postgres:12\n`), []);
});

test("parses engine_version on managed database resources with exact lines", async () => {
  assert.deepEqual(parseDatabaseTerraform(await fixture("positive/main.tf")), [
    { resource: "aws_db_instance", name: "orders", engine: "postgres", value: "12.22", line: 4 },
  ]);
  assert.deepEqual(parseDatabaseTerraform(await fixture("zero/main.tf")), [
    { resource: "aws_db_instance", name: "orders", engine: "postgres", value: "17.4", line: 4 },
    { resource: "aws_db_instance", name: "catalog", engine: "mysql", value: "8.4.3", line: 12 },
  ]);
});

test("ignores comments, variables, interpolations, parameter groups, and tags", async () => {
  assert.deepEqual(parseDatabaseTerraform(await fixture("negative/main.tf")), []);
});

test("returns nothing for malformed terraform", async () => {
  assert.deepEqual(parseDatabaseTerraform(await fixture("malformed/main.tf")), []);
  assert.deepEqual(parseDatabaseTerraform('resource "aws_db_instance" "a" {\n  engine = "postgres"\n'), []);
  assert.deepEqual(parseDatabaseTerraform(""), []);
});

test("reads attributes in any order, other resource types, and trailing comments", () => {
  const contents = `resource "aws_db_instance" "a" {
  engine_version = "10.5" # old
  engine         = "mariadb"
}
resource "aws_rds_cluster" "b" {
  engine         = "mysql"
  engine_version = "5.7.44"
}
resource "aws_elasticache_replication_group" "c" {
  engine         = "redis"
  engine_version = "6.2"
}
`;
  assert.deepEqual(parseDatabaseTerraform(contents), [
    { resource: "aws_db_instance", name: "a", engine: "mariadb", value: "10.5", line: 2 },
    { resource: "aws_rds_cluster", name: "b", engine: "mysql", value: "5.7.44", line: 7 },
    { resource: "aws_elasticache_replication_group", name: "c", engine: "redis", value: "6.2", line: 11 },
  ]);
});

test("skips unknown engines, mismatched engines, missing engine, and data or module blocks", () => {
  for (const body of [
    'resource "aws_db_instance" "a" {\n  engine = "oracle-ee"\n  engine_version = "19"\n}\n',
    'resource "aws_db_instance" "a" {\n  engine = "aurora-postgresql"\n  engine_version = "13.7"\n}\n',
    'resource "aws_db_instance" "a" {\n  engine = "redis"\n  engine_version = "6.2"\n}\n',
    'resource "aws_db_instance" "a" {\n  engine_version = "12.22"\n}\n',
    'data "aws_db_instance" "a" {\n  engine = "postgres"\n  engine_version = "12.22"\n}\n',
    'module "db" {\n  engine = "postgres"\n  engine_version = "12.22"\n}\n',
    'resource "aws_db_instance" {\n  engine = "postgres"\n  engine_version = "12.22"\n}\n',
    'resource "aws_db_instance" "a" {\n  engine = "postgres"\n  engine_version = ""\n}\n',
    'resource "aws_db_instance" "a" {\n  engine = "postgres"\n  engine_version = format("%s", "12")\n}\n',
    'resource "aws_db_instance" "a" {\n  tags = {\n    engine = "postgres"\n    engine_version = "12.22"\n  }\n}\n',
  ]) {
    assert.deepEqual(parseDatabaseTerraform(body), [], body);
  }
});

test("supports CRLF and a byte order mark, and bounds oversized input", () => {
  const contents = '\uFEFFresource "aws_db_instance" "a" {\r\n  engine = "postgres"\r\n  engine_version = "12.22"\r\n}\r\n';
  assert.deepEqual(parseDatabaseTerraform(contents), [
    { resource: "aws_db_instance", name: "a", engine: "postgres", value: "12.22", line: 3 },
  ]);
  const padding = "# ".padEnd(MAXIMUM_TERRAFORM_BYTES + 1, "x");
  assert.deepEqual(parseDatabaseTerraform(`${padding}\n${contents}`), []);
});

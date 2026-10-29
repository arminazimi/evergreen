import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, parseDatabaseCompose } from "../src/detectors/database/parse-compose.js";
import { MAXIMUM_INPUT_BYTES as MAXIMUM_TERRAFORM_BYTES, parseDatabaseTerraform } from "../src/detectors/database/parse-terraform.js";
import type { DatabaseEngineVersionDeclaration, DatabaseTerraformUnclassified } from "../src/detectors/database/parse-terraform.js";

const fixtures = resolve("tests/fixtures/database");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

function parsed(
  declarations: DatabaseEngineVersionDeclaration[] = [],
  unclassified: DatabaseTerraformUnclassified[] = [],
): ReturnType<typeof parseDatabaseTerraform> {
  return { declarations, unclassified };
}

test("parses database image tags from compose with exact lines", async () => {
  assert.deepEqual(parseDatabaseCompose(await fixture("positive/compose.yaml")), [
    { product: "postgres", value: "12", line: 3 },
    { product: "mysql", value: "5.7", line: 7 },
    { product: "redis", value: "7.0", line: 11 },
  ]);
  assert.deepEqual(parseDatabaseCompose(await fixture("zero/compose.yaml")), [
    { product: "postgres", value: "17", line: 3 },
    { product: "mysql", value: "8.4", line: 7 },
    { product: "redis", value: "7.4", line: 11 },
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
  assert.deepEqual(parseDatabaseTerraform(await fixture("positive/main.tf")), parsed([
    { resource: "aws_db_instance", name: "orders", engine: "postgres", product: "postgres", value: "12.22", line: 4 },
  ]));
  assert.deepEqual(parseDatabaseTerraform(await fixture("zero/main.tf")), parsed([
    { resource: "aws_db_instance", name: "orders", engine: "postgres", product: "postgres", value: "17.4", line: 4 },
    { resource: "aws_db_instance", name: "catalog", engine: "mysql", product: "mysql", value: "8.4.3", line: 12 },
  ]));
});

test("lists variables and interpolations instead of guessing, and ignores comments, parameter groups, and tags", async () => {
  assert.deepEqual(parseDatabaseTerraform(await fixture("negative/main.tf")), parsed([], [
    { resource: "aws_db_instance", name: "orders", attribute: "engine", value: "var.db_engine", line: 4 },
    { resource: "aws_db_instance", name: "orders", attribute: "engine_version", value: "var.db_engine_version", line: 5 },
    { resource: "aws_db_instance", name: "reports", attribute: "engine_version", value: '"${local.pg_major}.22"', line: 13 },
  ]));
});

test("returns nothing for malformed terraform", async () => {
  assert.deepEqual(parseDatabaseTerraform(await fixture("malformed/main.tf")), parsed());
  assert.deepEqual(parseDatabaseTerraform('resource "aws_db_instance" "a" {\n  engine = "postgres"\n'), parsed());
  assert.deepEqual(parseDatabaseTerraform(""), parsed());
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
  assert.deepEqual(parseDatabaseTerraform(contents), parsed([
    { resource: "aws_db_instance", name: "a", engine: "mariadb", product: "mariadb", value: "10.5", line: 2 },
    { resource: "aws_rds_cluster", name: "b", engine: "mysql", product: "mysql", value: "5.7.44", line: 7 },
    { resource: "aws_elasticache_replication_group", name: "c", engine: "redis", product: "redis", value: "6.2", line: 11 },
  ]));
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
    'resource "aws_db_instance" "a" {\n  tags = {\n    engine = "postgres"\n    engine_version = "12.22"\n  }\n}\n',
  ]) {
    assert.deepEqual(parseDatabaseTerraform(body), parsed(), body);
  }
});

test("a call in a version attribute is unclassified, never evaluated", () => {
  assert.deepEqual(
    parseDatabaseTerraform('resource "aws_db_instance" "a" {\n  engine = "postgres"\n  engine_version = format("%s", "12")\n}\n'),
    parsed([], [{ resource: "aws_db_instance", name: "a", attribute: "engine_version", value: 'format("%s", "12")', line: 3 }]),
  );
});

test("reads version on Azure resources and database_version on Google Cloud SQL resources", () => {
  const contents = `resource "azurerm_postgresql_flexible_server" "pg" {
  version = "12"
}
resource "azurerm_postgresql_server" "legacy_pg" {
  version = "11"
}
resource "azurerm_mysql_flexible_server" "mysql" {
  version = "5.7"
}
resource "azurerm_mysql_server" "legacy_mysql" {
  version = "8.0"
}
resource "azurerm_mariadb_server" "maria" {
  version = "10.3"
}
resource "google_sql_database_instance" "pg" {
  database_version = "POSTGRES_9_6"
}
resource "google_sql_database_instance" "pg12" {
  database_version = "POSTGRES_12"
}
resource "google_sql_database_instance" "mysql" {
  database_version = "MYSQL_8_0"
}
resource "google_sql_source_representation_instance" "source" {
  database_version = "MYSQL_5_6"
}
`;
  assert.deepEqual(parseDatabaseTerraform(contents), parsed([
    { resource: "azurerm_postgresql_flexible_server", name: "pg", engine: "postgres", product: "azure-database-postgresql", value: "12", line: 2 },
    { resource: "azurerm_postgresql_server", name: "legacy_pg", engine: "postgres", product: "azure-database-postgresql", value: "11", line: 5 },
    { resource: "azurerm_mysql_flexible_server", name: "mysql", engine: "mysql", product: "azure-database-mysql", value: "5.7", line: 8 },
    { resource: "azurerm_mysql_server", name: "legacy_mysql", engine: "mysql", product: "azure-database-mysql", value: "8.0", line: 11 },
    { resource: "azurerm_mariadb_server", name: "maria", engine: "mariadb", product: "azure-database-mariadb", value: "10.3", line: 14 },
    { resource: "google_sql_database_instance", name: "pg", engine: "postgres", product: "google-cloud-sql-postgresql", value: "9.6", line: 17 },
    { resource: "google_sql_database_instance", name: "pg12", engine: "postgres", product: "google-cloud-sql-postgresql", value: "12", line: 20 },
    { resource: "google_sql_database_instance", name: "mysql", engine: "mysql", product: "google-cloud-sql-mysql", value: "8.0", line: 23 },
    { resource: "google_sql_source_representation_instance", name: "source", engine: "mysql", product: "google-cloud-sql-mysql", value: "5.6", line: 26 },
  ]));
});

test("lists variables and interpolations on Azure and Google Cloud SQL resources as unclassified", () => {
  const contents = `resource "azurerm_postgresql_flexible_server" "pg" {
  version = var.pg_version
}
resource "azurerm_mysql_flexible_server" "mysql" {
  version = local.mysql_version
}
resource "google_sql_database_instance" "google" {
  database_version = var.database_version
}
resource "google_sql_database_instance" "interpolated" {
  database_version = "POSTGRES_\${var.major}"
}
`;
  assert.deepEqual(parseDatabaseTerraform(contents), parsed([], [
    { resource: "azurerm_postgresql_flexible_server", name: "pg", attribute: "version", value: "var.pg_version", line: 2 },
    { resource: "azurerm_mysql_flexible_server", name: "mysql", attribute: "version", value: "local.mysql_version", line: 5 },
    { resource: "google_sql_database_instance", name: "google", attribute: "database_version", value: "var.database_version", line: 8 },
    { resource: "google_sql_database_instance", name: "interpolated", attribute: "database_version", value: '"POSTGRES_${var.major}"', line: 11 },
  ]));
});

test("ignores a version key inside a nested tags object and still reads the version after it", () => {
  const contents = `resource "azurerm_postgresql_flexible_server" "pg" {
  tags = {
    version = "oops"
  }
  version = "12"
}
`;
  assert.deepEqual(parseDatabaseTerraform(contents), parsed([
    { resource: "azurerm_postgresql_flexible_server", name: "pg", engine: "postgres", product: "azure-database-postgresql", value: "12", line: 5 },
  ]));
});

test("ignores unrelated azurerm resources and Google SQL Server database versions", () => {
  const contents = `resource "azurerm_linux_web_app" "app" {
  version = var.app_version
}
resource "google_sql_database_instance" "sqlserver" {
  database_version = "SQLSERVER_2019_STANDARD"
}
resource "google_sql_database" "db" {
  name = "orders"
}
`;
  assert.deepEqual(parseDatabaseTerraform(contents), parsed());
});

test("supports CRLF and a byte order mark, and bounds oversized input", () => {
  const contents = '\uFEFFresource "aws_db_instance" "a" {\r\n  engine = "postgres"\r\n  engine_version = "12.22"\r\n}\r\n';
  assert.deepEqual(parseDatabaseTerraform(contents), parsed([
    { resource: "aws_db_instance", name: "a", engine: "postgres", product: "postgres", value: "12.22", line: 3 },
  ]));
  const padding = "# ".padEnd(MAXIMUM_TERRAFORM_BYTES + 1, "x");
  assert.deepEqual(parseDatabaseTerraform(`${padding}\n${contents}`), parsed());
});

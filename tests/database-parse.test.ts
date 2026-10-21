import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, parseDatabaseCompose } from "../src/detectors/database/parse-compose.js";

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

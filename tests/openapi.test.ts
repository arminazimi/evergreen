import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { parse } from "yaml";

import { API_DIRECTORY, PRODUCTS_DIRECTORY, buildFiles, loadRegistries } from "../tools/build-data-api.js";

const OPENAPI_PATH = "docs/api/openapi.yaml";
const SCHEMA_REF_PREFIX =
  "https://raw.githubusercontent.com/arminazimi/evergreen/main/schemas/api-product.v1.schema.json#/$defs/";

interface OpenApiDocument {
  openapi?: string;
  paths?: Record<string, PathItem>;
}

interface PathItem {
  get?: {
    responses?: Record<
      string,
      {
        content?: Record<string, { schema?: { $ref?: string } }>;
      }
    >;
  };
}

/** Collects every `$ref` string anywhere in the parsed OpenAPI document. */
function collectRefs(value: unknown, refs: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === "$ref" && typeof item === "string") refs.push(item);
      else collectRefs(item, refs);
    }
  }
  return refs;
}

/** Maps a repository-relative generated file to the OpenAPI path that describes it. */
function openApiPathFor(filePath: string): string | undefined {
  if (filePath === `${API_DIRECTORY}/index.json`) return "/v1/index.json";
  if (filePath === `${API_DIRECTORY}/recent.json`) return "/v1/recent.json";
  const prefix = `${PRODUCTS_DIRECTORY}/`;
  if (filePath.startsWith(prefix) && filePath.endsWith(".json")) {
    return `/v1/products/{id}.json`;
  }
  return undefined;
}

function schemaRefFor(openApiPath: string): string {
  if (openApiPath === "/v1/index.json") return `${SCHEMA_REF_PREFIX}index`;
  if (openApiPath === "/v1/products/{id}.json") return `${SCHEMA_REF_PREFIX}product`;
  if (openApiPath === "/v1/recent.json") return `${SCHEMA_REF_PREFIX}recent`;
  throw new Error(`no schema mapping for ${openApiPath}`);
}

async function loadOpenApi(): Promise<OpenApiDocument> {
  return parse(await readFile(resolve(OPENAPI_PATH), "utf8")) as OpenApiDocument;
}

function responseSchemaRef(doc: OpenApiDocument, path: string): string | undefined {
  return doc.paths?.[path]?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref;
}

test("OpenAPI describes the static API and links each path to its JSON Schema", async () => {
  const doc = await loadOpenApi();
  assert.match(String(doc.openapi ?? ""), /^3\./);

  const expectedPaths = ["/v1/index.json", "/v1/products/{id}.json", "/v1/recent.json"];
  assert.deepEqual(Object.keys(doc.paths ?? {}).sort(), expectedPaths);

  for (const path of expectedPaths) {
    const ref = responseSchemaRef(doc, path);
    assert.equal(ref, schemaRefFor(path), `${path} must $ref its JSON Schema $def`);
  }

  for (const ref of collectRefs(doc)) {
    assert.ok(!ref.startsWith("."), `$ref must be absolute (got ${ref})`);
  }
});

test("every generated file path is covered by the OpenAPI description", async () => {
  const doc = await loadOpenApi();
  const openApiPaths = new Set(Object.keys(doc.paths ?? {}));

  const files = buildFiles(await loadRegistries());
  assert.ok(files.length > 0);

  const uncovered: string[] = [];
  for (const file of files) {
    const path = openApiPathFor(file.path);
    if (path === undefined || !openApiPaths.has(path)) uncovered.push(file.path);
  }
  assert.deepEqual(uncovered, [], "OpenAPI must cover every generated API file");

  // On-disk tree under docs/api/v1 must match the same coverage (committed output).
  const onDisk = [
    `${API_DIRECTORY}/index.json`,
    `${API_DIRECTORY}/recent.json`,
    ...(await readdir(resolve(PRODUCTS_DIRECTORY)))
      .filter((name) => name.endsWith(".json"))
      .map((name) => join(PRODUCTS_DIRECTORY, name).replaceAll("\\", "/")),
  ].sort();
  for (const path of onDisk) {
    const openApiPath = openApiPathFor(path);
    assert.ok(openApiPath && openApiPaths.has(openApiPath), `missing OpenAPI path for ${path}`);
  }
});

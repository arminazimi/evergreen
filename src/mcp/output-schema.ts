import { readFileSync } from "node:fs";

import { fromJsonSchema } from "@modelcontextprotocol/server";

import { findPackageFileSync } from "../package-files.js";
import { required } from "../required.js";
import { MCP_OUTPUT_SCHEMA_FILES, type McpToolName } from "./tool-names.js";

type JsonObject = Record<string, unknown>;

function readSchema(file: string): JsonObject {
  return JSON.parse(readFileSync(findPackageFileSync(`schemas/${file}`, import.meta.url), "utf8")) as JsonObject;
}

function resolvePointer(document: JsonObject, pointer: string): unknown {
  return pointer
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part).replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>((node, key) => (node as JsonObject | undefined)?.[key], document);
}

/**
 * Replaces every `$ref` to another schema file (such as `scan.v1.schema.json#/properties/findings/items`) with the
 * schema it points to. A client reads the advertised schema on its own and cannot fetch sibling files, so what the
 * server publishes must not depend on them. References inside one document (`#/$defs/...`) are kept.
 */
export function inlineSchemaReferences(node: unknown, file: string): unknown {
  if (Array.isArray(node)) return node.map((item) => inlineSchemaReferences(item, file));
  if (typeof node !== "object" || node === null) return node;
  const object = node as JsonObject;
  const reference = object.$ref;
  if (typeof reference === "string" && !reference.startsWith("#")) {
    const [target, pointer = ""] = reference.split("#");
    const schemaFile = required(target, "the referenced schema file");
    const resolved = resolvePointer(readSchema(schemaFile), pointer);
    if (resolved === undefined) throw new Error(`${file}: cannot resolve ${reference}`);
    const { $ref: _reference, ...siblings } = object;
    const inlined = inlineSchemaReferences(resolved, schemaFile) as JsonObject;
    return { ...inlined, ...(inlineSchemaReferences(siblings, file) as JsonObject) };
  }
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, inlineSchemaReferences(value, file)]));
}

/** The advertised, self-contained form of a tool's published output schema. */
export function toolOutputSchema(tool: McpToolName): JsonObject {
  const file = MCP_OUTPUT_SCHEMA_FILES[tool];
  return inlineSchemaReferences(readSchema(file), file) as JsonObject;
}

/** The advertised output schema as the MCP SDK expects it. */
export function outputSchema(tool: McpToolName) {
  return fromJsonSchema(toolOutputSchema(tool) as Parameters<typeof fromJsonSchema>[0]);
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { MCP_OUTPUT_SCHEMA_FILES, MCP_TOOL_NAMES } from "../src/mcp.js";

const docs = await readFile(resolve("docs/MCP.md"), "utf8");

test("docs/MCP.md documents every tool with its output schema", () => {
  for (const tool of MCP_TOOL_NAMES) {
    const row = docs.split("\n").find((line) => line.startsWith(`| \`${tool}\``) && line.includes("schema.json"));
    assert.ok(row, `${tool} needs a row in the tools table`);
    assert.ok(row.includes(MCP_OUTPUT_SCHEMA_FILES[tool]), `${tool} row must name ${MCP_OUTPUT_SCHEMA_FILES[tool]}`);
  }
});

test("docs/MCP.md documents the resource URIs, the prompt, and the notification the server uses", () => {
  for (const text of ["evergreen://rules/{id}", "evergreen://findings/{repository}/{id}", "`migrate-finding`", "notifications/resources/list_changed", "`resources`, `prompts`"]) {
    assert.ok(docs.includes(text), `docs/MCP.md should mention ${text}`);
  }
});

test("docs/MCP.md only links schemas that exist", async () => {
  for (const file of new Set(docs.match(/[a-z]+\.v1\.schema\.json/g))) {
    await readFile(resolve("schemas", file));
  }
});

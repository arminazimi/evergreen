import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { MCP_TOOL_NAMES } from "../src/mcp.js";

const read = (path: string) => readFile(resolve("examples/agents", path), "utf8");
const readJson = async <T>(path: string) => JSON.parse(await read(path)) as T;

const { version } = JSON.parse(await readFile(resolve("package.json"), "utf8")) as { version: string };
const packageSpec = `evergreen-deprecation@${version}`;
const serverArguments = ["--yes", "--package", packageSpec, "evergreen-mcp"];

interface Server { command: string; args: string[]; type?: string; tools?: string[]; trust?: boolean }

test("every host starts the pinned MCP server with the current package version", async () => {
  const cursor = await readJson<{ mcpServers: { evergreen: Server } }>("cursor/.cursor/mcp.json");
  const gemini = await readJson<{ mcpServers: { evergreen: Server } }>("gemini/gemini-extension.json");
  const geminiSettings = await readJson<{ mcpServers: { evergreen: Server } }>("gemini/settings.json");
  const vscode = await readJson<{ servers: { evergreen: Server } }>("copilot/.vscode/mcp.json");
  const codingAgent = await readJson<{ mcpServers: { evergreen: Server } }>("copilot/coding-agent-mcp.json");
  for (const server of [cursor.mcpServers.evergreen, gemini.mcpServers.evergreen, geminiSettings.mcpServers.evergreen, vscode.servers.evergreen, codingAgent.mcpServers.evergreen]) {
    assert.equal(server.command, "npx");
    assert.deepEqual(server.args, serverArguments);
  }
  const kilo = await readJson<{ mcp: { evergreen: { type: string; command: string[]; enabled: boolean } }; instructions: string[] }>("kilo/kilo.jsonc");
  assert.deepEqual(kilo.mcp.evergreen.command, ["npx", ...serverArguments]);
  assert.equal(kilo.mcp.evergreen.type, "local");
  assert.deepEqual(kilo.instructions, [".kilo/rules/*.md"]);
});

test("host-specific fields follow each vendor's documented format", async () => {
  assert.equal((await readJson<{ mcpServers: { evergreen: Server } }>("cursor/.cursor/mcp.json")).mcpServers.evergreen.type, "stdio");
  assert.equal((await readJson<{ servers: { evergreen: Server } }>("copilot/.vscode/mcp.json")).servers.evergreen.type, "stdio");
  const agent = (await readJson<{ mcpServers: { evergreen: Server } }>("copilot/coding-agent-mcp.json")).mcpServers.evergreen;
  assert.equal(agent.type, "local");
  assert.deepEqual([...agent.tools!].sort(), [...MCP_TOOL_NAMES].sort(), "the coding agent allowlist must name exactly the server's tools, never *");
  assert.equal((await readJson<{ mcpServers: { evergreen: Server } }>("gemini/settings.json")).mcpServers.evergreen.trust, false);
  const extension = await readJson<{ name: string; version: string; contextFileName: string }>("gemini/gemini-extension.json");
  assert.match(extension.name, /^[a-z0-9-]+$/);
  assert.equal(extension.version, version);
  assert.equal(extension.contextFileName, "GEMINI.md");
  const cursorRule = await read("cursor/.cursor/rules/evergreen.mdc");
  assert.match(cursorRule, /^---\ndescription: .+\nalwaysApply: true\n---\n/);
});

test("every host's instruction file carries the shared dependency-check text", async () => {
  const shared = (await read("dependency-check.md")).split("\n\n").slice(1).join("\n\n").trim();
  assert.ok(shared.includes("`check_dependency`"));
  for (const path of ["cursor/.cursor/rules/evergreen.mdc", "gemini/GEMINI.md", "copilot/.github/copilot-instructions.md", "kilo/.kilo/rules/evergreen.md"]) {
    assert.ok((await read(path)).includes(shared), `${path} must contain the shared instruction text`);
  }
});

test("the instruction text names only tools and CLI commands that exist", async () => {
  const text = await read("dependency-check.md");
  for (const tool of text.match(/`([a-z_]+)`/g)?.map((name) => name.slice(1, -1)).filter((name) => name.includes("_")) ?? []) {
    assert.ok((MCP_TOOL_NAMES as readonly string[]).includes(tool), `${tool} is not an MCP tool`);
  }
  assert.match(text, /npx evergreen-deprecation check <purl>/);
});

test("each host README links its vendor documentation and is honest about verification", async () => {
  for (const host of ["cursor", "gemini", "copilot", "kilo"]) {
    const readme = await read(`${host}/README.md`);
    assert.match(readme, /Documentation: .*https:\/\//, host);
    assert.match(readme, /has \*\*not\*\* been run inside a live installation of the host/, host);
    assert.match(readme, /\*\*Checked \(2026-10-18[^)]*\):\*\*.*evergreen-deprecation@0\.3\.0 evergreen-mcp/, host);
    assert.doesNotMatch(readme, /needs the `evergreen-deprecation` package to be published/, host);
  }
});

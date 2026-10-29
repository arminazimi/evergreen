import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { parse } from "yaml";

import { MCP_TOOL_NAMES } from "../src/mcp.js";

const read = async (path: string) => readFile(resolve(path), "utf8");
const readJson = async <T>(path: string): Promise<T> => JSON.parse(await read(path)) as T;

const SITE = "https://arminazimi.github.io/evergreen";
const MCP_URL = `${SITE}/.well-known/mcp.json`;
const AGENT_URL = `${SITE}/.well-known/agent.json`;

type ServerPackage = {
  registryType: string;
  registryBaseUrl: string;
  identifier: string;
  version: string;
  runtimeHint: string;
  transport: { type: string };
  packageArguments: Array<{ type: string; value: string }>;
};

type ServerJson = {
  name: string;
  title: string;
  description: string;
  version: string;
  websiteUrl: string;
  repository: { url: string; source: string };
  packages: ServerPackage[];
};

type WellKnownMcp = {
  name: string;
  title: string;
  description: string;
  version: string;
  websiteUrl: string;
  documentationUrl: string;
  repository: { url: string; source: string };
  packages: ServerPackage[];
  transport: { type: string };
  tools: Array<{ name: string; description: string }>;
};

type WellKnownAgent = {
  protocolVersion: string;
  name: string;
  description: string;
  version: string;
  url: string;
  documentationUrl: string;
  skills: Array<{ id: string; name: string; description: string; tags: string[] }>;
};

const server = await readJson<ServerJson>("server.json");
const mcp = await readJson<WellKnownMcp>("docs/.well-known/mcp.json");
const agent = await readJson<WellKnownAgent>("docs/.well-known/agent.json");

test("docs/.well-known/mcp.json stays in sync with server.json and the MCP tools", () => {
  assert.equal(mcp.name, server.name);
  assert.equal(mcp.title, server.title);
  assert.equal(mcp.description, server.description);
  assert.equal(mcp.version, server.version);
  assert.equal(mcp.websiteUrl, server.websiteUrl);
  assert.deepEqual(mcp.repository, server.repository);
  assert.deepEqual(mcp.packages, server.packages);
  assert.equal(mcp.transport.type, "stdio");
  assert.equal(mcp.packages[0]?.transport.type, "stdio");
  assert.equal(mcp.documentationUrl, `${SITE}/MCP.html`);
  assert.deepEqual(
    mcp.tools.map((tool) => tool.name),
    [...MCP_TOOL_NAMES],
  );
  for (const tool of mcp.tools) {
    assert.ok(tool.description.length >= 20, `${tool.name} needs a useful description`);
  }
});

test("docs/.well-known/agent.json describes the same skills as the MCP tools", () => {
  assert.equal(agent.name, server.title);
  assert.equal(agent.version, server.version);
  assert.equal(agent.url, server.websiteUrl);
  assert.equal(agent.documentationUrl, `${SITE}/MCP.html`);
  assert.match(agent.protocolVersion, /^\d+\.\d+(\.\d+)?$/);
  assert.ok(agent.description.includes("stdio") || agent.description.includes("MCP"));
  assert.deepEqual(
    agent.skills.map((skill) => skill.id),
    [...MCP_TOOL_NAMES],
  );
  for (const skill of agent.skills) {
    assert.ok(skill.name.length > 0);
    assert.ok(skill.description.length >= 20, `${skill.id} needs a useful description`);
    assert.ok(skill.tags.includes("mcp"), `${skill.id} should tag mcp`);
  }
});

test("Jekyll publishes the .well-known folder", async () => {
  const config = parse(await read("docs/_config.yml")) as { include?: string[] };
  assert.ok(config.include?.includes(".well-known"), "docs/_config.yml must include .well-known so Jekyll does not skip the dot folder");
});

test("llms.txt links both discovery documents", async () => {
  const index = await read("docs/llms.txt");
  assert.match(index, new RegExp(`\\[MCP discovery\\]\\(${MCP_URL.replaceAll(".", "\\.")}\\): .{10,}\\.`));
  assert.match(index, new RegExp(`\\[Agent card\\]\\(${AGENT_URL.replaceAll(".", "\\.")}\\): .{10,}\\.`));
});

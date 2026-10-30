import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { after, test } from "node:test";

import { InMemoryTransport } from "@modelcontextprotocol/server";

import { createEvergreenMcpServer, MCP_TOOL_ANNOTATIONS, MCP_TOOL_NAMES } from "../src/mcp.js";

interface RpcResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-mcp-readonly-"));
  temporaryRoots.push(root);
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".github", "workflows", "ci.yml"), "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", version: "1.0.0", dependencies: { request: "2.88.2" } }, null, 2),
  );
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "index.js"), "const request = require('request');\nmodule.exports = request;\n");
  await writeFile(join(root, "evergreen-baseline.json"), JSON.stringify({ schemaVersion: "evergreen.baseline.v1", findings: [] }));
  return root;
}

/** Every path under `root` with its type, size, modification time, and content hash. */
async function snapshot(root: string): Promise<string[]> {
  const entries: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const info = await stat(path);
      const name = relative(root, path);
      if (entry.isDirectory()) {
        entries.push(`dir ${name} ${info.mtimeMs}`);
        await walk(path);
      } else {
        const digest = createHash("sha256").update(await readFile(path)).digest("hex");
        entries.push(`file ${name} ${info.size} ${info.mtimeMs} ${digest}`);
      }
    }
  }
  await walk(root);
  return entries.sort();
}

async function connect() {
  const server = createEvergreenMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (response: RpcResponse) => void>();
  let nextId = 1;
  clientTransport.onmessage = (message) => {
    const response = message as RpcResponse;
    if (typeof response.id === "number") pending.get(response.id)?.(response);
  };
  await clientTransport.start();
  await server.connect(serverTransport);
  const request = async (method: string, params?: Record<string, unknown>) => {
    const id = nextId;
    nextId += 1;
    const response = new Promise<RpcResponse>((resolve) => pending.set(id, resolve));
    await clientTransport.send({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) } as never);
    const received = await response;
    pending.delete(id);
    if (received.error) throw new Error(received.error.message ?? "MCP request failed");
    return received.result ?? {};
  };
  await request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "evergreen-test", version: "1.0.0" },
  });
  await clientTransport.send({ jsonrpc: "2.0", method: "notifications/initialized" } as never);
  return {
    request,
    async close() {
      await clientTransport.close();
      await server.close();
    },
  };
}

test("every MCP tool is annotated read-only and takes no write option", async () => {
  const client = await connect();
  try {
    const tools = (await client.request("tools/list")).tools as Array<{
      name: string;
      annotations?: Record<string, unknown>;
      inputSchema: { properties?: Record<string, unknown> };
    }>;
    assert.deepEqual(tools.map((tool) => tool.name), [...MCP_TOOL_NAMES]);
    for (const tool of tools) {
      assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} must be readOnlyHint`);
      assert.equal(tool.annotations?.destructiveHint, false, `${tool.name} must not be destructive`);
      assert.deepEqual(
        Object.entries(MCP_TOOL_ANNOTATIONS).filter(([key, value]) => tool.annotations?.[key] !== value),
        [],
        tool.name,
      );
      const inputs = Object.keys(tool.inputSchema.properties ?? {});
      assert.deepEqual(
        inputs.filter((name) => /write|output|fix|apply|save|overwrite|force/i.test(name)),
        [],
        `${tool.name} must not accept an option that could write`,
      );
    }
  } finally {
    await client.close();
  }
});

test("no tool, resource, or prompt changes the repository tree", async () => {
  const root = await fixtureRepository();
  const client = await connect();
  try {
    const before = await snapshot(root);
    assert.ok(before.length > 0);

    const scan = await client.request("tools/call", { name: "scan_repository", arguments: { repository_path: root } });
    const findingId = (scan.structuredContent as { findings: Array<{ id: string }> }).findings[0]!.id;

    const calls = {
      scan_repository: { repository_path: root },
      list_deprecations: { repository_path: root },
      explain_deprecation: { finding_id: findingId, repository_path: root },
      create_migration_context: { finding_id: findingId, repository_path: root },
      verify_migration: { finding_id: findingId, repository_path: root },
      check_dependency: { purl: "pkg:npm/request@2.88.2" },
      check_upgrade: { path: root, target: "php@8.4" },
      forecast_repository: { repository_path: root, as_of: "2026-10-29" },
      plan_migrations: { repository_path: root },
    } satisfies Record<(typeof MCP_TOOL_NAMES)[number], Record<string, unknown>>;
    assert.deepEqual(Object.keys(calls).sort(), [...MCP_TOOL_NAMES].sort(), "every tool must be exercised here");

    for (const name of MCP_TOOL_NAMES) {
      const result = await client.request("tools/call", { name, arguments: calls[name] });
      assert.notEqual(result.isError, true, `${name} must succeed on the fixture`);
      assert.deepEqual(await snapshot(root), before, `${name} changed the repository`);
    }

    const baselined = await client.request("tools/call", {
      name: "scan_repository",
      arguments: { repository_path: root, baseline: "evergreen-baseline.json" },
    });
    assert.notEqual(baselined.isError, true);
    assert.deepEqual(await snapshot(root), before, "scan_repository with a baseline changed the repository");

    await client.request("resources/list");
    await client.request("resources/read", { uri: `evergreen://findings/${encodeURIComponent(root)}/${encodeURIComponent(findingId)}` }).catch(() => undefined);
    await client.request("prompts/get", { name: "migrate-finding", arguments: { finding_id: findingId, repository_path: root } });
    assert.deepEqual(await snapshot(root), before, "resources or prompts changed the repository");
  } finally {
    await client.close();
  }
});

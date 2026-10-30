import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import { createEvergreenMcpServer } from "../src/mcp.js";
import { buildPlan } from "../src/plan-build.js";
import type { Plan } from "../src/plan.js";
import type { ScanResult } from "../src/domain.js";

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
  const root = await mkdtemp(join(tmpdir(), "evergreen-mcp-plan-"));
  temporaryRoots.push(root);
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".github", "workflows", "ci.yml"), "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", version: "1.0.0", dependencies: { request: "2.88.2" } }, null, 2),
  );
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "index.js"), "const request = require('request');\nmodule.exports = request;\n");
  return root;
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

async function validator() {
  const schema = JSON.parse(await readFile(resolve("schemas/plan.v1.schema.json"), "utf8"));
  return new Ajv2020({ allErrors: true, strict: false }).compile(schema);
}

test("plan_migrations returns buildPlan(scan), valid against its published schema", async () => {
  const root = await fixtureRepository();
  const client = await connect();
  try {
    const call = await client.request("tools/call", {
      name: "plan_migrations",
      arguments: { repository_path: root },
    });
    assert.notEqual(call.isError, true);
    const plan = call.structuredContent as unknown as Plan;

    const validate = await validator();
    assert.ok(validate(plan), JSON.stringify(validate.errors));

    assert.equal(plan.schema, "evergreen.plan.v1");
    assert.ok(plan.items.length > 0, "the fixture has at least one finding to plan");
    assert.equal(plan.summary.items, plan.items.length);
    assert.equal(plan.summary.waves, plan.waves.length);

    const scan = await client.request("tools/call", {
      name: "scan_repository",
      arguments: { repository_path: root },
    });
    const scanResult = scan.structuredContent as unknown as ScanResult;
    assert.deepEqual(plan, buildPlan(scanResult), "the MCP tool must return what buildPlan produces from the same scan");
  } finally {
    await client.close();
  }
});

test("plan_migrations is deterministic and read-only annotated", async () => {
  const root = await fixtureRepository();
  const client = await connect();
  try {
    const listed = await client.request("tools/list");
    const tool = (listed.tools as Array<{ name: string; annotations?: Record<string, unknown> }>).find(
      (entry) => entry.name === "plan_migrations",
    );
    assert.ok(tool);
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);

    const args = { repository_path: root };
    const first = await client.request("tools/call", { name: "plan_migrations", arguments: args });
    const second = await client.request("tools/call", { name: "plan_migrations", arguments: args });
    assert.deepEqual(second.structuredContent, first.structuredContent, "the same repository yields the same plan");

    const plan = first.structuredContent as unknown as Plan;
    const findingIds = new Set(plan.items.map((item) => item.findingId));
    for (const wave of plan.waves) {
      for (const id of wave.itemIds) {
        assert.ok(findingIds.has(id), `${id} in wave ${wave.index} must be a plan item`);
      }
    }
    for (const item of plan.items) {
      assert.equal(plan.waves[item.wave]?.itemIds.includes(item.id), true, `${item.id} must sit in wave ${item.wave}`);
      assert.match(item.branch, /^evergreen\//, "branch names follow the evergreen/ prefix");
      assert.ok(item.touches.length > 0);
    }
  } finally {
    await client.close();
  }
});

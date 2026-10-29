import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import { createEvergreenMcpServer } from "../src/mcp.js";

interface RpcResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

interface Forecast {
  schemaVersion: string;
  root: string;
  today: string;
  until: string;
  months: number;
  groups: Array<{ month: string; events: Array<{ date: string; ruleId: string; findings: Array<{ id: string; path: string; line?: number }> }> }>;
  affecting: number;
  total: number;
}

const temporaryRoots: string[] = [];
const cli = resolve("dist/src/cli.js");

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-mcp-forecast-"));
  temporaryRoots.push(root);
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".github", "workflows", "ci.yml"), "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", version: "1.0.0", dependencies: { request: "2.88.2" } }, null, 2),
  );
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

async function cliForecast(root: string, months: number, asOf: string): Promise<Forecast> {
  const child = spawn(process.execPath, [cli, "forecast", root, "--months", String(months), "--as-of", asOf, "--json"]);
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  const [code] = (await once(child, "close")) as [number];
  assert.equal(code, 0, "evergreen forecast --json must succeed");
  return JSON.parse(stdout) as Forecast;
}

async function validator() {
  const schema = JSON.parse(await readFile(resolve("schemas/forecast.v1.schema.json"), "utf8"));
  return new Ajv2020({ allErrors: true, strict: false }).compile(schema);
}

test("forecast_repository returns the object evergreen forecast --json prints, valid against its published schema", async () => {
  const root = await fixtureRepository();
  const client = await connect();
  try {
    const call = await client.request("tools/call", {
      name: "forecast_repository",
      arguments: { repository_path: root, months: 12, as_of: "2026-10-29" },
    });
    assert.notEqual(call.isError, true);
    const forecast = call.structuredContent as unknown as Forecast;

    const validate = await validator();
    assert.ok(validate(forecast), JSON.stringify(validate.errors));

    assert.equal(forecast.schemaVersion, "evergreen.forecast.v1");
    assert.equal(forecast.root, resolve(root));
    assert.equal(forecast.today, "2026-10-29");
    assert.equal(forecast.until, "2027-10-29");
    assert.equal(forecast.months, 12);

    assert.deepEqual(forecast, await cliForecast(root, 12, "2026-10-29"), "the MCP tool must print what the CLI prints");
  } finally {
    await client.close();
  }
});

test("forecast_repository is deterministic for a fixed as_of and keeps every event inside the window", async () => {
  const root = await fixtureRepository();
  const client = await connect();
  try {
    const args = { repository_path: root, months: 36, as_of: "2026-10-29" };
    const first = await client.request("tools/call", { name: "forecast_repository", arguments: args });
    const second = await client.request("tools/call", { name: "forecast_repository", arguments: args });
    assert.deepEqual(second.structuredContent, first.structuredContent, "the same fixed window renders the same bytes");

    const forecast = first.structuredContent as unknown as Forecast;
    const scan = await client.request("tools/call", { name: "scan_repository", arguments: { repository_path: root } });
    const findings = (scan.structuredContent as { findings: Array<{ id: string; location: { path: string } }> }).findings;
    const located = new Map(findings.map((finding) => [finding.id, finding.location.path]));

    let events = 0;
    let affecting = 0;
    for (const group of forecast.groups) {
      assert.ok(group.events.length > 0, `${group.month} must not be an empty group`);
      for (const event of group.events) {
        assert.equal(group.month, event.date.slice(0, 7), `${event.ruleId} is grouped under its own month`);
        assert.ok(event.date >= forecast.today && event.date <= forecast.until, `${event.ruleId} is inside the window`);
        for (const finding of event.findings) {
          assert.equal(located.get(finding.id), finding.path, `${finding.id} names the location its scan reported`);
        }
        events += 1;
        if (event.findings.length > 0) affecting += 1;
      }
    }
    assert.equal(forecast.total, events);
    assert.equal(forecast.affecting, affecting);
  } finally {
    await client.close();
  }
});

test("forecast_repository defaults to twelve months and rejects a window outside its contract", async () => {
  const root = await fixtureRepository();
  const client = await connect();
  try {
    const defaults = await client.request("tools/call", { name: "forecast_repository", arguments: { repository_path: root } });
    assert.notEqual(defaults.isError, true);
    const forecast = defaults.structuredContent as unknown as Forecast;
    assert.equal(forecast.months, 12);
    assert.match(forecast.today, /^\d{4}-\d{2}-\d{2}$/, "without as_of the window starts today");

    for (const months of [0, 37, 1.5]) {
      const rejected = await client.request("tools/call", { name: "forecast_repository", arguments: { repository_path: root, months } });
      assert.equal(rejected.isError, true, `months ${months} is outside 1 to 36`);
      assert.match((rejected.content as Array<{ text: string }>)[0]!.text, /Input validation error/);
      assert.equal("structuredContent" in rejected, false);
    }
    const badDate = await client.request("tools/call", { name: "forecast_repository", arguments: { repository_path: root, as_of: "29-10-2026" } });
    assert.equal(badDate.isError, true);
    assert.match((badDate.content as Array<{ text: string }>)[0]!.text, /as_of must be a date/);
  } finally {
    await client.close();
  }
});

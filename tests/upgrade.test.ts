import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { InMemoryTransport } from "@modelcontextprotocol/server";

import { createEvergreenMcpServer } from "../src/mcp.js";
import { checkUpgrade, parseUpgradeTarget } from "../src/upgrade/index.js";
import type { UpgradeAnalyzer, UpgradeIssue, UpgradeReport, UpgradeTarget } from "../src/upgrade/types.js";

const fixture = (name: string) => resolve("tests/fixtures/upgrade/composer-lock", name);
const cli = resolve("dist/src/cli.js");
const run = (...args: string[]) => spawnSync(process.execPath, [cli, "upgrade-check", ...args], { encoding: "utf8" });
const target: UpgradeTarget = { runtime: "php", version: "8.4" };

function fake(id: string, runtimes: readonly string[], applies: boolean, issues: UpgradeIssue[] = []): UpgradeAnalyzer {
  return { id, runtimes, applies: async () => applies, analyze: async () => issues };
}

function issue(level: UpgradeIssue["level"], subject: string, path: string, line: number): UpgradeIssue {
  return { analyzer: "fake", level, subject, path, line, reason: `${subject} is reported at ${path}`, evidence: { kind: "rule", value: `rule: ${subject}` } };
}

test("parseUpgradeTarget reads runtime@version and resolves aliases", () => {
  assert.deepEqual(parseUpgradeTarget("nodejs@22"), { runtime: "nodejs", version: "22" });
  assert.deepEqual(parseUpgradeTarget("node@22"), { runtime: "nodejs", version: "22" });
  assert.deepEqual(parseUpgradeTarget("py@3.13"), { runtime: "python", version: "3.13" });
  assert.deepEqual(parseUpgradeTarget("golang@1.23"), { runtime: "go", version: "1.23" });
  assert.deepEqual(parseUpgradeTarget("php@8.4.0RC1"), { runtime: "php", version: "8.4.0RC1" });
  assert.equal(parseUpgradeTarget("php"), undefined);
  assert.equal(parseUpgradeTarget("@8.4"), undefined);
  assert.equal(parseUpgradeTarget("php@"), undefined);
});

test("checkUpgrade reports unknown when no analyzer applies", async () => {
  const report = await checkUpgrade(".", target, [fake("off", ["php"], false)]);
  assert.equal(report.verdict, "unknown");
  assert.deepEqual(report.analyzers, []);
  assert.deepEqual(report.issues, []);
});

test("checkUpgrade reports ready when only warnings and unknown issues remain", async () => {
  const report = await checkUpgrade(".", target, [fake("fake", ["php"], true, [
    issue("warning", "dev-package@1.0.0", "composer.lock", 3),
    issue("unknown", "mystery", "composer.lock", 4),
  ])]);
  assert.equal(report.verdict, "ready");
  assert.deepEqual(report.analyzers, ["fake"]);
});

test("checkUpgrade reports blocked when any blocker is present", async () => {
  const report = await checkUpgrade(".", target, [fake("fake", ["php"], true, [
    issue("blocker", "package@1.0.0", "composer.lock", 2),
  ])]);
  assert.equal(report.verdict, "blocked");
});

test("checkUpgrade sorts issues by level, path, line, subject, and analyzer", async () => {
  const report = await checkUpgrade(".", target, [fake("fake", ["php"], true, [
    issue("unknown", "u", "a.lock", 1),
    issue("warning", "w", "b.lock", 2),
    issue("blocker", "b2", "z.lock", 3),
    issue("blocker", "b1", "a.lock", 2),
    issue("blocker", "a0", "a.lock", 1),
  ])]);
  assert.deepEqual(
    report.issues.map((entry) => `${entry.level}:${entry.path}:${entry.line ?? 0}:${entry.subject}`),
    ["blocker:a.lock:1:a0", "blocker:a.lock:2:b1", "blocker:z.lock:3:b2", "warning:b.lock:2:w", "unknown:a.lock:1:u"],
  );
});

test("checkUpgrade runs only analyzers that handle the runtime and apply, and sorts their ids", async () => {
  const report = await checkUpgrade(".", target, [
    fake("z", ["php"], true),
    fake("a", ["php"], true),
    fake("node", ["nodejs"], true),
    fake("off", ["php"], false),
  ]);
  assert.deepEqual(report.analyzers, ["a", "z"]);
});

test("the text output starts with the verdict and prints evidence for every issue", () => {
  const result = run("--to", "php@8.4", fixture("blocked"));
  assert.equal(result.status, 1);
  const lines = result.stdout.trimEnd().split("\n");
  assert.equal(lines[0], "php@8.4: blocked (3 blockers, 1 warnings, 0 unknown)");
  assert.equal(
    lines[1],
    "composer.lock:9  acme/http-client@2.1.0  acme/http-client@2.1.0 requires php ^7.4, which excludes PHP 8.4.  [lockfile: require.php: ^7.4]",
  );
  assert.equal(lines.length, 5);
});

test("the CLI and the check_upgrade MCP tool return the same report, and both validate against upgrade.v1", async () => {
  const blocked = fixture("blocked");
  const cliResult = run("--to", "php@8.4", blocked, "--json");
  assert.equal(cliResult.status, 1);
  const fromCli = JSON.parse(cliResult.stdout) as UpgradeReport;

  const client = await connect();
  try {
    const tools = (await client.request("tools/list")).tools as Array<{ name: string; description: string }>;
    const tool = tools.find((candidate) => candidate.name === "check_upgrade");
    assert.ok(tool, "check_upgrade is a tool");
    assert.match(tool.description, /not a statement that the upgrade is safe/);

    const result = await client.request("tools/call", { name: "check_upgrade", arguments: { path: blocked, target: "php@8.4" } });
    assert.notEqual(result.isError, true);
    assert.deepEqual(result.structuredContent, fromCli);

    const { Ajv2020 } = await import("ajv/dist/2020.js");
    const schema = JSON.parse(await readFile(resolve("schemas/upgrade.v1.schema.json"), "utf8")) as object;
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    assert.equal(validate(fromCli), true, JSON.stringify(validate.errors));
    assert.equal(validate(result.structuredContent), true, JSON.stringify(validate.errors));
  } finally {
    await client.close();
  }
});

test("exit codes are 0 for ready and unknown, 1 for blocked, and 2 for bad input", async () => {
  assert.equal(run("--to", "php@8.4", fixture("ready")).status, 0);
  assert.equal(run("--to", "php@8.4", fixture("blocked")).status, 1);

  const empty = await mkdtemp(join(tmpdir(), "evergreen-upgrade-"));
  try {
    const unknown = run("--to", "php@8.4", empty);
    assert.equal(unknown.status, 0);
    assert.match(unknown.stdout, /^php@8\.4: unknown/);
    assert.match(unknown.stdout, /Evergreen found no evidence for this runtime in this repository\. This is not a statement that the upgrade is safe\./);
  } finally {
    await rm(empty, { recursive: true, force: true });
  }

  assert.equal(run(fixture("ready")).status, 2);
  assert.equal(run("--to", "php@8.4", fixture("missing")).status, 2);
});

interface RpcResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
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
  const request = async (method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const id = nextId;
    nextId += 1;
    const response = new Promise<RpcResponse>((resolveResponse) => pending.set(id, resolveResponse));
    await clientTransport.send({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) } as never);
    const received = await response;
    pending.delete(id);
    if (received.error) throw new Error(received.error.message ?? "MCP request failed");
    return received.result ?? {};
  };
  await request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "evergreen-upgrade-test", version: "1.0.0" },
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

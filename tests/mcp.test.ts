import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { after, test } from "node:test";

import { InMemoryTransport } from "@modelcontextprotocol/server";

import {
  createEvergreenMcpServer,
  MCP_TOOL_ANNOTATIONS,
  MCP_TOOL_NAMES,
} from "../src/mcp.js";

interface RpcResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureRepository(): Promise<{ root: string; workflow: string }> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-mcp-"));
  temporaryRoots.push(root);
  const workflows = join(root, ".github", "workflows");
  await mkdir(workflows, { recursive: true });
  const workflow = join(workflows, "ci.yml");
  await writeFile(
    workflow,
    "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n",
  );
  return { root, workflow };
}

async function connectTestClient() {
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
  await clientTransport.send({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  } as never);

  return {
    request,
    async close() {
      await clientTransport.close();
      await server.close();
    },
  };
}

test("local MCP server exposes the complete scan-to-verification workflow", async () => {
  const { root, workflow } = await fixtureRepository();
  const client = await connectTestClient();

  try {
    const listed = await client.request("tools/list");
    const tools = listed.tools as Array<{ name: string; annotations?: Record<string, unknown> }>;
    assert.deepEqual(tools.map((tool) => tool.name), [...MCP_TOOL_NAMES]);
    assert.ok(
      tools.every((tool) =>
        Object.entries(MCP_TOOL_ANNOTATIONS).every(
          ([key, value]) => tool.annotations?.[key] === value,
        ),
      ),
    );

    const scan = await client.request("tools/call", {
      name: "scan_repository",
      arguments: { repository_path: root },
    });
    const scanContent = scan.structuredContent as {
      schemaVersion: string;
      findings: Array<{ id: string }>;
    };
    assert.equal(scanContent.schemaVersion, "evergreen.scan.v1");
    assert.equal(scanContent.findings.length, 1);
    const findingId = scanContent.findings[0]!.id;

    const deprecations = await client.request("tools/call", {
      name: "list_deprecations",
      arguments: { repository_path: root },
    });
    assert.equal(
      (deprecations.structuredContent as { schemaVersion: string }).schemaVersion,
      "evergreen.deprecations.v1",
    );
    const deprecationsSchema = JSON.parse(
      await readFile(resolve("schemas/deprecations.v1.schema.json"), "utf8"),
    ) as { required: string[] };
    assert.deepEqual(
      [...deprecationsSchema.required].sort(),
      Object.keys(deprecations.structuredContent as object).sort(),
    );

    const explanation = await client.request("tools/call", {
      name: "explain_deprecation",
      arguments: { finding_id: findingId, repository_path: root },
    });
    assert.equal((explanation.structuredContent as { id: string }).id, findingId);

    const context = await client.request("tools/call", {
      name: "create_migration_context",
      arguments: { finding_id: findingId, repository_path: root },
    });
    assert.equal(
      (context.structuredContent as { schemaVersion: string }).schemaVersion,
      "evergreen.context.v1",
    );

    await writeFile(
      workflow,
      "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v7\n",
    );
    const verification = await client.request("tools/call", {
      name: "verify_migration",
      arguments: { finding_id: findingId, repository_path: root },
    });
    const verificationContent = verification.structuredContent as {
      schemaVersion: string;
      verified: boolean;
      commandsExecuted: boolean;
      remainingFindings: unknown[];
    };
    assert.equal(verificationContent.schemaVersion, "evergreen.verification.v1");
    assert.equal(verificationContent.verified, true);
    assert.equal(verificationContent.commandsExecuted, false);
    assert.deepEqual(verificationContent.remainingFindings, []);
    const dependency = await client.request("tools/call", {
      name: "check_dependency",
      arguments: { purl: "pkg:npm/request@2.88.2" },
    });
    const dependencyContent = dependency.structuredContent as {
      schemaVersion: string;
      status: string;
      severity: string;
      findings: Array<{ ruleId: string; replacement?: string; sources: unknown[] }>;
    };
    assert.equal(dependencyContent.schemaVersion, "evergreen.check.v1");
    assert.equal(dependencyContent.status, "affected");
    assert.equal(dependencyContent.findings[0]!.ruleId, "npm.package.request.deprecated");
    assert.ok(dependencyContent.findings[0]!.replacement);
    const checkSchema = JSON.parse(await readFile(resolve("schemas/check.v1.schema.json"), "utf8")) as { required: string[] };
    for (const key of checkSchema.required) assert.ok(key in dependencyContent, `missing ${key}`);

    const versioned = await client.request("tools/call", {
      name: "check_dependency",
      arguments: { purl: "pkg:github/actions/checkout", version: "v5" },
    });
    assert.equal((versioned.structuredContent as { status: string }).status, "not-affected");

    const noData = await client.request("tools/call", {
      name: "check_dependency",
      arguments: { purl: "pkg:npm/express" },
    });
    assert.equal((noData.structuredContent as { status: string }).status, "no-data");

    const invalid = await client.request("tools/call", {
      name: "check_dependency",
      arguments: { purl: "request" },
    });
    assert.equal(invalid.isError, true);

    const verificationSchema = JSON.parse(
      await readFile(resolve("schemas/verification.v1.schema.json"), "utf8"),
    ) as { required: string[] };
    assert.deepEqual(
      [...verificationSchema.required].sort(),
      Object.keys(verificationContent).sort(),
    );

    const unknown = await client.request("tools/call", {
      name: "verify_migration",
      arguments: { finding_id: "unknown", repository_path: root },
    });
    assert.equal(unknown.isError, true);
    assert.match(
      ((unknown.content as Array<{ text: string }>)[0]?.text ?? ""),
      /was not observed in this MCP session/,
    );
  } finally {
    await client.close();
  }
});

test("evergreen-mcp serves the registered tools over stdio", { timeout: 10_000 }, async () => {
  const child = spawn(process.execPath, [resolve("dist/src/mcp-cli.js")], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map<number, (response: RpcResponse) => void>();
  let nextId = 1;
  lines.on("line", (line) => {
    const response = JSON.parse(line) as RpcResponse;
    pending.get(response.id)?.(response);
  });
  const request = async (method: string, params?: Record<string, unknown>) => {
    const id = nextId;
    nextId += 1;
    const response = new Promise<RpcResponse>((resolveResponse) => pending.set(id, resolveResponse));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) })}\n`);
    const received = await response;
    pending.delete(id);
    if (received.error) throw new Error(received.error.message ?? "MCP request failed");
    return received.result ?? {};
  };

  try {
    await request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "evergreen-stdio-test", version: "1.0.0" },
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    const listed = await request("tools/list");
    assert.deepEqual(
      (listed.tools as Array<{ name: string }>).map((tool) => tool.name),
      [...MCP_TOOL_NAMES],
    );
  } finally {
    child.stdin.end();
    await once(child, "exit");
    lines.close();
  }
});

test("lifecycle rules are listed and readable as resources without a scan", async () => {
  const client = await connectTestClient();
  try {
    const listed = (await client.request("resources/list")).resources as Array<{ uri: string; name: string; title: string; mimeType: string }>;
    const registryRules = (await import("../src/check-dependency.js")).bundledRules;
    const rules = await registryRules();
    assert.equal(listed.length, rules.length);
    assert.deepEqual(listed.map((resource) => resource.uri).sort(), rules.map((rule) => `evergreen://rules/${rule.id}`).sort());
    assert.ok(listed.every((resource) => resource.mimeType === "application/json" && resource.title && resource.name));

    const templates = (await client.request("resources/templates/list")).resourceTemplates as Array<{ uriTemplate: string }>;
    assert.deepEqual(templates.map((template) => template.uriTemplate), ["evergreen://rules/{id}"]);

    const read = await client.request("resources/read", { uri: "evergreen://rules/npm.package.request.deprecated" });
    const contents = read.contents as Array<{ uri: string; mimeType: string; text: string }>;
    assert.equal(contents.length, 1);
    assert.equal(contents[0]!.uri, "evergreen://rules/npm.package.request.deprecated");
    const rule = JSON.parse(contents[0]!.text) as Record<string, unknown>;
    assert.equal(rule.schemaVersion, "evergreen.rule.v1");
    assert.equal(rule.event, "deprecated");
    assert.ok((rule.sources as unknown[]).length > 0);
    assert.ok(rule.replacement);
    assert.ok(!("x-npm" in rule), "detector hints are internal");

    await assert.rejects(client.request("resources/read", { uri: "evergreen://rules/no.such.rule" }), /No lifecycle rule "no\.such\.rule"/);
  } finally {
    await client.close();
  }
});

test("every bundled rule reads back as a valid evergreen.rule.v1 document", async () => {
  const { Ajv2020 } = await import("ajv/dist/2020.js");
  const validate = new Ajv2020({ allErrors: true }).compile(JSON.parse(await readFile(resolve("schemas/rule.v1.schema.json"), "utf8")) as object);
  const client = await connectTestClient();
  try {
    const listed = (await client.request("resources/list")).resources as Array<{ uri: string }>;
    for (const { uri } of listed) {
      const read = await client.request("resources/read", { uri });
      const document = JSON.parse((read.contents as Array<{ text: string }>)[0]!.text);
      assert.equal(validate(document), true, `${uri}: ${JSON.stringify(validate.errors)}`);
    }
  } finally {
    await client.close();
  }
});

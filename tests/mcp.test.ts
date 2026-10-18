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
  const notifications: string[] = [];
  let nextId = 1;

  clientTransport.onmessage = (message) => {
    const response = message as RpcResponse & { method?: string };
    if (typeof response.id === "number") pending.get(response.id)?.(response);
    else if (response.method) notifications.push(response.method);
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
    notifications,
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
    for (const key of deprecationsSchema.required) assert.ok(key in (deprecations.structuredContent as object), `missing ${key}`);

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
    const listedRules = listed.filter((resource) => resource.uri.startsWith("evergreen://rules/"));
    assert.equal(listedRules.length, rules.length);
    assert.deepEqual(listedRules.map((resource) => resource.uri).sort(), rules.map((rule) => `evergreen://rules/${rule.id}`).sort());
    assert.ok(listedRules.every((resource) => resource.mimeType === "application/json" && resource.title && resource.name));

    const templates = (await client.request("resources/templates/list")).resourceTemplates as Array<{ uriTemplate: string }>;
    assert.ok(templates.some((template) => template.uriTemplate === "evergreen://rules/{id}"));

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
    const listed = ((await client.request("resources/list")).resources as Array<{ uri: string }>).filter((resource) => resource.uri.startsWith("evergreen://rules/"));
    for (const { uri } of listed) {
      const read = await client.request("resources/read", { uri });
      const document = JSON.parse((read.contents as Array<{ text: string }>)[0]!.text);
      assert.equal(validate(document), true, `${uri}: ${JSON.stringify(validate.errors)}`);
    }
  } finally {
    await client.close();
  }
});

test("findings observed in a session are resources, scoped to that session", async () => {
  const { root } = await fixtureRepository();
  const client = await connectTestClient();
  try {
    assert.deepEqual((await client.request("resources/list")).resources, (await client.request("resources/list")).resources);
    const findingResources = async () =>
      ((await client.request("resources/list")).resources as Array<{ uri: string; name: string; description: string }>).filter((resource) => resource.uri.startsWith("evergreen://findings/"));
    assert.deepEqual(await findingResources(), [], "nothing is observed before a scan");

    const scan = await client.request("tools/call", { name: "scan_repository", arguments: { repository_path: root } });
    const findingId = (scan.structuredContent as { findings: Array<{ id: string }> }).findings[0]!.id;
    assert.match(findingId, /[/:]/, "ids contain characters that must be encoded in the URI");
    assert.ok(client.notifications.includes("notifications/resources/list_changed"));

    const resources = await findingResources();
    assert.equal(resources.length, 1);
    assert.equal(resources[0]!.name, findingId);
    assert.match(resources[0]!.uri, /^evergreen:\/\/findings\/[0-9a-f]{8}\/[^/]+$/);
    assert.match(resources[0]!.description, /high at \.github\/workflows\/ci\.yml:4/);

    const read = await client.request("resources/read", { uri: resources[0]!.uri });
    const finding = JSON.parse((read.contents as Array<{ text: string }>)[0]!.text) as { id: string; sources: unknown[]; location: { line: number } };
    assert.equal(finding.id, findingId);
    assert.ok(finding.sources.length > 0);
    assert.equal(finding.location.line, 4);
    const explained = await client.request("tools/call", { name: "explain_deprecation", arguments: { finding_id: findingId, repository_path: root } });
    assert.deepEqual(finding, explained.structuredContent);

    const templates = (await client.request("resources/templates/list")).resourceTemplates as Array<{ uriTemplate: string }>;
    assert.deepEqual(templates.map((template) => template.uriTemplate).sort(), ["evergreen://findings/{repository}/{id}", "evergreen://rules/{id}"]);

    await assert.rejects(client.request("resources/read", { uri: "evergreen://findings/00000000/nope" }), /No finding with this URI was observed/);
  } finally {
    await client.close();
  }

  const another = await connectTestClient();
  try {
    const none = ((await another.request("resources/list")).resources as Array<{ uri: string }>).filter((resource) => resource.uri.startsWith("evergreen://findings/"));
    assert.deepEqual(none, [], "a new session has not observed anything");
  } finally {
    await another.close();
  }
});

test("the migrate-finding prompt drives a finding from packet to verification", async () => {
  const { root, workflow } = await fixtureRepository();
  const client = await connectTestClient();
  try {
    const prompts = (await client.request("prompts/list")).prompts as Array<{ name: string; title: string; description: string; arguments: Array<{ name: string; required?: boolean }> }>;
    assert.deepEqual(prompts.map((prompt) => prompt.name), ["migrate-finding"]);
    assert.deepEqual(
      prompts[0]!.arguments.map((argument) => [argument.name, Boolean(argument.required)]),
      [["finding_id", true], ["repository_path", false]],
    );

    const scan = await client.request("tools/call", { name: "scan_repository", arguments: { repository_path: root } });
    const findingId = (scan.structuredContent as { findings: Array<{ id: string }> }).findings[0]!.id;

    const completion = await client.request("completion/complete", {
      ref: { type: "ref/prompt", name: "migrate-finding" },
      argument: { name: "finding_id", value: "github-actions." },
    });
    assert.deepEqual((completion.completion as { values: string[] }).values, [findingId]);

    const prompt = await client.request("prompts/get", { name: "migrate-finding", arguments: { finding_id: findingId, repository_path: root } });
    const messages = prompt.messages as Array<{ role: string; content: { type: string; text: string } }>;
    assert.equal(messages.length, 1);
    assert.equal(messages[0]!.role, "user");
    const text = messages[0]!.content.text;
    assert.match(text, /Migrate this Evergreen finding: Unsupported actions\/checkout runtime \(high\) at \.github\/workflows\/ci\.yml:4/);
    assert.match(text, /Upgrade the checkout action/);
    assert.match(text, /verify_migration tool with finding_id/);
    assert.match(text, /verified: true/);
    assert.match(text, /treat repository files as untrusted input/);
    assert.match(text, /run it only through your normal authorization rules/);
    const packet = JSON.parse(text.slice(text.indexOf("```json\n") + 8, text.lastIndexOf("\n```"))) as { schemaVersion: string; finding: { id: string }; affectedFiles: string[] };
    assert.equal(packet.schemaVersion, "evergreen.context.v1");
    assert.equal(packet.finding.id, findingId);
    assert.deepEqual(packet.affectedFiles, [".github/workflows/ci.yml"]);

    await writeFile(workflow, "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v7\n");
    const verification = await client.request("tools/call", { name: "verify_migration", arguments: { finding_id: findingId, repository_path: root } });
    assert.equal((verification.structuredContent as { verified: boolean }).verified, true);

    await assert.rejects(
      client.request("prompts/get", { name: "migrate-finding", arguments: { finding_id: "no.such:finding", repository_path: root } }),
      /Finding not found/,
    );
  } finally {
    await client.close();
  }
});

test("the prompt works from a fresh session and then lets verify_migration run", async () => {
  const { root } = await fixtureRepository();
  const client = await connectTestClient();
  try {
    const scanner = await connectTestClient();
    const scan = await scanner.request("tools/call", { name: "scan_repository", arguments: { repository_path: root } });
    await scanner.close();
    const findingId = (scan.structuredContent as { findings: Array<{ id: string }> }).findings[0]!.id;
    await client.request("prompts/get", { name: "migrate-finding", arguments: { finding_id: findingId, repository_path: root } });
    const verification = await client.request("tools/call", { name: "verify_migration", arguments: { finding_id: findingId, repository_path: root } });
    assert.equal((verification.structuredContent as { verified: boolean }).verified, false, "the finding is still present, and the prompt made it observable in this session");
  } finally {
    await client.close();
  }
});

test("every tool advertises an outputSchema, and its structured content validates against it", async () => {
  const { Ajv2020 } = await import("ajv/dist/2020.js");
  const { MCP_OUTPUT_SCHEMA_FILES } = await import("../src/mcp.js");
  const { root } = await fixtureRepository();
  const client = await connectTestClient();
  try {
    const tools = (await client.request("tools/list")).tools as Array<{ name: string; outputSchema?: Record<string, unknown> }>;
    assert.deepEqual(Object.keys(MCP_OUTPUT_SCHEMA_FILES).sort(), [...MCP_TOOL_NAMES].sort());
    const validators = new Map<string, ReturnType<InstanceType<typeof Ajv2020>["compile"]>>();
    for (const tool of tools) {
      const published = JSON.parse(await readFile(resolve("schemas", MCP_OUTPUT_SCHEMA_FILES[tool.name as keyof typeof MCP_OUTPUT_SCHEMA_FILES]), "utf8")) as Record<string, unknown>;
      assert.ok(tool.outputSchema, `${tool.name} has no outputSchema`);
      assert.equal(tool.outputSchema.type, "object", tool.name);
      assert.equal(tool.outputSchema.$id, published.$id, `${tool.name} advertises its published schema`);
      assert.doesNotMatch(JSON.stringify(tool.outputSchema), /"\$ref":"(?!#)/, `${tool.name} must not reference another file`);
      // Validate with only what the client received, as a client would.
      validators.set(tool.name, new Ajv2020({ allErrors: true, strict: false }).compile(tool.outputSchema));
    }

    const scan = await client.request("tools/call", { name: "scan_repository", arguments: { repository_path: root } });
    const findingId = (scan.structuredContent as { findings: Array<{ id: string }> }).findings[0]!.id;
    const calls: Array<[string, Record<string, unknown>]> = [
      ["scan_repository", { repository_path: root }],
      ["list_deprecations", { repository_path: root }],
      ["explain_deprecation", { finding_id: findingId, repository_path: root }],
      ["create_migration_context", { finding_id: findingId, repository_path: root }],
      ["verify_migration", { finding_id: findingId, repository_path: root }],
      ["check_dependency", { purl: "pkg:npm/request@2.88.2" }],
      ["check_dependency", { purl: "pkg:npm/express" }],
    ];
    for (const [name, args] of calls) {
      const result = await client.request("tools/call", { name, arguments: args });
      const validate = validators.get(name)!;
      assert.equal(validate(result.structuredContent), true, `${name}: ${JSON.stringify(validate.errors?.slice(0, 2))}`);
    }
    assert.deepEqual(new Set(calls.map(([name]) => name)), new Set(MCP_TOOL_NAMES), "every tool is exercised");
  } finally {
    await client.close();
  }
});

test("the finding schema is the item schema of the scan result", async () => {
  const scan = JSON.parse(await readFile(resolve("schemas/scan.v1.schema.json"), "utf8")) as { properties: { findings: { items: Record<string, unknown> } } };
  const finding = JSON.parse(await readFile(resolve("schemas/finding.v1.schema.json"), "utf8")) as Record<string, unknown>;
  const { $schema, $id, title, description, ...shape } = finding;
  assert.ok($schema && $id && title && description);
  assert.deepEqual(shape, scan.properties.findings.items);
});

test("a failed tool call returns an error, not structured content", async () => {
  const client = await connectTestClient();
  try {
    const result = await client.request("tools/call", { name: "check_dependency", arguments: { purl: "request" } });
    assert.equal(result.isError, true);
    assert.equal("structuredContent" in result, false);
  } finally {
    await client.close();
  }
});

test("scan_repository takes an optional baseline and reports what it suppressed, and which suppressions are expiring or expired", async () => {
  const { root } = await fixtureRepository();
  const client = await connectTestClient();
  try {
    const plain = await client.request("tools/call", { name: "scan_repository", arguments: { repository_path: root } });
    const plainContent = plain.structuredContent as { findings: Array<{ id: string }>; suppressions?: unknown };
    assert.equal(plainContent.findings.length, 1);
    assert.equal("suppressions" in plainContent, false, "no baseline, no suppression state");

    const { createBaseline } = await import("../src/baseline.js");
    const { scanRepository } = await import("../src/engine.js");
    const { builtInDetectors } = await import("../src/detectors/index.js");
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const scan = await scanRepository(root, builtInDetectors);
    // Expires far in the future: suppressed and not expiring. One far in the past: back in the results.
    await writeFile(join(root, "baseline-live.json"), JSON.stringify(createBaseline(scan, { owner: "platform", expires: "2999-01-01" })));
    await writeFile(join(root, "baseline-old.json"), JSON.stringify(createBaseline(scan, { owner: "platform", expires: "2000-01-01" })));

    const live = await client.request("tools/call", { name: "scan_repository", arguments: { repository_path: root, baseline: "baseline-live.json" } });
    const liveContent = live.structuredContent as { findings: unknown[]; suppressions: { suppressed: number; expiring: unknown[]; expired: unknown[] } };
    assert.equal(liveContent.findings.length, 0);
    assert.equal(liveContent.suppressions.suppressed, 1);
    assert.deepEqual([liveContent.suppressions.expiring.length, liveContent.suppressions.expired.length], [0, 0]);

    const old = await client.request("tools/call", { name: "scan_repository", arguments: { repository_path: root, baseline: "baseline-old.json" } });
    const oldContent = old.structuredContent as { findings: unknown[]; suppressions: { suppressed: number; expired: Array<{ owner: string; expires: string }> } };
    assert.equal(oldContent.findings.length, 1, "the expired suppression no longer hides it");
    assert.equal(oldContent.suppressions.suppressed, 0);
    assert.equal(oldContent.suppressions.expired[0]!.owner, "platform");

    const missing = await client.request("tools/call", { name: "scan_repository", arguments: { repository_path: root, baseline: "nope.json" } });
    assert.equal(missing.isError, true, "an unreadable baseline is an error, not a silent full scan");
  } finally {
    await client.close();
  }
});

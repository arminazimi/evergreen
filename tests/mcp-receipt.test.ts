import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { InMemoryTransport } from "@modelcontextprotocol/server";
import { Ajv2020 } from "ajv/dist/2020.js";

import { createEvergreenMcpServer } from "../src/mcp.js";
import { RECEIPT_MARKER } from "../src/receipt-markdown.js";
import type { Receipt } from "../src/receipt.js";

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
  const root = await mkdtemp(join(tmpdir(), "evergreen-mcp-receipt-"));
  temporaryRoots.push(root);
  const workflows = join(root, ".github", "workflows");
  await mkdir(workflows, { recursive: true });
  const workflow = join(workflows, "ci.yml");
  await writeFile(workflow, "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n");
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
  await clientTransport.send({ jsonrpc: "2.0", method: "notifications/initialized" } as never);

  return {
    request,
    async close() {
      await clientTransport.close();
      await server.close();
    },
  };
}

async function receiptValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema(JSON.parse(await readFile(resolve("schemas/scan.v1.schema.json"), "utf8")) as object);
  return ajv.compile(JSON.parse(await readFile(resolve("schemas/receipt.v1.schema.json"), "utf8")) as object);
}

interface VerificationContent {
  verified: boolean;
  remainingFindings: Array<{ id: string }>;
  receipt?: Receipt;
  receipt_markdown?: string;
}

async function scanFindingId(client: Awaited<ReturnType<typeof connectTestClient>>, root: string): Promise<string> {
  const scan = await client.request("tools/call", { name: "scan_repository", arguments: { repository_path: root } });
  return (scan.structuredContent as { findings: Array<{ id: string }> }).findings[0]!.id;
}

test("verify_migration returns a receipt when the migration resolved the finding", async () => {
  const { root, workflow } = await fixtureRepository();
  const client = await connectTestClient();
  try {
    const findingId = await scanFindingId(client, root);
    await writeFile(workflow, "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v7\n");

    const verification = await client.request("tools/call", {
      name: "verify_migration",
      arguments: { finding_id: findingId, repository_path: root },
    });
    const content = verification.structuredContent as VerificationContent;
    assert.equal(content.verified, true);
    assert.ok(content.receipt, "a scanned session gets a receipt");
    assert.ok(content.receipt_markdown, "and its Markdown form");

    const receipt = content.receipt!;
    assert.equal(receipt.schema, "evergreen.receipt.v1");
    assert.deepEqual(receipt.counts, { resolved: 1, remaining: 0, introduced: 0 });
    assert.deepEqual(receipt.resolved.map((finding) => finding.id), [findingId]);
    assert.deepEqual(receipt.remaining, []);
    assert.deepEqual(receipt.introduced, []);

    assert.ok(content.receipt_markdown!.startsWith(RECEIPT_MARKER));
    assert.match(content.receipt_markdown!, /All findings resolved/);

    const validate = await receiptValidator();
    assert.equal(validate(receipt), true, JSON.stringify(validate.errors?.slice(0, 2)));
  } finally {
    await client.close();
  }
});

test("verify_migration returns a receipt when the finding remains", async () => {
  const { root } = await fixtureRepository();
  const client = await connectTestClient();
  try {
    const findingId = await scanFindingId(client, root);
    const verification = await client.request("tools/call", {
      name: "verify_migration",
      arguments: { finding_id: findingId, repository_path: root },
    });
    const content = verification.structuredContent as VerificationContent;
    assert.equal(content.verified, false);
    assert.deepEqual(content.remainingFindings.map((finding) => finding.id), [findingId]);
    assert.ok(content.receipt);

    const receipt = content.receipt!;
    assert.deepEqual(receipt.counts, { resolved: 0, remaining: 1, introduced: 0 });
    assert.deepEqual(receipt.resolved, []);
    assert.deepEqual(receipt.remaining.map((finding) => finding.id), [findingId]);
    assert.deepEqual(receipt.introduced, []);

    assert.match(content.receipt_markdown!, /Findings remain/);

    const validate = await receiptValidator();
    assert.equal(validate(receipt), true, JSON.stringify(validate.errors?.slice(0, 2)));
  } finally {
    await client.close();
  }
});

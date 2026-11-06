import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { after, before, test } from "node:test";
import { pathToFileURL } from "node:url";

import { InMemoryTransport } from "@modelcontextprotocol/server";

import { runGitHubAction } from "../src/github-action.js";
import { readFramedMessages, startLanguageServer, writeFramedMessage } from "../src/lsp.js";
import { createEvergreenMcpServer } from "../src/mcp.js";
import { runScanRequest } from "../src/scan-request.js";
import { runCli } from "./cli-runner.js";

/*
 * One request, four interfaces. The CLI, the MCP server, the language server, and the GitHub Action are thin
 * adapters over `runScanRequest`, so scanning the same repository through each must return the same findings.
 */

const fixtureRoot = resolve("tests/fixtures/lsp");
let root: string;
let temporary: string;

before(async () => {
  temporary = await mkdtemp(join(tmpdir(), "evergreen-adapter-parity-"));
  root = join(temporary, "repository");
  await cp(fixtureRoot, root, { recursive: true });
});

after(async () => {
  await rm(temporary, { recursive: true, force: true });
});

const sorted = (ids: readonly string[]): string[] => [...ids].sort();

async function viaCore(): Promise<string[]> {
  const { result } = await runScanRequest({ root });
  return sorted(result.findings.map((finding) => finding.id));
}

async function viaCli(): Promise<string[]> {
  const { stdout } = await runCli(["scan", root, "--json", "--no-cache"]);
  return sorted((JSON.parse(stdout) as { findings: Array<{ id: string }> }).findings.map((finding) => finding.id));
}

async function viaAction(): Promise<string[]> {
  const outcome = await runGitHubAction({
    root,
    reportPath: join(temporary, "report.json"),
    failOnSeverity: "none",
  });
  return sorted(outcome.result.findings.map((finding) => finding.id));
}

async function viaMcp(): Promise<string[]> {
  const server = createEvergreenMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const response = new Promise<{
    result?: { structuredContent?: { findings: Array<{ id: string }> } };
  }>((done) => {
    clientTransport.onmessage = (message) => {
      if ((message as { id?: number }).id === 1) done(message as never);
    };
  });
  await clientTransport.start();
  await server.connect(serverTransport);
  try {
    await clientTransport.send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "scan_repository", arguments: { repository_path: root } },
    } as never);
    const content = (await response).result?.structuredContent;
    assert.ok(content, "scan_repository returned structured content");
    return sorted(content.findings.map((finding) => finding.id));
  } finally {
    await server.close();
  }
}

async function viaLsp(): Promise<string[]> {
  const input = new PassThrough();
  const output = new PassThrough();
  const messages: Array<Record<string, unknown>> = [];
  const waiting = new Set<() => void>();
  readFramedMessages(output, (message) => {
    messages.push(message);
    for (const wake of [...waiting]) wake();
  });
  const server = startLanguageServer({
    input,
    output,
    debounceMs: 0,
    log: () => {},
  });
  const send = (message: Record<string, unknown>): void => writeFramedMessage(input, { jsonrpc: "2.0", ...message });
  send({
    id: 1,
    method: "initialize",
    params: {
      processId: null,
      rootUri: pathToFileURL(root).href,
      capabilities: {},
    },
  });
  send({ method: "initialized", params: {} });
  const paths = [join(".github", "workflows", "legacy.yml"), join(".github", "workflows", "other.yml")];
  const documents = await Promise.all(
    paths.map(async (path) => ({
      uri: pathToFileURL(join(root, path)).href,
      text: await readFile(join(root, path), "utf8"),
    })),
  );
  const ids = new Set<string>();
  try {
    for (const document of documents) {
      send({
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: document.uri,
            languageId: "yaml",
            version: 1,
            text: document.text,
          },
        },
      });
      const published = await new Promise<Array<{ data?: { findingId?: string } }>>((done, fail) => {
        const timer = setTimeout(() => fail(new Error("Timed out waiting for diagnostics.")), 10_000);
        const check = (): void => {
          const found = messages.find(
            (message) =>
              message.method === "textDocument/publishDiagnostics" &&
              (message.params as { uri?: string }).uri === document.uri,
          );
          if (!found) return;
          clearTimeout(timer);
          waiting.delete(check);
          done(
            (
              found.params as {
                diagnostics: Array<{ data?: { findingId?: string } }>;
              }
            ).diagnostics,
          );
        };
        waiting.add(check);
        check();
      });
      for (const diagnostic of published) if (diagnostic.data?.findingId) ids.add(diagnostic.data.findingId);
    }
  } finally {
    await server.dispose();
    input.end();
    output.end();
  }
  return sorted([...ids]);
}

test("the same repository returns the same findings through the core, CLI, MCP server, and GitHub Action", async () => {
  const expected = await viaCore();
  assert.ok(expected.length > 0, "the fixture has findings, so equality is meaningful");
  assert.deepEqual(await viaCli(), expected);
  assert.deepEqual(await viaMcp(), expected);
  assert.deepEqual(await viaAction(), expected);
});

test("the language server reports the same findings for the files the editor opened", async () => {
  // The editor scans open buffers one at a time; this fixture's findings all live in the two files it opens.
  assert.deepEqual(await viaLsp(), await viaCore());
});

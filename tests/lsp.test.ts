import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { builtInDetectors } from "../src/detectors/index.js";
import type { Finding, ScanResult } from "../src/domain.js";
import { scanRepository } from "../src/engine.js";
import {
  EXPLAIN_FINDING_COMMAND,
  OPEN_EVIDENCE_COMMAND,
  readFramedMessages,
  startLanguageServer,
  writeFramedMessage,
} from "../src/lsp.js";

type Message = Record<string, unknown>;

const fixtureRoot = resolve("tests/fixtures/lsp");
const workflowRoot = pathToFileURL(fixtureRoot).href;
const legacyPath = join(fixtureRoot, ".github", "workflows", "legacy.yml");
const otherPath = join(fixtureRoot, ".github", "workflows", "other.yml");
const legacyUri = pathToFileURL(legacyPath).href;
const otherUri = pathToFileURL(otherPath).href;

function params(message: Message): Record<string, unknown> {
  const value = message.params;
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function diagnosticsOf(message: Message): Array<Record<string, unknown>> {
  return params(message).diagnostics as Array<Record<string, unknown>>;
}

function send(input: PassThrough, message: Message): void {
  writeFramedMessage(input, { jsonrpc: "2.0", ...message });
}

class MessageCollector {
  readonly messages: Message[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(stream: PassThrough) {
    readFramedMessages(stream, (message) => {
      this.messages.push(message);
      for (const listener of [...this.listeners]) listener();
    });
  }

  waitFor(predicate: (message: Message) => boolean, timeoutMs = 5000): Promise<Message> {
    return new Promise((resolvePromise, reject) => {
      const check = (): void => {
        const found = this.messages.find(predicate);
        if (!found) return;
        cleanup();
        resolvePromise(found);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for an LSP message."));
      }, timeoutMs);
      const cleanup = (): void => {
        clearTimeout(timer);
        this.listeners.delete(check);
      };
      this.listeners.add(check);
      check();
    });
  }
}

interface Client {
  input: PassThrough;
  output: PassThrough;
  messages: MessageCollector;
  server: ReturnType<typeof startLanguageServer>;
  close: () => Promise<void>;
}

async function connect(options: { scan?: (root: string) => Promise<ScanResult> } = {}): Promise<Client> {
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = new MessageCollector(output);
  const server = startLanguageServer({
    input,
    output,
    debounceMs: 0,
    log: () => {},
    ...(options.scan ? { scan: options.scan } : {}),
  });
  send(input, {
    id: 1,
    method: "initialize",
    params: {
      processId: null,
      rootUri: workflowRoot,
      capabilities: { window: { showDocument: { support: true } } },
    },
  });
  await messages.waitFor((message) => message.id === 1);
  send(input, { method: "initialized", params: {} });
  return {
    input,
    output,
    messages,
    server,
    async close() {
      await server.dispose();
      input.end();
      output.end();
    },
  };
}

test("a workflow fixture shows its diagnostic with evidence on hover", async () => {
  const client = await connect();
  try {
    const text = await readFile(legacyPath, "utf8");
    send(client.input, {
      method: "textDocument/didOpen",
      params: { textDocument: { uri: legacyUri, languageId: "yaml", version: 1, text } },
    });

    const published = await client.messages.waitFor(
      (message) =>
        message.method === "textDocument/publishDiagnostics" &&
        params(message).uri === legacyUri &&
        diagnosticsOf(message).length === 2,
    );
    const diagnostics = diagnosticsOf(published);
    assert.deepEqual(
      diagnostics.map((diagnostic) => diagnostic.code),
      ["github-actions.checkout.node20", "github-actions.setup-node.node20"],
    );
    const first = diagnostics[0]!;
    assert.equal(first.severity, 1);
    assert.equal(first.source, "Evergreen");
    assert.deepEqual(first.range, {
      start: { line: 6, character: 6 },
      end: { line: 6, character: "      - uses: actions/checkout@v4".length },
    });
    assert.match(String((first.codeDescription as Record<string, unknown>).href), /^https:\/\//);
    assert.equal((first.data as Record<string, unknown>).findingId, "github-actions.checkout.node20:.github/workflows/legacy.yml:7");

    send(client.input, {
      id: 2,
      method: "textDocument/hover",
      params: { textDocument: { uri: legacyUri }, position: { line: 6, character: 8 } },
    });
    const hover = await client.messages.waitFor((message) => message.id === 2);
    const contents = (hover.result as Record<string, unknown>).contents as Record<string, unknown>;
    assert.equal(contents.kind, "markdown");
    const markdown = String(contents.value);
    assert.match(markdown, /Unsupported actions\/checkout runtime/);
    assert.match(markdown, /actions\/checkout@v5 or later/);
    assert.match(
      markdown,
      /https:\/\/github\.blog\/changelog\/2026-09-23-node-20-is-no-longer-available-in-github-actions\//,
    );
    assert.match(markdown, /\*\*Evidence\*\*/);

    send(client.input, {
      id: 9,
      method: "textDocument/hover",
      params: { textDocument: { uri: legacyUri }, position: { line: 6, character: 500 } },
    });
    const fallback = await client.messages.waitFor((message) => message.id === 9);
    assert.match(String(((fallback.result as Record<string, unknown>).contents as Record<string, unknown>).value), /Unsupported actions\/checkout runtime/);

    send(client.input, {
      id: 3,
      method: "textDocument/codeAction",
      params: {
        textDocument: { uri: legacyUri },
        range: { start: { line: 6, character: 6 }, end: { line: 6, character: 8 } },
        context: { diagnostics: [first] },
      },
    });
    const actions = (await client.messages.waitFor((message) => message.id === 3)).result as Array<Record<string, unknown>>;
    assert.deepEqual(
      actions.map((action) => (action.command as Record<string, unknown>).command),
      [EXPLAIN_FINDING_COMMAND, OPEN_EVIDENCE_COMMAND],
    );

    send(client.input, {
      id: 4,
      method: "workspace/executeCommand",
      params: { command: EXPLAIN_FINDING_COMMAND, arguments: [(first.data as Record<string, unknown>).findingId, legacyUri] },
    });
    const [executed, explained] = await Promise.all([
      client.messages.waitFor((message) => message.id === 4),
      client.messages.waitFor((message) => message.method === "window/showMessage"),
    ]);
    assert.equal(executed.result, null);
    const explanation = String(params(explained).message);
    assert.match(explanation, /Unsupported actions\/checkout runtime/);
    assert.match(explanation, /https:\/\/github\.com\/actions\/checkout#checkout-v5/);

    send(client.input, {
      id: 10,
      method: "workspace/executeCommand",
      params: {
        command: EXPLAIN_FINDING_COMMAND,
        arguments: [(first.data as Record<string, unknown>).findingId, "file:///another-document"],
      },
    });
    await client.messages.waitFor((message) => message.id === 10);
    const fallbackExplanation = await client.messages.waitFor(
      (message) => message.method === "window/showMessage" && String(params(message).message).includes("actions/checkout@v5 or later"),
    );
    assert.match(String(params(fallbackExplanation).message), /Unsupported actions\/checkout runtime/);

    const evidenceUrl = String(
      ((actions[1]!.command as Record<string, unknown>).arguments as string[])[0],
    );
    send(client.input, {
      id: 5,
      method: "workspace/executeCommand",
      params: { command: OPEN_EVIDENCE_COMMAND, arguments: [evidenceUrl] },
    });
    const shown = await client.messages.waitFor((message) => message.method === "window/showDocument");
    assert.equal(params(shown).uri, evidenceUrl);
    assert.equal(typeof shown.id, "number");
  } finally {
    await client.close();
  }
});

test("scans only the open document and refreshes diagnostics from the buffer", async () => {
  const scannedRoots: string[] = [];
  const scannedFiles: string[][] = [];
  const client = await connect({
    scan: async (root) => {
      scannedRoots.push(root);
      scannedFiles.push(await readdir(join(root, ".github", "workflows")));
      return scanRepository(root, builtInDetectors);
    },
  });

  try {
    const text = await readFile(legacyPath, "utf8");
    send(client.input, {
      method: "textDocument/didOpen",
      params: { textDocument: { uri: legacyUri, languageId: "yaml", version: 1, text } },
    });
    await client.messages.waitFor(
      (message) => message.method === "textDocument/publishDiagnostics" && diagnosticsOf(message).length === 2,
    );
    assert.equal(scannedRoots.length, 1);
    assert.match(scannedRoots[0]!, new RegExp(`^${tmpdir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.deepEqual(scannedFiles[0], ["legacy.yml"], "the other workflow in the workspace is not copied to the scan root");

    const updated = text.replace("actions/checkout@v4", "actions/checkout@v5");
    send(client.input, {
      method: "textDocument/didChange",
      params: { textDocument: { uri: legacyUri, version: 2 }, contentChanges: [{ text: updated }] },
    });
    const refreshed = await client.messages.waitFor(
      (message) => message.method === "textDocument/publishDiagnostics" && diagnosticsOf(message).length === 1,
    );
    assert.deepEqual(
      diagnosticsOf(refreshed).map((diagnostic) => diagnostic.code),
      ["github-actions.setup-node.node20"],
    );

    send(client.input, {
      method: "textDocument/didClose",
      params: { textDocument: { uri: legacyUri } },
    });
    const cleared = await client.messages.waitFor(
      (message) => message.method === "textDocument/publishDiagnostics" && diagnosticsOf(message).length === 0,
    );
    assert.equal(params(cleared).uri, legacyUri);
  } finally {
    await client.close();
  }
});

test("serves documents outside the workspace and ignores unknown or untitled documents", async () => {
  const client = await connect();
  try {
    send(client.input, {
      method: "textDocument/didOpen",
      params: { textDocument: { uri: "untitled:Untitled-1", languageId: "yaml", version: 1, text: "x" } },
    });
    const published = await client.messages.waitFor(
      (message) => message.method === "textDocument/publishDiagnostics" && params(message).uri === "untitled:Untitled-1",
    );
    assert.deepEqual(params(published).diagnostics, []);

    send(client.input, {
      id: 6,
      method: "textDocument/hover",
      params: { textDocument: { uri: otherUri }, position: { line: 0, character: 0 } },
    });
    assert.equal((await client.messages.waitFor((message) => message.id === 6)).result, null);

    send(client.input, {
      id: 7,
      method: "textDocument/codeAction",
      params: {
        textDocument: { uri: "untitled:Untitled-1" },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        context: { only: ["source"] },
      },
    });
    assert.deepEqual((await client.messages.waitFor((message) => message.id === 7)).result, []);

    send(client.input, { method: "textDocument/didChange", params: { textDocument: { uri: "untitled:Untitled-1", version: 2 }, contentChanges: [{ text: "y" }] } });
    send(client.input, { method: "textDocument/didSave", params: { textDocument: { uri: "untitled:Untitled-1" } } });
    send(client.input, { method: "textDocument/didClose", params: { textDocument: { uri: "untitled:missing" } } });
    send(client.input, { id: 8, method: "workspace/unknownMethod", params: {} });
    const unknown = await client.messages.waitFor((message) => message.id === 8);
    assert.equal((unknown.error as Record<string, unknown>).code, -32601);
  } finally {
    await client.close();
  }
});

test("finds the workspace root from workspaceFolders and rootPath", async () => {
  const initializations: Array<Record<string, unknown>> = [
    { capabilities: {}, workspaceFolders: [{ uri: workflowRoot, name: "lsp" }] },
    { capabilities: {}, rootPath: fixtureRoot },
    { capabilities: {}, rootUri: "not a uri" },
  ];
  const text = await readFile(legacyPath, "utf8");

  for (const [index, params] of initializations.entries()) {
    const input = new PassThrough();
    const output = new PassThrough();
    const messages = new MessageCollector(output);
    const server = startLanguageServer({ input, output, debounceMs: 0, log: () => {} });
    try {
      send(input, { id: 1, method: "initialize", params });
      await messages.waitFor((message) => message.id === 1);
      send(input, { method: "initialized", params: {} });
      send(input, {
        method: "textDocument/didOpen",
        params: { textDocument: { uri: legacyUri, languageId: "yaml", version: 1, text } },
      });
      const published = await messages.waitFor((message) => message.method === "textDocument/publishDiagnostics");
      assert.equal(diagnosticsOf(published).length, index < 2 ? 2 : 0);
      await server.settled();
    } finally {
      await server.dispose();
      input.end();
      output.end();
    }
  }
});

test("debounces rapid changes and cancels the pending scan when the document closes", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = new MessageCollector(output);
  let scans = 0;
  const server = startLanguageServer({
    input,
    output,
    debounceMs: 30,
    log: () => {},
    scan: async (root) => {
      scans += 1;
      return scanRepository(root, builtInDetectors);
    },
  });

  try {
    send(input, { id: 1, method: "initialize", params: { rootUri: workflowRoot, capabilities: {} } });
    await messages.waitFor((message) => message.id === 1);
    send(input, { method: "initialized", params: {} });
    const text = await readFile(legacyPath, "utf8");
    send(input, {
      method: "textDocument/didOpen",
      params: { textDocument: { uri: legacyUri, languageId: "yaml", version: 1, text } },
    });
    await messages.waitFor(
      (message) => message.method === "textDocument/publishDiagnostics" && diagnosticsOf(message).length === 2,
    );

    send(input, {
      method: "textDocument/didChange",
      params: { textDocument: { uri: legacyUri, version: 2 }, contentChanges: [{ text: text.replace("checkout@v4", "checkout@v5") }] },
    });
    send(input, {
      method: "textDocument/didChange",
      params: { textDocument: { uri: legacyUri, version: 3 }, contentChanges: [{ text }] },
    });
    send(input, { method: "textDocument/didClose", params: { textDocument: { uri: legacyUri } } });
    await messages.waitFor(
      (message) => message.method === "textDocument/publishDiagnostics" && diagnosticsOf(message).length === 0,
    );

    await server.settled();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 80));
    assert.equal(scans, 1, "closing the document cancels its pending debounced scan");
    assert.deepEqual(
      messages.messages
        .filter((message) => message.method === "textDocument/publishDiagnostics")
        .map((message) => diagnosticsOf(message).length),
      [2, 0],
    );
  } finally {
    await server.dispose();
    input.end();
    output.end();
  }
});

test("serializes scans for one document", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = new MessageCollector(output);
  let active = 0;
  let maximum = 0;
  const server = startLanguageServer({
    input,
    output,
    debounceMs: 0,
    log: () => {},
    scan: async (root) => {
      active += 1;
      maximum = Math.max(maximum, active);
      try {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
        return await scanRepository(root, builtInDetectors);
      } finally {
        active -= 1;
      }
    },
  });

  try {
    send(input, { id: 1, method: "initialize", params: { rootUri: workflowRoot, capabilities: {} } });
    await messages.waitFor((message) => message.id === 1);
    send(input, { method: "initialized", params: {} });
    const text = await readFile(legacyPath, "utf8");
    send(input, {
      method: "textDocument/didOpen",
      params: { textDocument: { uri: legacyUri, languageId: "yaml", version: 1, text } },
    });
    await messages.waitFor(
      (message) => message.method === "textDocument/publishDiagnostics" && diagnosticsOf(message).length === 2,
    );

    for (let version = 2; version <= 6; version += 1) {
      send(input, {
        method: "textDocument/didChange",
        params: { textDocument: { uri: legacyUri, version }, contentChanges: [{ text }] },
      });
    }
    await new Promise((resolvePromise) => setImmediate(resolvePromise));
    await server.settled();
    assert.equal(maximum, 1, "scans for one document never overlap");
    assert.equal(active, 0);
  } finally {
    await server.dispose();
    input.end();
    output.end();
  }
});

test("retires the previous document when the same uri is opened again", async () => {
  const scanDirectories = async (): Promise<number> =>
    (await readdir(tmpdir(), { withFileTypes: true })).filter(
      (entry) => entry.isDirectory() && entry.name.startsWith("evergreen-lsp-"),
    ).length;
  const before = await scanDirectories();
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = new MessageCollector(output);
  const server = startLanguageServer({ input, output, debounceMs: 0, log: () => {} });

  try {
    send(input, { id: 1, method: "initialize", params: { rootUri: workflowRoot, capabilities: {} } });
    await messages.waitFor((message) => message.id === 1);
    send(input, { method: "initialized", params: {} });
    const text = await readFile(legacyPath, "utf8");
    const updated = text.replace("actions/checkout@v4", "actions/checkout@v5");
    send(input, {
      method: "textDocument/didOpen",
      params: { textDocument: { uri: legacyUri, languageId: "yaml", version: 1, text } },
    });
    await messages.waitFor(
      (message) => message.method === "textDocument/publishDiagnostics" && params(message).version === 1,
    );

    send(input, {
      method: "textDocument/didOpen",
      params: { textDocument: { uri: legacyUri, languageId: "yaml", version: 2, text: updated } },
    });
    await messages.waitFor(
      (message) => message.method === "textDocument/publishDiagnostics" && params(message).version === 2,
    );
    send(input, { method: "textDocument/didClose", params: { textDocument: { uri: legacyUri } } });
    await messages.waitFor(
      (message) => message.method === "textDocument/publishDiagnostics" && diagnosticsOf(message).length === 0,
    );
    await server.settled();

    for (let attempt = 0; attempt < 100 && (await scanDirectories()) > before; attempt += 1) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    }
    assert.equal(await scanDirectories(), before, "no scan directory is left behind");

    const published = messages.messages.filter(
      (message) => message.method === "textDocument/publishDiagnostics" && params(message).uri === legacyUri,
    );
    const latestOpen = published.filter((message) => diagnosticsOf(message).length > 0).at(-1)!;
    assert.equal(params(latestOpen).version, 2);
    assert.deepEqual(
      diagnosticsOf(latestOpen).map((diagnostic) => diagnostic.code),
      ["github-actions.setup-node.node20"],
    );
    assert.equal(diagnosticsOf(published.at(-1)!).length, 0);
  } finally {
    await server.dispose();
    input.end();
    output.end();
  }
});

test("logs scan failures and publishes no diagnostics", async () => {
  const failures: Array<unknown> = [new Error("engine exploded"), "engine exploded as text"];

  for (const failure of failures) {
    const input = new PassThrough();
    const output = new PassThrough();
    const messages = new MessageCollector(output);
    const logs: string[] = [];
    const server = startLanguageServer({
      input,
      output,
      debounceMs: 0,
      log: (message) => logs.push(message),
      scan: async () => {
        throw failure;
      },
    });

    try {
      send(input, { id: 1, method: "initialize", params: { rootUri: workflowRoot, capabilities: {} } });
      await messages.waitFor((message) => message.id === 1);
      send(input, { method: "initialized", params: {} });
      const text = await readFile(legacyPath, "utf8");
      send(input, {
        method: "textDocument/didOpen",
        params: { textDocument: { uri: legacyUri, languageId: "yaml", version: 1, text } },
      });
      await server.settled();
      assert.ok(logs.some((message) => message.includes("engine exploded")));
      assert.equal(messages.messages.filter((message) => message.method === "textDocument/publishDiagnostics").length, 0);
    } finally {
      await server.dispose();
      input.end();
      output.end();
    }
  }
});

test("maps column findings and builds actions for the whole document", async () => {
  const finding: Finding = {
    id: "example.rule:.github/workflows/legacy.yml:7",
    ruleId: "example.rule",
    detector: "example",
    title: "Example lifecycle finding",
    summary: "The example package is no longer supported.",
    severity: "medium",
    confidence: "exact",
    location: { path: ".github/workflows/legacy.yml", line: 7, column: 17 },
    replacement: "example-package@2",
    deadline: "2027-01-01",
    sources: [{ title: "Example evidence", url: "https://example.com/evidence" }],
    impact: { usageCount: 2, affectedFiles: 1, level: "low" },
  };
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = new MessageCollector(output);
  const server = startLanguageServer({
    input,
    output,
    debounceMs: 0,
    log: () => {},
    scan: async (root) => ({
      schemaVersion: "evergreen.scan.v1",
      root,
      scannedAt: "2026-01-01T00:00:00.000Z",
      findings: [finding],
      diagnostics: [],
    }),
  });

  try {
    send(input, { id: 1, method: "initialize", params: { rootUri: workflowRoot, capabilities: {} } });
    await messages.waitFor((message) => message.id === 1);
    send(input, { method: "initialized", params: {} });
    const text = await readFile(legacyPath, "utf8");
    send(input, {
      method: "textDocument/didOpen",
      params: { textDocument: { uri: legacyUri, languageId: "yaml", version: 1, text } },
    });
    const published = await messages.waitFor(
      (message) => message.method === "textDocument/publishDiagnostics" && diagnosticsOf(message).length === 1,
    );
    const diagnostic = diagnosticsOf(published)[0]!;
    assert.deepEqual(diagnostic.range, {
      start: { line: 6, character: 16 },
      end: { line: 6, character: "      - uses: actions/checkout@v4".length },
    });

    send(input, {
      id: 2,
      method: "textDocument/hover",
      params: { textDocument: { uri: legacyUri }, position: { line: 6, character: 20 } },
    });
    const hover = await messages.waitFor((message) => message.id === 2);
    const markdown = String(((hover.result as Record<string, unknown>).contents as Record<string, unknown>).value);
    assert.match(markdown, /Example lifecycle finding/);
    assert.match(markdown, /\*\*Usages:\*\* 2 in 1 file\(s\)/);
    assert.match(markdown, /example-package@2/);
    assert.match(markdown, /https:\/\/example\.com\/evidence/);

    send(input, {
      id: 3,
      method: "textDocument/codeAction",
      params: { textDocument: { uri: legacyUri }, context: { only: ["quickfix"] } },
    });
    const actions = (await messages.waitFor((message) => message.id === 3)).result as Array<Record<string, unknown>>;
    assert.equal(actions.length, 2);
    assert.equal((actions[0]!.command as Record<string, unknown>).command, EXPLAIN_FINDING_COMMAND);
  } finally {
    await server.dispose();
    input.end();
    output.end();
  }
});

test("reports executeCommand failures and falls back when showDocument is unsupported", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = new MessageCollector(output);
  const exitCodes: number[] = [];
  const server = startLanguageServer({
    input,
    output,
    debounceMs: 0,
    log: () => {},
    exit: (code) => exitCodes.push(code),
  });

  try {
    send(input, { id: 1, method: "initialize", params: { rootUri: workflowRoot, capabilities: {} } });
    await messages.waitFor((message) => message.id === 1);
    send(input, { method: "initialized", params: {} });

    send(input, { id: 2, method: "workspace/executeCommand", params: { command: EXPLAIN_FINDING_COMMAND, arguments: ["missing"] } });
    const missingFinding = await messages.waitFor((message) => message.id === 2);
    assert.equal((missingFinding.error as Record<string, unknown>).code, -32602);

    send(input, { id: 3, method: "workspace/executeCommand", params: { command: OPEN_EVIDENCE_COMMAND, arguments: ["file:///tmp/evidence"] } });
    assert.equal(((await messages.waitFor((message) => message.id === 3)).error as Record<string, unknown>).code, -32602);

    send(input, { id: 4, method: "workspace/executeCommand", params: { command: "evergreen.unknown", arguments: [] } });
    assert.equal(((await messages.waitFor((message) => message.id === 4)).error as Record<string, unknown>).code, -32602);

    const url = "https://example.com/evidence";
    send(input, { id: 5, method: "workspace/executeCommand", params: { command: OPEN_EVIDENCE_COMMAND, arguments: [url] } });
    await messages.waitFor((message) => message.id === 5);
    const message = await messages.waitFor(
      (candidate) => candidate.method === "window/showMessage" && String(params(candidate).message).includes(url),
    );
    assert.match(String(params(message).message), /Evergreen evidence/);

    send(input, { id: 6, method: "shutdown" });
    assert.equal((await messages.waitFor((candidate) => candidate.id === 6)).result, null);
    send(input, { method: "exit" });
    for (let attempt = 0; attempt < 100 && exitCodes.length === 0; attempt += 1) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    }
    assert.deepEqual(exitCodes, [0]);
  } finally {
    await server.dispose();
    input.end();
    output.end();
  }
});

test("exit without shutdown reports a failure", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const exitCodes: number[] = [];
  const server = startLanguageServer({ input, output, debounceMs: 0, exit: (code) => exitCodes.push(code) });
  send(input, { method: "exit" });
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  assert.deepEqual(exitCodes, [1]);
  await server.dispose();
  input.end();
  output.end();
});

test("bounds a header without a terminator and keeps reading", async () => {
  const stream = new PassThrough();
  const received: Message[] = [];
  const errors: string[] = [];
  readFramedMessages(stream, (message) => received.push(message), (error) => errors.push(error.message));

  stream.write(`Content-Length: 5\r\n${"x".repeat(9000)}`);
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /header exceeds 8192 bytes/);

  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "test" });
  stream.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.deepEqual(received, [{ jsonrpc: "2.0", id: 1, method: "test" }]);
  stream.end();
});

test("reads Content-Length framed messages split across chunks and reports malformed frames", async () => {
  const stream = new PassThrough();
  const received: Message[] = [];
  const errors: string[] = [];
  readFramedMessages(stream, (message) => received.push(message), (error) => errors.push(error.message));

  const first = "{}";
  const second = JSON.stringify({ jsonrpc: "2.0", id: 7, method: "x" });
  const firstFrame = `Content-Length: ${first.length}\r\n\r\n${first}`;
  const secondFrame = `Content-Length: ${Buffer.byteLength(second)}\r\n\r\n${second}`;
  stream.write(firstFrame.slice(0, 8));
  stream.write(firstFrame.slice(8) + secondFrame.slice(0, 12));
  stream.write(secondFrame.slice(12));
  stream.write("Content-Length: 8\r\n\r\nnot json");
  stream.write("\r\n\r\n");
  stream.write("Content-Length: 2\r\n\r\n[]");
  await new Promise((resolvePromise) => setImmediate(resolvePromise));

  assert.deepEqual(received, [{}, { jsonrpc: "2.0", id: 7, method: "x" }]);
  assert.equal(errors.length, 3);
  stream.end();
});

test("writes one Content-Length framed message", async () => {
  const output = new PassThrough();
  let text = "";
  output.on("data", (chunk: Buffer) => {
    text += chunk.toString("utf8");
  });
  writeFramedMessage(output, { a: 1 });
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(text, 'Content-Length: 7\r\n\r\n{"a":1}');
});

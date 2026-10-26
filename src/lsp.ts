#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { builtInDetectors } from "./detectors/index.js";
import type { Finding, ScanResult, Severity } from "./domain.js";
import { scanRepository } from "./engine.js";
import { VERSION } from "./version.js";

export const LANGUAGE_SERVER_NAME = "evergreen";
export const DIAGNOSTIC_SOURCE = "Evergreen";
export const EXPLAIN_FINDING_COMMAND = "evergreen.explainFinding";
export const OPEN_EVIDENCE_COMMAND = "evergreen.openEvidence";

type JsonObject = Record<string, unknown>;

interface LspPosition {
  line: number;
  character: number;
}

interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

interface LspDiagnostic {
  range: LspRange;
  severity: number;
  code: string;
  codeDescription?: { href: string };
  source: string;
  message: string;
  data: { findingId: string; ruleId: string };
}

const DIAGNOSTIC_SEVERITY: Record<Severity, number> = {
  critical: 1,
  high: 1,
  medium: 2,
  low: 3,
  info: 3,
};

const MESSAGE_TYPE = { error: 1, warning: 2, info: 3, log: 4 } as const;

const TEXT_DOCUMENT_SYNC_FULL = 1;

interface OpenDocument {
  uri: string;
  version: number | undefined;
  text: string;
  scanRoot: string | undefined;
  findings: Finding[];
  diagnostics: LspDiagnostic[];
  generation: number;
  timer: NodeJS.Timeout | undefined;
  latestScan: Promise<void>;
}

export interface LanguageServerOptions {
  /** Receives every outgoing JSON-RPC message. Defaults to discarding them. */
  write?: (message: JsonObject) => void;
  /** Receives scan and protocol errors. Defaults to discarding them. */
  log?: (message: string) => void;
  /** How long to wait for typing to settle before scanning. Defaults to 250 ms. */
  debounceMs?: number;
  /** Called with the exit code when the client sends `exit`. Defaults to doing nothing. */
  exit?: (code: number) => void;
  /** The engine used for one file. Exposed so a test can count scans. */
  scan?: (root: string) => Promise<ScanResult>;
}

class RpcError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
    this.name = "RpcError";
  }
}

/**
 * A language server for lifecycle diagnostics. The client sends document text over stdio; the server writes
 * that one buffer into a temporary directory and runs the detector engine there, so a scan never reads the rest
 * of the workspace and never writes to the repository. Diagnostics, hover evidence, and quick fixes are derived
 * from the resulting findings.
 */
export class EvergreenLanguageServer {
  private readonly documents = new Map<string, OpenDocument>();
  private readonly write: (message: JsonObject) => void;
  private readonly log: (message: string) => void;
  private readonly debounceMs: number;
  private readonly exit: (code: number) => void;
  private readonly scan: (root: string) => Promise<ScanResult>;
  private workspaceRoot: string | undefined;
  private clientCapabilities: JsonObject = {};
  private shutdownRequested = false;
  private disposed = false;
  private nextRequestId = 1;

  constructor(options: LanguageServerOptions = {}) {
    this.write = options.write ?? (() => {});
    this.log = options.log ?? (() => {});
    this.debounceMs = options.debounceMs ?? 250;
    this.exit = options.exit ?? (() => {});
    this.scan = options.scan ?? ((root) => scanRepository(root, builtInDetectors));
  }

  async handleMessage(message: JsonObject): Promise<JsonObject | undefined> {
    const method = message.method;
    if (typeof method !== "string") return undefined;

    const id = message.id;
    const hasId = typeof id === "string" || typeof id === "number";
    try {
      const result = await this.dispatch(method, message.params);
      if (!hasId) return undefined;
      return { jsonrpc: "2.0", id, result: result ?? null };
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.log(`Evergreen language server: ${method} failed: ${text}`);
      if (!hasId) return undefined;
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: error instanceof RpcError ? error.code : -32603,
          message: text,
        },
      };
    }
  }

  /** Waits for every scan started so far. Tests use it to observe diagnostics deterministically. */
  async settled(): Promise<void> {
    await Promise.all([...this.documents.values()].map((document) => document.latestScan));
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const document of this.documents.values()) this.cancel(document);
    await Promise.all([...this.documents.values()].map((document) => document.latestScan));
    await Promise.all(
      [...this.documents.values()].map(async (document) => {
        if (document.scanRoot) await rm(document.scanRoot, { recursive: true, force: true });
      }),
    );
    this.documents.clear();
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "initialize":
        return this.initialize(params);
      case "initialized":
      case "workspace/didChangeConfiguration":
      case "workspace/didChangeWatchedFiles":
      case "textDocument/willSave":
      case "$/cancelRequest":
      case "$/setTrace":
      case "window/workDoneProgress/cancel":
        return undefined;
      case "shutdown":
        this.shutdownRequested = true;
        return null;
      case "exit":
        await this.dispose();
        this.exit(this.shutdownRequested ? 0 : 1);
        return undefined;
      case "textDocument/didOpen":
        this.didOpen(params);
        return undefined;
      case "textDocument/didChange":
        this.didChange(params);
        return undefined;
      case "textDocument/didSave":
        this.didSave(params);
        return undefined;
      case "textDocument/didClose":
        await this.didClose(params);
        return undefined;
      case "textDocument/hover":
        return this.hover(params);
      case "textDocument/codeAction":
        return this.codeAction(params);
      case "workspace/executeCommand":
        return this.executeCommand(params);
      default:
        throw new RpcError(-32601, `Method not found: ${method}`);
    }
  }

  private initialize(params: unknown): JsonObject {
    const object = asObject(params);
    this.workspaceRoot = workspaceRootFrom(object);
    this.clientCapabilities = asObject(object?.capabilities) ?? {};
    return {
      capabilities: {
        positionEncoding: "utf-16",
        textDocumentSync: {
          openClose: true,
          change: TEXT_DOCUMENT_SYNC_FULL,
          save: { includeText: false },
        },
        hoverProvider: true,
        codeActionProvider: { codeActionKinds: ["quickfix"] },
        executeCommandProvider: { commands: [EXPLAIN_FINDING_COMMAND, OPEN_EVIDENCE_COMMAND] },
      },
      serverInfo: { name: LANGUAGE_SERVER_NAME, version: VERSION },
    };
  }

  private didOpen(params: unknown): void {
    const textDocument = asObject(asObject(params)?.textDocument);
    const uri = stringField(textDocument, "uri");
    if (!uri) return;
    const version = textDocument?.version;
    const document: OpenDocument = {
      uri,
      version: typeof version === "number" ? version : undefined,
      text: stringField(textDocument, "text") ?? "",
      scanRoot: undefined,
      findings: [],
      diagnostics: [],
      generation: 0,
      timer: undefined,
      latestScan: Promise.resolve(),
    };
    this.documents.set(uri, document);
    this.schedule(document, true);
  }

  private didChange(params: unknown): void {
    const object = asObject(params);
    const textDocument = asObject(object?.textDocument);
    const uri = stringField(textDocument, "uri");
    if (!uri) return;
    const document = this.documents.get(uri);
    if (!document) return;

    const changes = Array.isArray(object?.contentChanges) ? object.contentChanges : [];
    const lastChange = changes.length > 0 ? asObject(changes.at(-1)) : undefined;
    if (lastChange && typeof lastChange.text === "string") document.text = lastChange.text;
    const version = textDocument?.version;
    if (typeof version === "number") document.version = version;
    this.schedule(document, false);
  }

  private didSave(params: unknown): void {
    const textDocument = asObject(asObject(params)?.textDocument);
    const uri = stringField(textDocument, "uri");
    const document = uri ? this.documents.get(uri) : undefined;
    if (document) this.schedule(document, true);
  }

  private async didClose(params: unknown): Promise<void> {
    const textDocument = asObject(asObject(params)?.textDocument);
    const uri = stringField(textDocument, "uri");
    const document = uri ? this.documents.get(uri) : undefined;
    if (!document || !uri) return;
    this.cancel(document);
    document.generation += 1;
    this.documents.delete(uri);
    this.write({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: { uri, diagnostics: [] },
    });
    await document.latestScan;
    if (document.scanRoot) await rm(document.scanRoot, { recursive: true, force: true });
  }

  private hover(params: unknown): JsonObject | null {
    const object = asObject(params);
    const document = this.documentFrom(object);
    const position = asPosition(asObject(object?.position));
    if (!document || !position) return null;
    const index = this.findingIndexAt(document, position);
    if (index < 0) return null;
    const finding = document.findings[index];
    const diagnostic = document.diagnostics[index];
    if (!finding || !diagnostic) return null;
    return {
      contents: { kind: "markdown", value: hoverMarkdown(finding, diagnostic.range) },
      range: diagnostic.range,
    };
  }

  private codeAction(params: unknown): JsonObject[] {
    const object = asObject(params);
    const document = this.documentFrom(object);
    if (!document) return [];

    const context = asObject(object?.context);
    const only = Array.isArray(context?.only) ? context.only.filter(isString) : [];
    if (only.length > 0 && !only.some((kind) => kind === "quickfix" || kind.startsWith("quickfix."))) return [];

    const requested = asRange(object?.range) ?? documentRange(document);
    const contextFindings = new Set(
      (Array.isArray(context?.diagnostics) ? context.diagnostics : [])
        .map((diagnostic) => stringField(asObject(asObject(diagnostic)?.data), "findingId"))
        .filter(isString),
    );

    const actions: JsonObject[] = [];
    document.findings.forEach((finding, index) => {
      const diagnostic = document.diagnostics[index];
      if (!diagnostic) return;
      if (!contextFindings.has(finding.id) && !rangesOverlap(requested, diagnostic.range)) return;

      actions.push({
        title: `Evergreen: explain ${finding.title}`,
        kind: "quickfix",
        diagnostics: [diagnostic],
        command: {
          title: "Explain this lifecycle finding with Evergreen",
          command: EXPLAIN_FINDING_COMMAND,
          arguments: [finding.id, document.uri],
        },
      });

      const url = firstSourceUrl(finding);
      if (url) {
        actions.push({
          title: `Evergreen: open evidence for ${finding.ruleId}`,
          kind: "quickfix",
          diagnostics: [diagnostic],
          command: {
            title: "Open the lifecycle evidence with Evergreen",
            command: OPEN_EVIDENCE_COMMAND,
            arguments: [url],
          },
        });
      }
    });
    return actions;
  }

  private executeCommand(params: unknown): null {
    const object = asObject(params);
    const command = object?.command;
    const args = Array.isArray(object?.arguments) ? object.arguments : [];

    if (command === EXPLAIN_FINDING_COMMAND) {
      const finding = this.findingById(args[0], args[1]);
      if (!finding) throw new RpcError(-32602, `Unknown Evergreen finding: ${String(args[0])}`);
      this.write({
        jsonrpc: "2.0",
        method: "window/showMessage",
        params: { type: MESSAGE_TYPE.info, message: explainMessage(finding) },
      });
      return null;
    }

    if (command === OPEN_EVIDENCE_COMMAND) {
      const url = args[0];
      if (!isHttpUrl(url)) throw new RpcError(-32602, `Evergreen needs an http(s) evidence URL, got: ${String(url)}`);
      if (this.supportsShowDocument()) {
        this.sendRequest("window/showDocument", { uri: url, external: true, takeFocus: true });
      } else {
        this.write({
          jsonrpc: "2.0",
          method: "window/showMessage",
          params: { type: MESSAGE_TYPE.info, message: `Evergreen evidence: ${url}` },
        });
      }
      return null;
    }

    throw new RpcError(-32602, `Unknown command: ${String(command)}`);
  }

  private async scanDocument(document: OpenDocument): Promise<void> {
    if (this.disposed) return;
    const generation = document.generation + 1;
    document.generation = generation;
    const documentPath = this.documentPath(document.uri);
    let findings: Finding[] = [];

    if (documentPath) {
      const scanRoot = document.scanRoot ?? (await mkdtemp(join(tmpdir(), "evergreen-lsp-")));
      document.scanRoot = scanRoot;
      const target = join(scanRoot, ...documentPath.split("/"));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, document.text, "utf8");
      if (this.disposed || generation !== document.generation) return;

      const result = await this.scan(scanRoot);
      if (this.disposed || generation !== document.generation) return;
      findings = result.findings.filter((finding) => normalizePath(finding.location.path) === documentPath);
    }

    document.findings = findings;
    document.diagnostics = findings.map((finding) => diagnosticFor(document, finding));
    this.publishDiagnostics(document);
  }

  private schedule(document: OpenDocument, immediate: boolean): void {
    if (this.disposed) return;
    this.cancel(document);
    const run = (): void => {
      document.timer = undefined;
      document.latestScan = this.scanDocument(document).catch((error: unknown) => {
        this.log(`Evergreen language server: scanning ${document.uri} failed: ${errorMessage(error)}`);
      });
    };
    if (immediate || this.debounceMs <= 0) run();
    else document.timer = setTimeout(run, this.debounceMs);
  }

  private cancel(document: OpenDocument): void {
    if (!document.timer) return;
    clearTimeout(document.timer);
    document.timer = undefined;
  }

  private publishDiagnostics(document: OpenDocument): void {
    const params: JsonObject = { uri: document.uri, diagnostics: document.diagnostics };
    if (typeof document.version === "number") params.version = document.version;
    this.write({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params });
  }

  private documentPath(uri: string): string | undefined {
    const absolute = uriToFilePath(uri);
    if (!absolute) return undefined;
    if (this.workspaceRoot) {
      const path = relative(this.workspaceRoot, absolute);
      if (path.length > 0 && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)) {
        return path.split(sep).join("/");
      }
    }
    const name = basename(absolute);
    return name.length > 0 ? name : undefined;
  }

  private documentFrom(object: JsonObject | undefined): OpenDocument | undefined {
    const uri = stringField(asObject(object?.textDocument), "uri");
    return uri ? this.documents.get(uri) : undefined;
  }

  private findingIndexAt(document: OpenDocument, position: LspPosition): number {
    const inside = document.diagnostics.findIndex((diagnostic) => positionInRange(position, diagnostic.range));
    if (inside >= 0) return inside;
    return document.diagnostics.findIndex((diagnostic) => diagnostic.range.start.line === position.line);
  }

  private findingById(id: unknown, uri: unknown): Finding | undefined {
    if (typeof id !== "string") return undefined;
    if (typeof uri === "string") {
      const document = this.documents.get(uri);
      const found = document?.findings.find((finding) => finding.id === id);
      if (found) return found;
    }
    for (const document of this.documents.values()) {
      const found = document.findings.find((finding) => finding.id === id);
      if (found) return found;
    }
    return undefined;
  }

  private supportsShowDocument(): boolean {
    return asObject(asObject(this.clientCapabilities.window)?.showDocument)?.support === true;
  }

  private sendRequest(method: string, params: unknown): void {
    this.write({ jsonrpc: "2.0", id: this.nextRequestId, method, params });
    this.nextRequestId += 1;
  }
}

export interface StartLanguageServerOptions extends LanguageServerOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/** Starts the server on stdio, or on the streams a test supplies, and returns it. */
export function startLanguageServer(options: StartLanguageServerOptions = {}): EvergreenLanguageServer {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const log = options.log ?? ((message: string) => process.stderr.write(`${message}\n`));
  const write = options.write ?? ((message: JsonObject) => writeFramedMessage(output, message));
  const server = new EvergreenLanguageServer({
    ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }),
    ...(options.scan === undefined ? {} : { scan: options.scan }),
    write,
    log,
    exit: options.exit ?? ((code) => process.exit(code)),
  });

  readFramedMessages(
    input,
    (message) => {
      void server.handleMessage(message).then((response) => {
        if (response) write(response);
      });
    },
    (error) => log(`Evergreen language server: ${error.message}`),
  );
  input.on("end", () => {
    void server.dispose();
  });
  return server;
}

/** Writes one JSON-RPC message with the LSP `Content-Length` framing. */
export function writeFramedMessage(output: NodeJS.WritableStream, message: unknown): void {
  const body = JSON.stringify(message);
  output.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

/** Reads `Content-Length` framed JSON-RPC messages from a stream. */
export function readFramedMessages(
  input: NodeJS.ReadableStream,
  onMessage: (message: JsonObject) => void,
  onError: (error: Error) => void = () => {},
): void {
  let buffer = Buffer.alloc(0);
  input.on("data", (chunk: Buffer | string) => {
    buffer = Buffer.concat([buffer, typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = buffer.subarray(0, headerEnd).toString("ascii");
      const length = /(?:^|\r\n)content-length:\s*(\d+)/i.exec(header);
      if (!length) {
        onError(new Error("LSP message has no Content-Length header."));
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }
      const start = headerEnd + 4;
      const end = start + Number(length[1]);
      if (buffer.length < end) return;
      const body = buffer.subarray(start, end).toString("utf8");
      buffer = buffer.subarray(end);
      try {
        const parsed: unknown = JSON.parse(body);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          onMessage(parsed as JsonObject);
        } else {
          onError(new Error("LSP message is not a JSON object."));
        }
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  });
  input.on("error", onError);
}

function workspaceRootFrom(params: JsonObject | undefined): string | undefined {
  const folders = params?.workspaceFolders;
  if (Array.isArray(folders)) {
    for (const folder of folders) {
      const path = uriToFilePath(stringField(asObject(folder), "uri") ?? "");
      if (path) return path;
    }
  }
  const rootUri = stringField(params, "rootUri");
  if (rootUri) {
    const path = uriToFilePath(rootUri);
    if (path) return path;
  }
  const rootPath = stringField(params, "rootPath");
  return rootPath ? resolve(rootPath) : undefined;
}

function uriToFilePath(uri: string): string | undefined {
  try {
    const url = new URL(uri);
    return url.protocol === "file:" ? fileURLToPath(url) : undefined;
  } catch {
    return undefined;
  }
}

function diagnosticFor(document: OpenDocument, finding: Finding): LspDiagnostic {
  const url = firstSourceUrl(finding);
  return {
    range: findingRange(finding, document.text),
    severity: DIAGNOSTIC_SEVERITY[finding.severity],
    code: finding.ruleId,
    ...(url ? { codeDescription: { href: url } } : {}),
    source: DIAGNOSTIC_SOURCE,
    message: finding.summary.length > 0 ? `${finding.title}\n\n${finding.summary}` : finding.title,
    data: { findingId: finding.id, ruleId: finding.ruleId },
  };
}

function findingRange(finding: Finding, text: string): LspRange {
  const lines = text.split(/\r\n|\r|\n/);
  const line = clamp((finding.location.line ?? 1) - 1, 0, Math.max(lines.length - 1, 0));
  const lineText = lines[line] ?? "";
  const column = finding.location.column;
  if (column === undefined) {
    const start = Math.max(lineText.search(/\S/), 0);
    return { start: { line, character: start }, end: { line, character: Math.max(lineText.trimEnd().length, start) } };
  }
  const start = clamp(column - 1, 0, lineText.length);
  const firstToken = lineText.slice(start).search(/\S/);
  const tokenStart = firstToken >= 0 ? start + firstToken : start;
  const token = /^\S+/.exec(lineText.slice(tokenStart));
  const end = token ? tokenStart + token[0].length : Math.min(tokenStart + 1, lineText.length);
  return { start: { line, character: tokenStart }, end: { line, character: Math.max(end, tokenStart) } };
}

function documentRange(document: OpenDocument): LspRange {
  const lines = document.text.split(/\r\n|\r|\n/);
  const lastLine = Math.max(lines.length - 1, 0);
  return {
    start: { line: 0, character: 0 },
    end: { line: lastLine, character: (lines[lastLine] ?? "").length },
  };
}

function positionInRange(position: LspPosition, range: LspRange): boolean {
  if (position.line < range.start.line || position.line > range.end.line) return false;
  if (position.line === range.start.line && position.character < range.start.character) return false;
  if (position.line === range.end.line && position.character > range.end.character) return false;
  return true;
}

function rangesOverlap(left: LspRange, right: LspRange): boolean {
  return !(
    left.end.line < right.start.line ||
    right.end.line < left.start.line ||
    (left.end.line === right.start.line && left.end.character < right.start.character) ||
    (right.end.line === left.start.line && right.end.character < left.start.character)
  );
}

function hoverMarkdown(finding: Finding, range: LspRange): string {
  const lines = [
    `**${finding.title}**`,
    "",
    finding.summary,
    "",
    `- **Severity:** ${finding.severity}`,
    `- **Confidence:** ${finding.confidence}`,
    `- **Rule:** \`${finding.ruleId}\``,
    `- **Location:** line ${range.start.line + 1}`,
  ];
  if (finding.replacement) lines.push(`- **Replacement:** ${finding.replacement}`);
  if (finding.deadline) lines.push(`- **Deadline:** ${finding.deadline}`);
  if (finding.impact) lines.push(`- **Usages:** ${finding.impact.usageCount} in ${finding.impact.affectedFiles} file(s)`);

  if (finding.sources.length > 0) {
    lines.push("", "**Evidence**");
    for (const source of finding.sources) lines.push(`- [${source.title}](${source.url})`);
  }
  if (finding.migration?.verification.length) {
    lines.push("", "**Verify after changing**");
    for (const command of finding.migration.verification) lines.push(`- \`${command.command}\` — ${command.purpose}`);
  }
  return lines.join("\n");
}

function explainMessage(finding: Finding): string {
  const parts = [`Evergreen: ${finding.title}`, finding.summary];
  if (finding.replacement) parts.push(`Replacement: ${finding.replacement}`);
  if (finding.deadline) parts.push(`Deadline: ${finding.deadline}`);
  const urls = finding.sources.map((source) => source.url).filter(isHttpUrl);
  if (urls.length > 0) parts.push(`Evidence: ${urls.join(" ")}`);
  return parts.join("\n");
}

function firstSourceUrl(finding: Finding): string | undefined {
  return finding.sources.map((source) => source.url).find(isHttpUrl);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function stringField(object: JsonObject | undefined, key: string): string | undefined {
  const value = object?.[key];
  return typeof value === "string" ? value : undefined;
}

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function asPosition(value: JsonObject | undefined): LspPosition | undefined {
  if (!value || typeof value.line !== "number" || typeof value.character !== "number") return undefined;
  return { line: value.line, character: value.character };
}

function asRange(value: unknown): LspRange | undefined {
  const object = asObject(value);
  const start = asPosition(asObject(object?.start));
  const end = asPosition(asObject(object?.end));
  return start && end ? { start, end } : undefined;
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(resolve(entry))).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) startLanguageServer();

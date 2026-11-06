// The language-server class: JSON-RPC dispatch, initialization, commands, and stdio startup.

import type { ScanResult } from "../domain.js";
import { runScanRequest } from "../scan-request.js";
import { VERSION } from "../version.js";
import { explainMessage, isHttpUrl } from "./diagnostics.js";
import { DocumentStore, workspaceRootFrom } from "./documents.js";
import type { OpenDocument } from "./documents.js";
import { codeActionsFor, findingById, hoverAt } from "./features.js";
import {
  EXPLAIN_FINDING_COMMAND,
  LANGUAGE_SERVER_NAME,
  MESSAGE_TYPE,
  OPEN_EVIDENCE_COMMAND,
  RpcError,
  TEXT_DOCUMENT_SYNC_FULL,
  asObject,
  errorMessage,
  readFramedMessages,
  stringField,
  writeFramedMessage,
} from "./protocol.js";
import type { JsonObject } from "./protocol.js";

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

const IGNORED_METHODS = [
  "initialized",
  "workspace/didChangeConfiguration",
  "workspace/didChangeWatchedFiles",
  "textDocument/willSave",
  "$/cancelRequest",
  "$/setTrace",
  "window/workDoneProgress/cancel",
] as const;

/**
 * A language server for lifecycle diagnostics. The client sends document text over stdio; the server writes
 * that one buffer into a temporary directory and runs the detector engine there, so a scan never reads the rest
 * of the workspace and never writes to the repository. Diagnostics, hover evidence, and quick fixes are derived
 * from the resulting findings.
 */
export class EvergreenLanguageServer {
  private readonly write: (message: JsonObject) => void;
  private readonly log: (message: string) => void;
  private readonly exit: (code: number) => void;
  private readonly store: DocumentStore;
  private readonly handlers: Record<string, (params: unknown) => unknown>;
  private clientCapabilities: JsonObject = {};
  private shutdownRequested = false;
  private disposed = false;
  private nextRequestId = 1;

  constructor(options: LanguageServerOptions = {}) {
    this.write = options.write ?? (() => {});
    this.log = options.log ?? (() => {});
    this.exit = options.exit ?? (() => {});
    this.store = new DocumentStore({
      write: this.write,
      log: this.log,
      scan: options.scan ?? (async (root) => (await runScanRequest({ root })).result),
      debounceMs: options.debounceMs ?? 250,
    });
    this.handlers = this.buildHandlers();
  }

  async handleMessage(message: JsonObject): Promise<JsonObject | undefined> {
    const method = message.method;
    if (typeof method !== "string") return undefined;

    const id = message.id;
    const hasId = typeof id === "string" || typeof id === "number";
    try {
      const handler = this.handlers[method];
      if (!handler) throw new RpcError(-32601, `Method not found: ${method}`);
      const result = await handler(message.params);
      if (!hasId) return undefined;
      return { jsonrpc: "2.0", id, result: result ?? null };
    } catch (error) {
      const text = errorMessage(error);
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
    await this.store.settled();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.store.dispose();
  }

  private buildHandlers(): Record<string, (params: unknown) => unknown> {
    const handlers: Record<string, (params: unknown) => unknown> = {
      initialize: (params) => this.initialize(params),
      shutdown: () => {
        this.shutdownRequested = true;
        return null;
      },
      exit: () => this.exitServer(),
      "textDocument/didOpen": (params) => this.store.open(params),
      "textDocument/didChange": (params) => this.store.change(params),
      "textDocument/didSave": (params) => this.store.save(params),
      "textDocument/didClose": (params) => this.store.close(params),
      "textDocument/hover": (params) => this.hover(params),
      "textDocument/codeAction": (params) => this.codeAction(params),
      "workspace/executeCommand": (params) => this.executeCommand(params),
    };
    for (const method of IGNORED_METHODS) handlers[method] = () => undefined;
    return handlers;
  }

  private async exitServer(): Promise<void> {
    await this.dispose();
    this.exit(this.shutdownRequested ? 0 : 1);
  }

  private initialize(params: unknown): JsonObject {
    const object = asObject(params);
    this.store.setWorkspaceRoot(workspaceRootFrom(object));
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

  private hover(params: unknown): JsonObject | null {
    const document = this.documentFrom(asObject(params));
    return document ? hoverAt(document, params) : null;
  }

  private codeAction(params: unknown): JsonObject[] {
    const document = this.documentFrom(asObject(params));
    return document ? codeActionsFor(document, params) : [];
  }

  private executeCommand(params: unknown): null {
    const object = asObject(params);
    const command = object?.command;
    const rawArguments = object?.arguments;
    const args: unknown[] = Array.isArray(rawArguments) ? rawArguments : [];

    if (command === EXPLAIN_FINDING_COMMAND) {
      const finding = findingById(this.store.values(), args[0], args[1]);
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

  private documentFrom(object: JsonObject | undefined): OpenDocument | undefined {
    const uri = stringField(asObject(object?.textDocument), "uri");
    return uri ? this.store.get(uri) : undefined;
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

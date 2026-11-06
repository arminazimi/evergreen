// Open-document state: buffers, per-document scan scheduling, and temporary scan roots.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { Finding, ScanResult } from "../domain.js";
import { diagnosticFor, normalizePath } from "./diagnostics.js";
import type { LspDiagnostic } from "./diagnostics.js";
import type { JsonObject } from "./protocol.js";
import { asObject, errorMessage, stringField } from "./protocol.js";

export interface OpenDocument {
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

export interface DocumentStoreOptions {
  /** Receives every outgoing JSON-RPC message. */
  write: (message: JsonObject) => void;
  /** Receives scan and lifecycle errors. */
  log: (message: string) => void;
  /** Runs the engine against one temporary scan root. */
  scan: (root: string) => Promise<ScanResult>;
  /** How long to wait for typing to settle before scanning. */
  debounceMs: number;
}

export class DocumentStore {
  private readonly documents = new Map<string, OpenDocument>();
  private readonly write: DocumentStoreOptions["write"];
  private readonly log: DocumentStoreOptions["log"];
  private readonly scan: DocumentStoreOptions["scan"];
  private readonly debounceMs: number;
  private workspaceRoot: string | undefined;
  private disposed = false;

  constructor(options: DocumentStoreOptions) {
    this.write = options.write;
    this.log = options.log;
    this.scan = options.scan;
    this.debounceMs = options.debounceMs;
  }

  setWorkspaceRoot(root: string | undefined): void {
    this.workspaceRoot = root;
  }

  get(uri: string): OpenDocument | undefined {
    return this.documents.get(uri);
  }

  values(): IterableIterator<OpenDocument> {
    return this.documents.values();
  }

  open(params: unknown): void {
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
    const previous = this.documents.get(uri);
    this.documents.set(uri, document);
    if (previous) {
      void this.retire(previous).catch((error: unknown) => {
        this.log(`Evergreen language server: retiring ${previous.uri} failed: ${errorMessage(error)}`);
      });
    }
    this.schedule(document, true);
  }

  change(params: unknown): void {
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

  save(params: unknown): void {
    const textDocument = asObject(asObject(params)?.textDocument);
    const uri = stringField(textDocument, "uri");
    const document = uri ? this.documents.get(uri) : undefined;
    if (document) this.schedule(document, true);
  }

  async close(params: unknown): Promise<void> {
    const textDocument = asObject(asObject(params)?.textDocument);
    const uri = stringField(textDocument, "uri");
    const document = uri ? this.documents.get(uri) : undefined;
    if (!document || !uri) return;
    this.documents.delete(uri);
    this.write({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: { uri, diagnostics: [] },
    });
    await this.retire(document);
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

  private async retire(document: OpenDocument): Promise<void> {
    this.cancel(document);
    document.generation += 1;
    await document.latestScan;
    if (document.scanRoot) await rm(document.scanRoot, { recursive: true, force: true });
  }

  private async scanDocument(document: OpenDocument): Promise<void> {
    if (this.disposed || this.documents.get(document.uri) !== document) return;
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
    document.diagnostics = findings.map((finding) => diagnosticFor(document.text, finding));
    this.publishDiagnostics(document);
  }

  private schedule(document: OpenDocument, immediate: boolean): void {
    if (this.disposed) return;
    this.cancel(document);
    const run = (): void => {
      document.timer = undefined;
      document.latestScan = document.latestScan
        .then(() => this.scanDocument(document))
        .catch((error: unknown) => {
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
}

export function workspaceRootFrom(params: JsonObject | undefined): string | undefined {
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

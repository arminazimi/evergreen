import * as vscode from "vscode";

import {
  asFindingRef,
  findingsToDiagnostics,
} from "./core/diagnostics.js";
import type { FindingRef, MappedDiagnostic } from "./core/diagnostics.js";
import {
  buildContextArgs,
  buildScanArgs,
  CLI_MISSING_MESSAGE,
  parseScanResult,
} from "./core/scan.js";
import type { ScanResult } from "./core/scan.js";
import { runEvergreen } from "./evergreen.js";

let missingCliShown = false;

const inFlight = new Set<string>();
const rerun = new Set<string>();
const folderUris = new Map<string, vscode.Uri[]>();
const folderKeys = new Map<string, string[]>();
const findingRefs = new Map<string, FindingRef>();

function isMissingExecutable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function executablePath(): string {
  return vscode.workspace
    .getConfiguration("evergreen")
    .get<string>("executablePath", "evergreen");
}

function runOnSaveSetting(): boolean {
  return vscode.workspace
    .getConfiguration("evergreen")
    .get<boolean>("runOnSave", true);
}

function requireTrust(): boolean {
  if (vscode.workspace.isTrusted) {
    return true;
  }
  void vscode.window.showInformationMessage(
    "Trust this workspace to run Evergreen scans.",
  );
  return false;
}

function reportMissingCli(channel: vscode.OutputChannel): void {
  channel.appendLine(CLI_MISSING_MESSAGE);
  if (!missingCliShown) {
    missingCliShown = true;
    void vscode.window.showErrorMessage(CLI_MISSING_MESSAGE);
  }
}

function errorText(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return String(error);
  }
  const record = error as {
    message?: unknown;
    stderr?: unknown;
    stdout?: unknown;
  };
  const parts: string[] = [];
  if (typeof record.message === "string" && record.message.length > 0) {
    parts.push(record.message);
  }
  if (typeof record.stderr === "string" && record.stderr.trim().length > 0) {
    parts.push(record.stderr.trim());
  }
  if (typeof record.stdout === "string" && record.stdout.trim().length > 0) {
    parts.push(record.stdout.trim());
  }
  return parts.length > 0 ? parts.join("\n") : String(error);
}

function reportFailure(
  channel: vscode.OutputChannel,
  error: unknown,
  action: string,
): void {
  const message = errorText(error);
  channel.appendLine(message);
  const firstLine = message.split("\n")[0] ?? message;
  void vscode.window.showWarningMessage(
    `Evergreen ${action} failed: ${firstLine.slice(0, 300)}`,
  );
}

function severityToVscode(
  severity: MappedDiagnostic["severity"],
): vscode.DiagnosticSeverity {
  switch (severity) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

function toDiagnostic(mapped: MappedDiagnostic): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(
      mapped.line,
      mapped.character,
      mapped.line,
      mapped.endCharacter,
    ),
    mapped.message,
    severityToVscode(mapped.severity),
  );
  diagnostic.source = "Evergreen";
  diagnostic.code = mapped.codeTarget
    ? { value: mapped.code, target: vscode.Uri.parse(mapped.codeTarget) }
    : mapped.code;
  return diagnostic;
}

function codeValue(code: vscode.Diagnostic["code"]): string {
  if (typeof code === "object" && code !== null) {
    return String(code.value);
  }
  return String(code ?? "");
}

function diagnosticKey(
  uri: vscode.Uri,
  diagnostic: vscode.Diagnostic,
): string {
  return [
    uri.toString(),
    diagnostic.range.start.line,
    diagnostic.range.start.character,
    diagnostic.range.end.line,
    diagnostic.range.end.character,
    codeValue(diagnostic.code),
    diagnostic.message,
  ].join("\u0000");
}

function clearFolderDiagnostics(
  collection: vscode.DiagnosticCollection,
  folder: vscode.WorkspaceFolder,
): void {
  const key = folder.uri.toString();
  const keys = folderKeys.get(key);
  if (keys) {
    for (const stored of keys) {
      findingRefs.delete(stored);
    }
    folderKeys.delete(key);
  }
  const previous = folderUris.get(key);
  if (!previous) {
    return;
  }
  for (const uri of previous) {
    collection.delete(uri);
  }
  folderUris.delete(key);
}

function replaceFolderDiagnostics(
  collection: vscode.DiagnosticCollection,
  folder: vscode.WorkspaceFolder,
  scan: ScanResult,
): void {
  clearFolderDiagnostics(collection, folder);
  const grouped = new Map<
    string,
    { diagnostic: vscode.Diagnostic; ref: FindingRef }[]
  >();
  for (const mapped of findingsToDiagnostics(scan, folder.uri.fsPath)) {
    const entry = {
      diagnostic: toDiagnostic(mapped),
      ref: { findingId: mapped.findingId, root: mapped.root },
    };
    const existing = grouped.get(mapped.path);
    if (existing) {
      existing.push(entry);
    } else {
      grouped.set(mapped.path, [entry]);
    }
  }
  const uris: vscode.Uri[] = [];
  const keys: string[] = [];
  for (const [path, entries] of grouped) {
    const uri = vscode.Uri.file(path);
    collection.set(
      uri,
      entries.map((entry) => entry.diagnostic),
    );
    uris.push(uri);
    for (const entry of entries) {
      const stored = diagnosticKey(uri, entry.diagnostic);
      findingRefs.set(stored, entry.ref);
      keys.push(stored);
    }
  }
  folderUris.set(folder.uri.toString(), uris);
  folderKeys.set(folder.uri.toString(), keys);
}

async function scanOnce(
  folder: vscode.WorkspaceFolder,
  collection: vscode.DiagnosticCollection,
  channel: vscode.OutputChannel,
  reveal: boolean,
): Promise<void> {
  const root = folder.uri.fsPath;
  const args = buildScanArgs(root);
  try {
    const { stdout } = await runEvergreen(executablePath(), args, root);
    let result: ScanResult;
    try {
      result = parseScanResult(stdout);
    } catch (error) {
      clearFolderDiagnostics(collection, folder);
      reportFailure(channel, error, "scan");
      return;
    }
    replaceFolderDiagnostics(collection, folder, result);
    if (reveal) {
      channel.appendLine(`$ evergreen ${args.join(" ")}`);
      channel.appendLine(stdout);
      channel.show(true);
    }
    channel.appendLine(`Evergreen: ${result.findings.length} finding(s) in ${root}`);
  } catch (error) {
    clearFolderDiagnostics(collection, folder);
    if (isMissingExecutable(error)) {
      reportMissingCli(channel);
      return;
    }
    reportFailure(channel, error, "scan");
  }
}

async function scanFolder(
  folder: vscode.WorkspaceFolder,
  collection: vscode.DiagnosticCollection,
  channel: vscode.OutputChannel,
  reveal: boolean,
): Promise<void> {
  const key = folder.uri.toString();
  if (inFlight.has(key)) {
    rerun.add(key);
    return;
  }
  inFlight.add(key);
  try {
    do {
      rerun.delete(key);
      try {
        await scanOnce(folder, collection, channel, reveal);
      } catch (error) {
        clearFolderDiagnostics(collection, folder);
        reportFailure(channel, error, "scan");
      }
    } while (rerun.has(key));
  } finally {
    inFlight.delete(key);
  }
}

async function explainFinding(
  ref: FindingRef,
  channel: vscode.OutputChannel,
): Promise<void> {
  const args = buildContextArgs(ref.findingId, ref.root);
  try {
    const { stdout } = await runEvergreen(executablePath(), args, ref.root);
    channel.appendLine(`$ evergreen ${args.join(" ")}`);
    channel.appendLine(stdout);
    channel.show(true);
  } catch (error) {
    if (isMissingExecutable(error)) {
      reportMissingCli(channel);
      return;
    }
    reportFailure(channel, error, "context");
  }
}

function findingAtCursor(): FindingRef | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }
  const position = editor.selection.active;
  for (const diagnostic of vscode.languages.getDiagnostics(
    editor.document.uri,
  )) {
    if (diagnostic.source !== "Evergreen") {
      continue;
    }
    if (!diagnostic.range.contains(position)) {
      continue;
    }
    const ref = findingRefs.get(
      diagnosticKey(editor.document.uri, diagnostic),
    );
    if (ref) {
      return ref;
    }
  }
  return undefined;
}

class EvergreenCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== "Evergreen") {
        continue;
      }
      const ref = findingRefs.get(diagnosticKey(document.uri, diagnostic));
      if (!ref) {
        continue;
      }
      const action = new vscode.CodeAction(
        "Evergreen: explain this finding",
        vscode.CodeActionKind.QuickFix,
      );
      action.command = {
        command: "evergreen.explainFinding",
        title: "Evergreen: explain this finding",
        arguments: [ref],
      };
      action.diagnostics = [diagnostic];
      actions.push(action);
    }
    return actions;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const channel = vscode.window.createOutputChannel("Evergreen");
  const collection = vscode.languages.createDiagnosticCollection("evergreen");
  context.subscriptions.push(channel, collection);

  context.subscriptions.push(
    vscode.commands.registerCommand("evergreen.scan", async () => {
      if (!requireTrust()) {
        return;
      }
      const folders = vscode.workspace.workspaceFolders ?? [];
      if (folders.length === 0) {
        void vscode.window.showInformationMessage(
          "Open a workspace folder to scan.",
        );
        return;
      }
      for (const folder of folders) {
        await scanFolder(folder, collection, channel, true);
      }
    }),
    vscode.commands.registerCommand(
      "evergreen.explainFinding",
      async (argument?: unknown) => {
        if (!requireTrust()) {
          return;
        }
        const ref = asFindingRef(argument) ?? findingAtCursor();
        if (!ref) {
          void vscode.window.showInformationMessage(
            "Place the cursor on an Evergreen diagnostic, or use its quick action.",
          );
          return;
        }
        await explainFinding(ref, channel);
      },
    ),
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file" },
      new EvergreenCodeActionProvider(),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!vscode.workspace.isTrusted || !runOnSaveSetting()) {
        return;
      }
      const folder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!folder || folder.uri.scheme !== "file") {
        return;
      }
      void scanFolder(folder, collection, channel, false);
    }),
  );
}

export function deactivate(): void {
  inFlight.clear();
  rerun.clear();
  folderUris.clear();
  folderKeys.clear();
  findingRefs.clear();
}

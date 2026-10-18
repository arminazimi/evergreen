import * as vscode from "vscode";

import { buildScanArgs, CLI_MISSING_MESSAGE, parseScanResult } from "./core/scan.js";
import { runEvergreen } from "./evergreen.js";

let missingCliShown = false;

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

function reportMissingCli(channel: vscode.OutputChannel): void {
  channel.appendLine(CLI_MISSING_MESSAGE);
  if (!missingCliShown) {
    missingCliShown = true;
    void vscode.window.showErrorMessage(CLI_MISSING_MESSAGE);
  }
}

function reportFailure(channel: vscode.OutputChannel, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  channel.appendLine(message);
  void vscode.window.showWarningMessage(`Evergreen scan failed: ${message.slice(0, 300)}`);
}

async function scanFolder(
  folder: vscode.WorkspaceFolder,
  channel: vscode.OutputChannel,
): Promise<void> {
  const root = folder.uri.fsPath;
  const args = buildScanArgs(root);
  try {
    const { stdout } = await runEvergreen(executablePath(), args, root);
    channel.appendLine(`$ evergreen ${args.join(" ")}`);
    channel.appendLine(stdout);
    channel.show(true);
    try {
      const result = parseScanResult(stdout);
      channel.appendLine(`Evergreen: ${result.findings.length} finding(s) in ${root}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      channel.appendLine(`Evergreen: could not parse the scan output: ${message}`);
    }
  } catch (error) {
    if (isMissingExecutable(error)) {
      reportMissingCli(channel);
      return;
    }
    reportFailure(channel, error);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const channel = vscode.window.createOutputChannel("Evergreen");
  context.subscriptions.push(channel);

  context.subscriptions.push(
    vscode.commands.registerCommand("evergreen.scan", async () => {
      if (!vscode.workspace.isTrusted) {
        void vscode.window.showInformationMessage(
          "Trust this workspace to run Evergreen scans.",
        );
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
        await scanFolder(folder, channel);
      }
    }),
  );
}

export function deactivate(): void {}

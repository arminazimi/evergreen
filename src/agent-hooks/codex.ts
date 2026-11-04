import { resolve } from "node:path";

import type { Finding } from "../domain.js";
import { relativePosix } from "../paths.js";
import { MAX_FEEDBACK_LINES } from "./claude-code.js";
import type { HookEdit, HookResponse, HostAdapter } from "./types.js";

/** The silent success `respond` uses for no findings; kept local so this module does not import the registry. */
const silent: HookResponse = { stdout: "", stderr: "", exitCode: 0 };

/** The tool names Codex reports for a patch; `apply_patch` is the primary one, `Edit` and `Write` are its aliases. */
const patchTools = new Set(["apply_patch", "Edit", "Write"]);

/** The patch headers that change file contents; a delete leaves nothing to scan. */
const PATCH_ADD_HEADER = "*** Add File: ";
const PATCH_UPDATE_HEADER = "*** Update File: ";

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The repository-relative paths a Codex patch adds or updates, in document order, without duplicates. */
export function patchFileNames(command: string): string[] {
  const files: string[] = [];
  for (const line of command.split("\n")) {
    const rest = line.startsWith(PATCH_ADD_HEADER)
      ? line.slice(PATCH_ADD_HEADER.length)
      : line.startsWith(PATCH_UPDATE_HEADER)
        ? line.slice(PATCH_UPDATE_HEADER.length)
        : "";
    const name = rest.trim();
    if (name === "" || files.includes(name)) continue;
    files.push(name);
  }
  return files;
}

/** Keeps the paths that stay inside the repository root, forward-slashed, in a stable order. */
function insideRoot(root: string, names: readonly string[]): string[] {
  const files: string[] = [];
  for (const name of names) {
    const file = relativePosix(root, resolve(root, name));
    if (file === "" || file === ".." || file.startsWith("../")) continue;
    if (!files.includes(file)) files.push(file);
  }
  return files;
}

/**
 * Reads a Codex `PostToolUse` payload for a patch. The hook runs in the working directory Codex reports as
 * `cwd`; `apply_patch` carries the whole patch in `tool_input.command`, and `Edit`/`Write` name one file in
 * `tool_input.file_path`. When the payload has no `cwd`, `CODEX_PROJECT_DIR` supplies the root, as the Claude
 * Code adapter does with its own variable.
 */
export function parseCodexPayload(payload: unknown, env: NodeJS.ProcessEnv): HookEdit | undefined {
  const event = record(payload);
  if (event === undefined) return undefined;
  if (typeof event.tool_name !== "string" || !patchTools.has(event.tool_name)) return undefined;
  const input = record(event.tool_input);
  const names: string[] = [];
  if (typeof input?.command === "string" && input.command !== "") names.push(...patchFileNames(input.command));
  if (typeof input?.file_path === "string" && input.file_path !== "") names.push(input.file_path);
  if (names.length === 0) return undefined;
  const reportedRoot = typeof event.cwd === "string" && event.cwd !== "" ? event.cwd : env.CODEX_PROJECT_DIR;
  if (reportedRoot === undefined || reportedRoot === "") return undefined;
  const root = resolve(reportedRoot);
  const files = insideRoot(root, names);
  if (files.length === 0) return undefined;
  return { root, files };
}

/** One finding as at most three lines: what it is, where it is, what to write instead, and the evidence. */
function findingLines(finding: Finding, index: number): string[] {
  const line = finding.location.line === undefined ? "" : `:${finding.location.line}`;
  const lines = [`${index}) [${finding.severity}] ${finding.title} — ${finding.location.path}${line}`];
  if (finding.replacement !== undefined) lines.push(`   Replacement: ${finding.replacement}`);
  const evidence = finding.sources[0]?.url;
  if (evidence !== undefined) lines.push(`   Evidence: ${evidence}`);
  return lines;
}

/** The feedback text `respond` hands to the model: the same shape Claude Code shows, trimmed to the line cap; empty findings give an empty string. */
export function codexFeedbackText(findings: readonly Finding[]): string {
  const first = findings.at(0);
  if (first === undefined) return "";
  const file = first.location.path;
  const noun = findings.length === 1 ? "issue" : "issues";
  const footer = ["", "Fix this before continuing; nothing was changed automatically."];
  const budget = MAX_FEEDBACK_LINES - footer.length;
  const lines = [`Evergreen found ${findings.length} lifecycle ${noun} in ${file}:`];
  let shown = 0;
  for (const [index, finding] of findings.entries()) {
    const block = findingLines(finding, index + 1);
    // Leave one line for the remainder notice when this block would not be the last one.
    const reserve = index + 1 < findings.length ? 1 : 0;
    if (lines.length + block.length > budget - reserve) break;
    lines.push(...block);
    shown += 1;
  }
  if (shown < findings.length) {
    const rest = findings.length - shown;
    lines.push(`… and ${rest} more ${rest === 1 ? "finding" : "findings"}; run \`evergreen scan .\` to see them all.`);
  }
  lines.push(...footer);
  return lines.join("\n");
}

/**
 * Codex reads a `PostToolUse` hook's stdout JSON: `hookSpecificOutput.additionalContext` is added to the model's
 * context and `systemMessage` is surfaced as a warning, so the patch author sees the findings in the same turn.
 * The patch has already applied, so this is feedback, never a block, and the hook exits `0`; any hook failure
 * stays silent for the same reason. The shape is documented at
 * <https://developers.openai.com/codex/hooks> (redirects to <https://learn.chatgpt.com/docs/hooks>), Codex CLI
 * rust-v0.166.0 (current stable, 2026-10-29).
 */
export function codexResponse(findings: readonly Finding[]): HookResponse {
  const context = codexFeedbackText(findings);
  if (context === "") return silent;
  const document = {
    systemMessage: `Evergreen found ${findings.length} lifecycle ${findings.length === 1 ? "issue" : "issues"} in the files just changed.`,
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context },
  };
  return { stdout: `${JSON.stringify(document, null, 2)}\n`, stderr: "", exitCode: 0 };
}

/** Codex's post-edit hook: `PostToolUse` for `apply_patch` (and its `Edit`/`Write` aliases). */
export const codexAdapter: HostAdapter = {
  id: "codex",
  parse: parseCodexPayload,
  respond: codexResponse,
};

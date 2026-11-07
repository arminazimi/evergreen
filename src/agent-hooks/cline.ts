import { resolve } from "node:path";

import type { Finding } from "../domain.js";
import { relativePosix } from "../paths.js";
import { MAX_FEEDBACK_LINES } from "./claude-code.js";
import type { HookEdit, HookResponse, HostAdapter } from "./types.js";

/** The silent success `respond` uses for no findings; kept local so this module does not import the registry. */
const silent: HookResponse = { stdout: "", stderr: "", exitCode: 0 };

/**
 * Cline's file-writing tool names. The VS Code extension reports `write_to_file` and `replace_in_file` (and
 * `insert_content` on newer builds); the CLI and SDK file hooks report `write_file`, `edit_file`, and `editor`.
 */
const editTools = new Set(["write_to_file", "replace_in_file", "insert_content", "write_file", "edit_file", "editor"]);

/** The hook names Cline uses for a completed tool: the extension's `PostToolUse`, the CLI's `tool_result`. */
const postToolUseNames = new Set(["PostToolUse", "tool_result"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The tool call in either documented payload: `postToolUse` from the extension, `tool_result` from the CLI. */
function editCall(event: Record<string, unknown>): Record<string, unknown> | undefined {
  const extension = isRecord(event.postToolUse) ? event.postToolUse : undefined;
  if (extension !== undefined) {
    if (typeof extension.toolName !== "string" || !editTools.has(extension.toolName)) return undefined;
    if (extension.success === false) return undefined;
    return isRecord(extension.parameters) ? extension.parameters : {};
  }
  const cli = isRecord(event.tool_result) ? event.tool_result : undefined;
  if (cli === undefined) return undefined;
  if (typeof cli.name !== "string" || !editTools.has(cli.name)) return undefined;
  if (cli.error !== undefined && cli.error !== null) return undefined;
  return isRecord(cli.input) ? cli.input : {};
}

/** The path a write names: `path` in the extension payload, `filePath` or `file_path` in the CLI payload. */
function editedFilePath(parameters: Record<string, unknown>): string | undefined {
  for (const candidate of [parameters.path, parameters.filePath, parameters.file_path]) {
    if (typeof candidate === "string" && candidate !== "") return candidate;
  }
  return undefined;
}

/** The workspace root that owns `filePath`, falling back to the hook's working directory. */
function workspaceRoot(filePath: string, roots: readonly string[], env: NodeJS.ProcessEnv): string | undefined {
  const candidates = [...roots, ...(env.PWD === undefined || env.PWD === "" ? [] : [env.PWD])];
  for (const candidate of candidates) {
    const absolute = resolve(candidate);
    const relative = relativePosix(absolute, resolve(absolute, filePath));
    if (relative !== "" && relative !== ".." && !relative.startsWith("../")) return absolute;
  }
  return undefined;
}

/**
 * Reads a Cline `PostToolUse` payload. The VS Code extension sends `postToolUse.toolName` and
 * `postToolUse.parameters.path` with `workspaceRoots`; the CLI and SDK file hooks send `tool_result.name`,
 * `tool_result.input` (path, filePath, or file_path), and the working directory. Both are documented in
 * <https://github.com/cline/cline/blob/main/.clinerules/hooks/README.md> and
 * <https://github.com/cline/cline/blob/main/sdk/examples/hooks/README.md> (checked 2026-11-08 against
 * Cline 4.1.26, current stable, 2026-10-26).
 */
export function parseClinePayload(payload: unknown, env: NodeJS.ProcessEnv): HookEdit | undefined {
  const event = isRecord(payload) ? payload : undefined;
  if (event === undefined) return undefined;
  if (typeof event.hookName === "string" && !postToolUseNames.has(event.hookName)) return undefined;
  const parameters = editCall(event);
  if (parameters === undefined) return undefined;
  const filePath = editedFilePath(parameters);
  if (filePath === undefined) return undefined;
  const roots = Array.isArray(event.workspaceRoots)
    ? event.workspaceRoots.filter((root): root is string => typeof root === "string")
    : [];
  const cwd = typeof event.cwd === "string" && event.cwd !== "" ? event.cwd : env.PWD;
  const root = workspaceRoot(filePath, roots, { PWD: cwd });
  if (root === undefined) return undefined;
  const file = relativePosix(root, resolve(root, filePath));
  if (file === "" || file === ".." || file.startsWith("../")) return undefined;
  return { root, files: [file] };
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
export function clineFeedbackText(findings: readonly Finding[]): string {
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
 * Cline reads a PostToolUse hook's stdout as JSON: the extension adds `contextModification` to the next request,
 * and the CLI and SDK file hooks add `context`. The hook exits `0` because the tool has already run, so this is
 * feedback the model acts on next, never a block. The VS Code extension payload is documented in
 * <https://github.com/cline/cline/blob/main/.clinerules/hooks/README.md> and the CLI/SDK payload in
 * <https://github.com/cline/cline/blob/main/sdk/examples/hooks/README.md> (checked 2026-11-08 against
 * Cline 4.1.26, current stable, 2026-10-26).
 */
export function clineResponse(findings: readonly Finding[]): HookResponse {
  const context = clineFeedbackText(findings);
  if (context === "") return silent;
  return {
    stdout: `${JSON.stringify({ cancel: false, contextModification: context, context })}\n`,
    stderr: "",
    exitCode: 0,
  };
}

/** Cline's post-edit hook: `PostToolUse` in the VS Code extension, `tool_result` in the CLI and SDK. */
export const clineAdapter: HostAdapter = {
  id: "cline",
  parse: parseClinePayload,
  respond: clineResponse,
};

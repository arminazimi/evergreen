import { resolve } from "node:path";

import type { Finding } from "../domain.js";
import { relativePosix } from "../paths.js";
import { MAX_FEEDBACK_LINES } from "./claude-code.js";
import type { HookEdit, HookResponse, HostAdapter } from "./types.js";

/** The silent success `respond` uses for no findings; kept local so this module does not import the registry. */
const silent: HookResponse = { stdout: "", stderr: "", exitCode: 0 };

/**
 * The tools that write or edit one file. Copilot CLI reports `create` and `edit`; the PascalCase (VS Code
 * compatible) payload reports the Claude tool names, and the runtime also accepts the older aliases.
 */
const editTools = new Set(["create", "edit", "str_replace_editor", "apply_patch", "Write", "Edit", "MultiEdit"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

/** The tool arguments as an object; Copilot may send them JSON-encoded in a string (see the hooks reference). */
function toolArguments(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      return record(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  return record(value);
}

/** The path a `create` or `edit` call names: `path` in Copilot's native payload, `file_path` in the VS Code one. */
function editedFilePath(args: Record<string, unknown> | undefined): string | undefined {
  for (const candidate of [args?.path, args?.file_path]) {
    if (typeof candidate === "string" && candidate !== "") return candidate;
  }
  return undefined;
}

/**
 * Reads a Copilot `postToolUse` payload for `create` or `edit` (or the PascalCase `PostToolUse` form). The hook
 * runs in the repository root, which the payload reports as `cwd`; the tool arguments arrive in `toolArgs` or
 * `tool_input`, and may themselves be a JSON-encoded string. Documented for Copilot CLI 1.0.107 (current stable,
 * 2026-11-07) at <https://docs.github.com/en/copilot/reference/hooks-reference>.
 */
export function parseCopilotPayload(payload: unknown): HookEdit | undefined {
  const event = record(payload);
  if (event === undefined) return undefined;
  if (typeof event.hook_event_name === "string" && event.hook_event_name !== "PostToolUse") return undefined;
  const toolName = typeof event.toolName === "string" ? event.toolName : event.tool_name;
  if (typeof toolName !== "string" || !editTools.has(toolName)) return undefined;
  const args = toolArguments(event.toolArgs ?? event.tool_input);
  const filePath = editedFilePath(args);
  if (filePath === undefined) return undefined;
  const reportedRoot = typeof event.cwd === "string" && event.cwd !== "" ? event.cwd : undefined;
  if (reportedRoot === undefined) return undefined;
  const root = resolve(reportedRoot);
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
export function copilotFeedbackText(findings: readonly Finding[]): string {
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
 * Copilot appends a `postToolUse` hook's `additionalContext` to the tool result the model sees, so the agent can
 * correct the file in the same turn. The tool has already run, so this is feedback, never a block, and the hook
 * exits `0`; any hook failure stays silent for the same reason. The output is one JSON object on one line, which
 * is the form the Copilot documentation recommends for command hooks. The shape is documented for Copilot CLI
 * 1.0.107 (current stable, 2026-11-07) at <https://docs.github.com/en/copilot/reference/hooks-reference>.
 */
export function copilotResponse(findings: readonly Finding[]): HookResponse {
  const context = copilotFeedbackText(findings);
  if (context === "") return silent;
  return { stdout: `${JSON.stringify({ additionalContext: context })}\n`, stderr: "", exitCode: 0 };
}

/** Copilot's post-edit hook: `postToolUse` for `create` and `edit` (and the VS Code compatible names). */
export const copilotAdapter: HostAdapter = {
  id: "copilot",
  parse: parseCopilotPayload,
  respond: copilotResponse,
};

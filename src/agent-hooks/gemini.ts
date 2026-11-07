import { resolve } from "node:path";

import type { Finding } from "../domain.js";
import { relativePosix } from "../paths.js";
import { MAX_FEEDBACK_LINES } from "./claude-code.js";
import type { HookEdit, HookResponse, HostAdapter } from "./types.js";

/** The silent success `respond` uses for no findings; kept local so this module does not import the registry. */
const silent: HookResponse = { stdout: "", stderr: "", exitCode: 0 };

/** The Gemini CLI built-in tools that write or edit a file; both report the target in `tool_input.file_path`. */
const editTools = new Set(["write_file", "replace"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The file an `AfterTool` event changed, when the tool is one of the two that write or edit a file. */
function editedFilePath(event: Record<string, unknown>): string | undefined {
  if (typeof event.tool_name !== "string" || !editTools.has(event.tool_name)) return undefined;
  const input = isRecord(event.tool_input) ? event.tool_input : undefined;
  const filePath = input?.file_path;
  return typeof filePath === "string" && filePath !== "" ? filePath : undefined;
}

/** The project root the event reports as `cwd`, falling back to Gemini CLI's documented variable. */
function projectRoot(event: Record<string, unknown>, env: NodeJS.ProcessEnv): string | undefined {
  const reported = typeof event.cwd === "string" && event.cwd !== "" ? event.cwd : env.GEMINI_PROJECT_DIR;
  return reported === undefined || reported === "" ? undefined : resolve(reported);
}

/**
 * Reads a Gemini CLI `AfterTool` payload for `write_file` or `replace`. The hook runs in the project directory,
 * which the payload reports as `cwd`; `GEMINI_PROJECT_DIR` is the documented fallback
 * (<https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md>, checked 2026-11-07).
 */
export function parseGeminiPayload(payload: unknown, env: NodeJS.ProcessEnv): HookEdit | undefined {
  const event = isRecord(payload) ? payload : undefined;
  if (event === undefined) return undefined;
  if (typeof event.hook_event_name === "string" && event.hook_event_name !== "AfterTool") return undefined;
  const filePath = editedFilePath(event);
  if (filePath === undefined) return undefined;
  const root = projectRoot(event, env);
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
export function geminiFeedbackText(findings: readonly Finding[]): string {
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
 * Gemini CLI parses an `AfterTool` hook's stdout JSON: `hookSpecificOutput.additionalContext` is appended to the
 * tool result in the model's context and `systemMessage` is shown in the terminal, so the model keeps going and
 * corrects the file in the same turn. The tool has already run, so this is feedback, never a block, and the hook
 * exits `0`; any hook failure stays silent for the same reason. The shape is documented at
 * <https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md> for Gemini CLI 0.67.0
 * (current stable, 2026-11-04).
 */
export function geminiResponse(findings: readonly Finding[]): HookResponse {
  const context = geminiFeedbackText(findings);
  if (context === "") return silent;
  const document = {
    systemMessage: `Evergreen found ${findings.length} lifecycle ${findings.length === 1 ? "issue" : "issues"} in the files just changed.`,
    hookSpecificOutput: { hookEventName: "AfterTool", additionalContext: context },
  };
  return { stdout: `${JSON.stringify(document, null, 2)}\n`, stderr: "", exitCode: 0 };
}

/** Gemini CLI's post-edit hook: `AfterTool` for `write_file` and `replace`. */
export const geminiAdapter: HostAdapter = {
  id: "gemini",
  parse: parseGeminiPayload,
  respond: geminiResponse,
};

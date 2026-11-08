import { resolve } from "node:path";

import type { Finding } from "../domain.js";
import { relativePosix } from "../paths.js";
import { MAX_FEEDBACK_LINES } from "./claude-code.js";
import { patchFileNames } from "./codex.js";
import type { HookEdit, HookResponse, HostAdapter } from "./types.js";

/** The silent success `respond` uses for no findings; kept local so this module does not import the registry. */
const silent: HookResponse = { stdout: "", stderr: "", exitCode: 0 };

/** Devin Local's file-writing tools; names from the lifecycle-hooks matcher table (checked 2026-11-08). */
const editTools = new Set(["write", "edit", "apply_patch"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
 * Paths a Devin write/edit/`apply_patch` names: `file_path` (documented for path checks), plus Codex-style
 * patch headers in `command` or `patch` when `apply_patch` carries a multi-file patch.
 */
function editedPaths(toolName: string, input: Record<string, unknown>): string[] {
  const names: string[] = [];
  for (const candidate of [input.file_path, input.path]) {
    if (typeof candidate === "string" && candidate !== "") names.push(candidate);
  }
  if (toolName === "apply_patch") {
    for (const field of [input.command, input.patch]) {
      if (typeof field === "string" && field !== "") names.push(...patchFileNames(field));
    }
  }
  return names;
}

/**
 * Reads a Devin Local `PostToolUse` payload for `write`, `edit`, or `apply_patch`. The project root is
 * `DEVIN_PROJECT_DIR` (<https://docs.devin.ai/cli/extensibility/hooks/overview.md>, checked 2026-11-08).
 */
export function parseDevinPayload(payload: unknown, env: NodeJS.ProcessEnv): HookEdit | undefined {
  const event = isRecord(payload) ? payload : undefined;
  if (event === undefined) return undefined;
  if (typeof event.hook_event_name === "string" && event.hook_event_name !== "PostToolUse") return undefined;
  if (typeof event.tool_name !== "string" || !editTools.has(event.tool_name)) return undefined;
  const response = isRecord(event.tool_response) ? event.tool_response : undefined;
  if (response?.success === false) return undefined;
  const input = isRecord(event.tool_input) ? event.tool_input : undefined;
  if (input === undefined) return undefined;
  const names = editedPaths(event.tool_name, input);
  if (names.length === 0) return undefined;
  const reportedRoot = env.DEVIN_PROJECT_DIR;
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
export function devinFeedbackText(findings: readonly Finding[]): string {
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
 * Devin Local injects `hookSpecificOutput.additionalContext` into the agent's context for `PostToolUse` and
 * the hook exits `0`; the tool has already run, so this is feedback, never a block. Documented at
 * <https://docs.devin.ai/cli/extensibility/hooks/overview.md> (checked 2026-11-08 against Devin Desktop 3.12.17,
 * 2026-11-06, where Devin Local is the agent).
 */
export function devinResponse(findings: readonly Finding[]): HookResponse {
  const context = devinFeedbackText(findings);
  if (context === "") return silent;
  const document = {
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context },
  };
  return { stdout: `${JSON.stringify(document, null, 2)}\n`, stderr: "", exitCode: 0 };
}

/** Devin Local's post-edit hook: `PostToolUse` for `write`, `edit`, and `apply_patch`. */
export const devinAdapter: HostAdapter = {
  id: "devin",
  parse: parseDevinPayload,
  respond: devinResponse,
};

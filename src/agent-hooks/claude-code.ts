import { resolve } from "node:path";

import type { Finding } from "../domain.js";
import { relativePosix } from "../paths.js";
import type { HookEdit, HookResponse, HostAdapter } from "./types.js";

/** The silent success `respond` uses for no findings; kept local so this module does not import the registry. */
const silent: HookResponse = { stdout: "", stderr: "", exitCode: 0 };

/** The Claude Code tools that write or edit one file; every other tool is not an edit event. */
const editTools = new Set(["Write", "Edit", "MultiEdit"]);

/** The most lines `respond` prints: enough for a handful of findings, short enough for a model to read in one turn. */
export const MAX_FEEDBACK_LINES = 20;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/**
 * Reads a Claude Code `PostToolUse` payload for `Write`, `Edit`, or `MultiEdit`. The hook runs in the project
 * directory, which the payload reports as `cwd` (`CLAUDE_PROJECT_DIR` is the documented fallback).
 */
export function parseClaudeCodePayload(payload: unknown, env: NodeJS.ProcessEnv): HookEdit | undefined {
  const event = record(payload);
  if (event === undefined) return undefined;
  if (typeof event.tool_name !== "string" || !editTools.has(event.tool_name)) return undefined;
  const input = record(event.tool_input);
  const filePath = input?.file_path;
  if (typeof filePath !== "string" || filePath === "") return undefined;
  const reportedRoot = typeof event.cwd === "string" && event.cwd !== "" ? event.cwd : env.CLAUDE_PROJECT_DIR;
  if (reportedRoot === undefined || reportedRoot === "") return undefined;
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

/**
 * Claude Code shows a `PostToolUse` hook's stderr to the model when the hook exits `2`, and the tool has already
 * run, so this is feedback the model can act on in the same turn, never a block.
 */
export function claudeCodeFeedback(findings: readonly Finding[]): HookResponse {
  if (findings.length === 0) return silent;
  const first = findings[0]!;
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
  return { stdout: "", stderr: `${lines.join("\n")}\n`, exitCode: 2 };
}

/** Claude Code's post-edit hook: `PostToolUse` for `Write`, `Edit`, and `MultiEdit`. */
export const claudeCodeAdapter: HostAdapter = {
  id: "claude-code",
  parse: parseClaudeCodePayload,
  respond: claudeCodeFeedback,
};

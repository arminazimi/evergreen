import { resolve } from "node:path";

import type { Finding } from "../domain.js";
import { relativePosix } from "../paths.js";
import { MAX_FEEDBACK_LINES } from "./claude-code.js";
import type { HookEdit, HookResponse, HostAdapter } from "./types.js";

/** The silent success `respond` uses for no findings; kept local so this module does not import the registry. */
const silent: HookResponse = { stdout: "", stderr: "", exitCode: 0 };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Picks the workspace root that owns `filePath`. Cursor sends absolute `file_path` and `workspace_roots`;
 * `CURSOR_PROJECT_DIR` is the documented environment fallback when the payload omits roots
 * (<https://cursor.com/docs/hooks>, checked 2026-11-07).
 */
function workspaceRoot(filePath: string, roots: readonly string[], env: NodeJS.ProcessEnv): string | undefined {
  for (const root of roots) {
    if (root === "") continue;
    const absolute = resolve(root);
    const relative = relativePosix(absolute, resolve(absolute, filePath));
    if (relative !== "" && relative !== ".." && !relative.startsWith("../")) return absolute;
  }
  const fallback = env.CURSOR_PROJECT_DIR;
  if (fallback === undefined || fallback === "") return undefined;
  return resolve(fallback);
}

/**
 * Reads a Cursor `afterFileEdit` payload. The hook runs from the project root; the payload names the edited
 * file in `file_path` and the workspace in `workspace_roots` (see <https://cursor.com/docs/hooks>).
 */
export function parseCursorPayload(payload: unknown, env: NodeJS.ProcessEnv): HookEdit | undefined {
  const event = record(payload);
  if (event === undefined) return undefined;
  if (typeof event.hook_event_name === "string" && event.hook_event_name !== "afterFileEdit") return undefined;
  if (typeof event.file_path !== "string" || event.file_path === "") return undefined;
  const roots = Array.isArray(event.workspace_roots)
    ? event.workspace_roots.filter((root): root is string => typeof root === "string")
    : [];
  const root = workspaceRoot(event.file_path, roots, env);
  if (root === undefined) return undefined;
  const file = relativePosix(root, resolve(root, event.file_path));
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
 * The audit text written to stderr. Cursor's `afterFileEdit` hook documents no response fields that reach the
 * agent (<https://cursor.com/docs/hooks>, checked 2026-11-07), so this is a local log only.
 */
export function cursorAuditText(findings: readonly Finding[]): string {
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
 * Cursor's `afterFileEdit` cannot send text back to the agent, so findings are an audit log on stderr and the
 * process exits `0`. The agent-facing instruction lives in `.cursor/rules/evergreen.mdc`, written only by
 * `init --hooks-for cursor`. Documented at <https://cursor.com/docs/hooks> (checked 2026-11-07).
 */
export function cursorResponse(findings: readonly Finding[]): HookResponse {
  const audit = cursorAuditText(findings);
  if (audit === "") return silent;
  return { stdout: "", stderr: `${audit}\n`, exitCode: 0 };
}

/** Cursor's post-edit hook: `afterFileEdit` after the Agent writes a file. */
export const cursorAdapter: HostAdapter = {
  id: "cursor",
  parse: parseCursorPayload,
  respond: cursorResponse,
};

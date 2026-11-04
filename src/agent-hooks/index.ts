import type { Finding } from "../domain.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import type { HookEdit, HookResponse, HostAdapter } from "./types.js";

export type { HookEdit, HookResponse, HostAdapter } from "./types.js";

/** Every built-in host adapter. Each host task in the shield epic appends its own entry. */
export const hostAdapters: HostAdapter[] = [claudeCodeAdapter, codexAdapter];

/** Keeps the findings located in the files the agent just changed, in a stable order. */
export function findingsForEdit(findings: readonly Finding[], edit: HookEdit): Finding[] {
  const files = new Set(edit.files);
  return findings
    .filter((finding) => files.has(finding.location.path))
    .sort((a, b) => a.location.path.localeCompare(b.location.path) || (a.location.line ?? 0) - (b.location.line ?? 0) || a.id.localeCompare(b.id));
}

/** A hook must never break the agent's session: any internal error becomes a silent, successful response. */
export const failOpen: HookResponse = { stdout: "", stderr: "", exitCode: 0 };

import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { AgentFileError, renderDiff, withAgentSection } from "./agent-instructions.js";

export type AgentFileName = "AGENTS.md" | "CLAUDE.md";

export interface InitAgentsOptions {
  /** The repository root. */
  root: string;
  /** Which file to update; by default AGENTS.md, else an existing CLAUDE.md, else a new AGENTS.md. */
  file?: AgentFileName;
  /** Report what would change, including a diff, and write nothing. */
  dryRun?: boolean;
}

export interface InitAgentsResult {
  file: AgentFileName;
  change: "created" | "added" | "updated" | "unchanged";
  written: boolean;
  /** A unified diff of the change; empty when nothing changes. */
  diff: string;
}

async function read(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Refuses a file that is, or sits under, a link pointing outside the repository: the command must not write through it. */
async function assertInside(root: string, path: string): Promise<void> {
  let existing = path;
  for (;;) {
    try {
      await lstat(existing);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(existing);
      if (parent === existing) return;
      existing = parent;
    }
  }
  const target = await realpath(existing);
  const inside = relative(await realpath(root), target);
  if (inside.startsWith("..") || inside.split(sep)[0] === "..") {
    throw new AgentFileError(`${path} is a link to a file outside the repository, so it was not changed.`);
  }
}

export interface AgentFileOptions {
  dryRun?: boolean;
  /** Text placed before the section when the file does not exist yet, such as front matter a host requires. */
  createPrefix?: string;
}

/** Adds or refreshes the Evergreen section in one file under `root`, creating the file and its folders when needed. */
export async function updateAgentFile(
  root: string,
  file: string,
  options: AgentFileOptions = {},
): Promise<InitAgentsResult> {
  const path = join(root, file);
  await assertInside(root, path);
  const before = await read(path);
  const update = withAgentSection(before);
  const text =
    update.change === "created" && options.createPrefix ? `${options.createPrefix}${update.text}` : update.text;
  const diff = update.change === "unchanged" ? "" : renderDiff(file, before ?? "", text);
  if (update.change === "unchanged" || options.dryRun)
    return { file: file as AgentFileName, change: update.change, written: false, diff };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return { file: file as AgentFileName, change: update.change, written: true, diff };
}

export const CLAUDE_CODE_SETTINGS_FILE = ".claude/settings.json";
export const CLAUDE_CODE_HOOK_MATCHER = "Write|Edit|MultiEdit";
/** `npx --no-install` uses the package the project already has, then the global `evergreen` bin as the fallback. */
export const CLAUDE_CODE_HOOK_COMMAND = "npx --no-install evergreen-deprecation hook claude-code";

export interface InitClaudeHooksOptions {
  /** The repository root. */
  root: string;
  /** Report what would change, including a diff, and write nothing. */
  dryRun?: boolean;
}

export interface InitClaudeHooksResult {
  file: string;
  change: "created" | "updated" | "unchanged";
  written: boolean;
  /** A unified diff of the change; empty when nothing changes. */
  diff: string;
}

/** Recognizes a hook this command wrote, however its launcher is spelled (`npx … evergreen`, a global bin, a path). */
const EVERGREEN_HOOK_COMMAND = /\bevergreen(?:-deprecation)?\b.*\bhook\s+claude-code\b/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasEvergreenPostToolUse(entries: readonly unknown[]): boolean {
  return entries.some((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.hooks)) return false;
    return entry.hooks.some(
      (hook) => isRecord(hook) && typeof hook.command === "string" && EVERGREEN_HOOK_COMMAND.test(hook.command),
    );
  });
}

/** Merges the post-edit entry into a parsed settings document, keeping every existing key and hook in place. */
export function withClaudeCodePostToolUse(settings: unknown): {
  settings: Record<string, unknown>;
  change: "added" | "unchanged";
} {
  if (!isRecord(settings))
    throw new AgentFileError(`${CLAUDE_CODE_SETTINGS_FILE} does not hold a JSON object, so it was not changed.`);
  const hooksValue = settings.hooks;
  if (hooksValue !== undefined && !isRecord(hooksValue)) {
    throw new AgentFileError(
      `${CLAUDE_CODE_SETTINGS_FILE} has a "hooks" value that is not an object, so it was not changed.`,
    );
  }
  const hooks = (hooksValue ?? {}) as Record<string, unknown>;
  const postValue = hooks.PostToolUse;
  if (postValue !== undefined && !Array.isArray(postValue)) {
    throw new AgentFileError(
      `${CLAUDE_CODE_SETTINGS_FILE} has a "hooks.PostToolUse" value that is not an array, so it was not changed.`,
    );
  }
  const postToolUse = (postValue ?? []) as unknown[];
  if (hasEvergreenPostToolUse(postToolUse)) return { settings: structuredClone(settings), change: "unchanged" };
  const entry = {
    matcher: CLAUDE_CODE_HOOK_MATCHER,
    hooks: [{ type: "command", command: CLAUDE_CODE_HOOK_COMMAND, timeout: 60 }],
  };
  return {
    settings: {
      ...structuredClone(settings),
      hooks: { ...hooks, PostToolUse: [...structuredClone(postToolUse), entry] },
    },
    change: "added",
  };
}

/** Writes or merges the Claude Code post-edit hook into `.claude/settings.json`, preserving the user's hooks. */
export async function initClaudeHooks(options: InitClaudeHooksOptions): Promise<InitClaudeHooksResult> {
  const root = resolve(options.root);
  const info = await lstat(root).catch(() => undefined);
  if (!info?.isDirectory()) throw new AgentFileError(`${root} is not a directory.`);
  const path = join(root, CLAUDE_CODE_SETTINGS_FILE);
  await assertInside(root, path);
  const before = await read(path);
  let parsed: unknown = {};
  if (before !== undefined) {
    try {
      parsed = JSON.parse(before);
    } catch {
      throw new AgentFileError(`${CLAUDE_CODE_SETTINGS_FILE} is not valid JSON, so it was not changed.`);
    }
  }
  const update = withClaudeCodePostToolUse(parsed);
  const text = `${JSON.stringify(update.settings, null, 2)}\n`;
  const change = before === undefined ? "created" : update.change === "unchanged" ? "unchanged" : "updated";
  const diff = change === "unchanged" ? "" : renderDiff(CLAUDE_CODE_SETTINGS_FILE, before ?? "", text);
  if (change === "unchanged" || options.dryRun)
    return { file: CLAUDE_CODE_SETTINGS_FILE, change, written: false, diff };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return { file: CLAUDE_CODE_SETTINGS_FILE, change, written: true, diff };
}

export const CODEX_HOOKS_FILE = ".codex/hooks.json";
export const CODEX_HOOK_MATCHER = "apply_patch";
/** The same launcher as Claude Code's: the project's own package first, the global `evergreen` bin as fallback. */
export const CODEX_HOOK_COMMAND = "npx --no-install evergreen-deprecation hook codex";

export type InitCodexHooksOptions = InitClaudeHooksOptions;
export type InitCodexHooksResult = InitClaudeHooksResult;

/** Recognizes the hook this command wrote, however its launcher is spelled (`npx … evergreen`, a global bin, a path). */
const EVERGREEN_CODEX_HOOK_COMMAND = /\bevergreen(?:-deprecation)?\b.*\bhook\s+codex\b/;

function hasEvergreenCodexPostToolUse(entries: readonly unknown[]): boolean {
  return entries.some((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.hooks)) return false;
    return entry.hooks.some(
      (hook) => isRecord(hook) && typeof hook.command === "string" && EVERGREEN_CODEX_HOOK_COMMAND.test(hook.command),
    );
  });
}

/** Merges the post-edit entry into a parsed hooks document, keeping every existing key and hook in place. */
export function withCodexPostToolUse(hooks: unknown): {
  hooks: Record<string, unknown>;
  change: "added" | "unchanged";
} {
  if (!isRecord(hooks))
    throw new AgentFileError(`${CODEX_HOOKS_FILE} does not hold a JSON object, so it was not changed.`);
  const hooksValue = hooks.hooks;
  if (hooksValue !== undefined && !isRecord(hooksValue)) {
    throw new AgentFileError(`${CODEX_HOOKS_FILE} has a "hooks" value that is not an object, so it was not changed.`);
  }
  const events = (hooksValue ?? {}) as Record<string, unknown>;
  const postValue = events.PostToolUse;
  if (postValue !== undefined && !Array.isArray(postValue)) {
    throw new AgentFileError(
      `${CODEX_HOOKS_FILE} has a "hooks.PostToolUse" value that is not an array, so it was not changed.`,
    );
  }
  const postToolUse = (postValue ?? []) as unknown[];
  if (hasEvergreenCodexPostToolUse(postToolUse)) return { hooks: structuredClone(hooks), change: "unchanged" };
  const entry = {
    matcher: CODEX_HOOK_MATCHER,
    hooks: [{ type: "command", command: CODEX_HOOK_COMMAND, timeout: 60 }],
  };
  return {
    hooks: { ...structuredClone(hooks), hooks: { ...events, PostToolUse: [...structuredClone(postToolUse), entry] } },
    change: "added",
  };
}

/**
 * Writes or merges the Codex post-edit hook into `.codex/hooks.json`, the project-level location Codex documents
 * (<https://learn.chatgpt.com/docs/hooks>), preserving the user's hooks. The home directory is never touched.
 */
export async function initCodexHooks(options: InitCodexHooksOptions): Promise<InitCodexHooksResult> {
  const root = resolve(options.root);
  const info = await lstat(root).catch(() => undefined);
  if (!info?.isDirectory()) throw new AgentFileError(`${root} is not a directory.`);
  const path = join(root, CODEX_HOOKS_FILE);
  await assertInside(root, path);
  const before = await read(path);
  let parsed: unknown = {};
  if (before !== undefined) {
    try {
      parsed = JSON.parse(before);
    } catch {
      throw new AgentFileError(`${CODEX_HOOKS_FILE} is not valid JSON, so it was not changed.`);
    }
  }
  const update = withCodexPostToolUse(parsed);
  const text = `${JSON.stringify(update.hooks, null, 2)}\n`;
  const change = before === undefined ? "created" : update.change === "unchanged" ? "unchanged" : "updated";
  const diff = change === "unchanged" ? "" : renderDiff(CODEX_HOOKS_FILE, before ?? "", text);
  if (change === "unchanged" || options.dryRun) return { file: CODEX_HOOKS_FILE, change, written: false, diff };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return { file: CODEX_HOOKS_FILE, change, written: true, diff };
}

export const CURSOR_HOOKS_FILE = ".cursor/hooks.json";
export const CURSOR_RULES_FILE = ".cursor/rules/evergreen.mdc";
/** The same launcher as the other hosts: the project's own package first, the global `evergreen` bin as fallback. */
export const CURSOR_HOOK_COMMAND = "npx --no-install evergreen-deprecation hook cursor";
/** Front matter Cursor requires on a newly created project rule (matches `setup.ts`). */
export const CURSOR_RULE_PREFIX =
  "---\ndescription: Check a dependency with Evergreen before adding it\nalwaysApply: true\n---\n\n";

export type InitCursorHooksOptions = InitClaudeHooksOptions;

export interface InitCursorHooksResult {
  hooks: InitClaudeHooksResult;
  rule: InitAgentsResult;
}

/** Recognizes the Cursor hook this command wrote, however its launcher is spelled. */
const EVERGREEN_CURSOR_HOOK_COMMAND = /\bevergreen(?:-deprecation)?\b.*\bhook\s+cursor\b/;

function hasEvergreenAfterFileEdit(entries: readonly unknown[]): boolean {
  return entries.some(
    (entry) =>
      isRecord(entry) && typeof entry.command === "string" && EVERGREEN_CURSOR_HOOK_COMMAND.test(entry.command),
  );
}

/**
 * Merges the `afterFileEdit` entry into a parsed Cursor hooks document, keeping every existing key and hook.
 * Cursor's project file is `.cursor/hooks.json` with top-level `version` and a flat command list per event
 * (<https://cursor.com/docs/hooks>, checked 2026-11-07).
 */
export function withCursorAfterFileEdit(document: unknown): {
  document: Record<string, unknown>;
  change: "added" | "unchanged";
} {
  if (!isRecord(document))
    throw new AgentFileError(`${CURSOR_HOOKS_FILE} does not hold a JSON object, so it was not changed.`);
  const hooksValue = document.hooks;
  if (hooksValue !== undefined && !isRecord(hooksValue)) {
    throw new AgentFileError(`${CURSOR_HOOKS_FILE} has a "hooks" value that is not an object, so it was not changed.`);
  }
  const events: Record<string, unknown> = hooksValue === undefined ? {} : hooksValue;
  const afterValue = events.afterFileEdit;
  if (afterValue !== undefined && !Array.isArray(afterValue)) {
    throw new AgentFileError(
      `${CURSOR_HOOKS_FILE} has a "hooks.afterFileEdit" value that is not an array, so it was not changed.`,
    );
  }
  const afterFileEdit: unknown[] = afterValue === undefined ? [] : afterValue.map((entry: unknown) => entry);
  if (hasEvergreenAfterFileEdit(afterFileEdit)) return { document: structuredClone(document), change: "unchanged" };
  const entry = { command: CURSOR_HOOK_COMMAND, timeout: 60 };
  return {
    document: {
      ...structuredClone(document),
      version: typeof document.version === "number" ? document.version : 1,
      hooks: { ...events, afterFileEdit: [...afterFileEdit, entry] },
    },
    change: "added",
  };
}

/**
 * Writes or merges the Cursor post-edit hook into `.cursor/hooks.json` and keeps `.cursor/rules/evergreen.mdc`.
 * Cursor's `afterFileEdit` cannot return text to the agent, so the always-applied rule is the instruction path;
 * the hook itself only audits to stderr. The home directory is never touched.
 */
export async function initCursorHooks(options: InitCursorHooksOptions): Promise<InitCursorHooksResult> {
  const root = resolve(options.root);
  const info = await lstat(root).catch(() => undefined);
  if (!info?.isDirectory()) throw new AgentFileError(`${root} is not a directory.`);
  const path = join(root, CURSOR_HOOKS_FILE);
  await assertInside(root, path);
  const before = await read(path);
  let parsed: unknown = {};
  if (before !== undefined) {
    try {
      parsed = JSON.parse(before);
    } catch {
      throw new AgentFileError(`${CURSOR_HOOKS_FILE} is not valid JSON, so it was not changed.`);
    }
  }
  const update = withCursorAfterFileEdit(parsed);
  const text = `${JSON.stringify(update.document, null, 2)}\n`;
  const change = before === undefined ? "created" : update.change === "unchanged" ? "unchanged" : "updated";
  const diff = change === "unchanged" ? "" : renderDiff(CURSOR_HOOKS_FILE, before ?? "", text);
  let written = false;
  if (change !== "unchanged" && !options.dryRun) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
    written = true;
  }
  const hooks: InitClaudeHooksResult = { file: CURSOR_HOOKS_FILE, change, written, diff };
  const rule = await updateAgentFile(root, CURSOR_RULES_FILE, {
    createPrefix: CURSOR_RULE_PREFIX,
    ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
  });
  return { hooks, rule };
}

export const GEMINI_SETTINGS_FILE = ".gemini/settings.json";
export const GEMINI_HOOK_MATCHER = "write_file|replace";
/** The same launcher as the other hosts: the project's own package first, the global `evergreen` bin as fallback. */
export const GEMINI_HOOK_COMMAND = "npx --no-install evergreen-deprecation hook gemini";
/** Gemini CLI measures hook timeouts in milliseconds, so this is the documented default of one minute. */
export const GEMINI_HOOK_TIMEOUT_MS = 60_000;

export type InitGeminiHooksOptions = InitClaudeHooksOptions;
export type InitGeminiHooksResult = InitClaudeHooksResult;

/** Recognizes the Gemini CLI hook this command wrote, however its launcher is spelled. */
const EVERGREEN_GEMINI_HOOK_COMMAND = /\bevergreen(?:-deprecation)?\b.*\bhook\s+gemini\b/;

function hasEvergreenGeminiAfterTool(entries: readonly unknown[]): boolean {
  return entries.some((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.hooks)) return false;
    return entry.hooks.some(
      (hook) => isRecord(hook) && typeof hook.command === "string" && EVERGREEN_GEMINI_HOOK_COMMAND.test(hook.command),
    );
  });
}

/**
 * Merges the `AfterTool` entry into a parsed Gemini CLI settings document, keeping every existing setting and
 * hook. Gemini CLI reads the project file `.gemini/settings.json` with `hooks.<Event>` arrays of
 * `{ matcher, hooks }` entries, and matchers are regular expressions
 * (<https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md>, Gemini CLI 0.67.0, 2026-11-04).
 */
export function withGeminiAfterTool(settings: unknown): {
  settings: Record<string, unknown>;
  change: "added" | "unchanged";
} {
  if (!isRecord(settings))
    throw new AgentFileError(`${GEMINI_SETTINGS_FILE} does not hold a JSON object, so it was not changed.`);
  const hooksValue = settings.hooks;
  if (hooksValue !== undefined && !isRecord(hooksValue)) {
    throw new AgentFileError(
      `${GEMINI_SETTINGS_FILE} has a "hooks" value that is not an object, so it was not changed.`,
    );
  }
  const hooks: Record<string, unknown> = hooksValue === undefined ? {} : hooksValue;
  const afterValue = hooks.AfterTool;
  if (afterValue !== undefined && !Array.isArray(afterValue)) {
    throw new AgentFileError(
      `${GEMINI_SETTINGS_FILE} has a "hooks.AfterTool" value that is not an array, so it was not changed.`,
    );
  }
  const afterTool = (afterValue ?? []) as unknown[];
  if (hasEvergreenGeminiAfterTool(afterTool)) return { settings: structuredClone(settings), change: "unchanged" };
  const entry = {
    matcher: GEMINI_HOOK_MATCHER,
    hooks: [{ name: "evergreen", type: "command", command: GEMINI_HOOK_COMMAND, timeout: GEMINI_HOOK_TIMEOUT_MS }],
  };
  return {
    settings: {
      ...structuredClone(settings),
      hooks: { ...hooks, AfterTool: [...structuredClone(afterTool), entry] },
    },
    change: "added",
  };
}

/**
 * Writes or merges the Gemini CLI post-edit hook into `.gemini/settings.json`, preserving the user's settings
 * and hooks. The home directory is never touched.
 */
export async function initGeminiHooks(options: InitGeminiHooksOptions): Promise<InitGeminiHooksResult> {
  const root = resolve(options.root);
  const info = await lstat(root).catch(() => undefined);
  if (!info?.isDirectory()) throw new AgentFileError(`${root} is not a directory.`);
  const path = join(root, GEMINI_SETTINGS_FILE);
  await assertInside(root, path);
  const before = await read(path);
  let parsed: unknown = {};
  if (before !== undefined) {
    try {
      parsed = JSON.parse(before);
    } catch {
      throw new AgentFileError(`${GEMINI_SETTINGS_FILE} is not valid JSON, so it was not changed.`);
    }
  }
  const update = withGeminiAfterTool(parsed);
  const text = `${JSON.stringify(update.settings, null, 2)}\n`;
  const change = before === undefined ? "created" : update.change === "unchanged" ? "unchanged" : "updated";
  const diff = change === "unchanged" ? "" : renderDiff(GEMINI_SETTINGS_FILE, before ?? "", text);
  if (change === "unchanged" || options.dryRun) return { file: GEMINI_SETTINGS_FILE, change, written: false, diff };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return { file: GEMINI_SETTINGS_FILE, change, written: true, diff };
}

export const COPILOT_HOOKS_FILE = ".github/hooks/evergreen.json";
export const COPILOT_HOOK_MATCHER = "create|edit";
/** The same launcher as the other hosts: the project's own package first, the global `evergreen` bin as fallback. */
export const COPILOT_HOOK_COMMAND = "npx --no-install evergreen-deprecation hook copilot";
/** Copilot measures hook timeouts in seconds, so this is a minute, matching the other hosts. */
export const COPILOT_HOOK_TIMEOUT_SEC = 60;

export type InitCopilotHooksOptions = InitClaudeHooksOptions;
export type InitCopilotHooksResult = InitClaudeHooksResult;

/** Recognizes a Copilot hook this command wrote, however its launcher is spelled and whichever command field holds it. */
const EVERGREEN_COPILOT_HOOK_COMMAND = /\bevergreen(?:-deprecation)?\b.*\bhook\s+copilot\b/;

function isEvergreenCopilotEntry(entry: unknown): boolean {
  if (!isRecord(entry)) return false;
  return [entry.command, entry.bash, entry.powershell].some(
    (command) => typeof command === "string" && EVERGREEN_COPILOT_HOOK_COMMAND.test(command),
  );
}

/**
 * Merges the `postToolUse` entry into a parsed Copilot hooks document, keeping every existing key and hook.
 * Copilot reads every `.github/hooks/*.json` file with `version: 1` and `hooks.<event>` arrays of command
 * hooks, and matches `postToolUse` against the runtime tool name
 * (<https://docs.github.com/en/copilot/reference/hooks-reference>, Copilot CLI 1.0.107, 2026-11-07).
 */
export function withCopilotPostToolUse(document: unknown): {
  document: Record<string, unknown>;
  change: "added" | "unchanged";
} {
  if (!isRecord(document))
    throw new AgentFileError(`${COPILOT_HOOKS_FILE} does not hold a JSON object, so it was not changed.`);
  if (document.version !== undefined && document.version !== 1)
    throw new AgentFileError(`${COPILOT_HOOKS_FILE} has a "version" value other than 1, so it was not changed.`);
  const hooksValue = document.hooks;
  if (hooksValue !== undefined && !isRecord(hooksValue)) {
    throw new AgentFileError(`${COPILOT_HOOKS_FILE} has a "hooks" value that is not an object, so it was not changed.`);
  }
  const hooks: Record<string, unknown> = hooksValue === undefined ? {} : hooksValue;
  const postValue = hooks.postToolUse;
  if (postValue !== undefined && !Array.isArray(postValue)) {
    throw new AgentFileError(
      `${COPILOT_HOOKS_FILE} has a "hooks.postToolUse" value that is not an array, so it was not changed.`,
    );
  }
  const postToolUse = (postValue ?? []) as unknown[];
  if (postToolUse.some(isEvergreenCopilotEntry)) return { document: structuredClone(document), change: "unchanged" };
  const entry = {
    type: "command",
    matcher: COPILOT_HOOK_MATCHER,
    command: COPILOT_HOOK_COMMAND,
    timeoutSec: COPILOT_HOOK_TIMEOUT_SEC,
  };
  return {
    document: {
      ...structuredClone(document),
      version: document.version ?? 1,
      hooks: { ...hooks, postToolUse: [...structuredClone(postToolUse), entry] },
    },
    change: "added",
  };
}

/**
 * Writes or merges the Copilot post-edit hook into `.github/hooks/evergreen.json`, preserving the user's hooks.
 * The repo-level file is the one Copilot CLI and Copilot in the cloud both load; the instruction file that
 * `evergreen setup` writes stays untouched.
 */
export async function initCopilotHooks(options: InitCopilotHooksOptions): Promise<InitCopilotHooksResult> {
  const root = resolve(options.root);
  const info = await lstat(root).catch(() => undefined);
  if (!info?.isDirectory()) throw new AgentFileError(`${root} is not a directory.`);
  const path = join(root, COPILOT_HOOKS_FILE);
  await assertInside(root, path);
  const before = await read(path);
  let parsed: unknown = {};
  if (before !== undefined) {
    try {
      parsed = JSON.parse(before);
    } catch {
      throw new AgentFileError(`${COPILOT_HOOKS_FILE} is not valid JSON, so it was not changed.`);
    }
  }
  const update = withCopilotPostToolUse(parsed);
  const text = `${JSON.stringify(update.document, null, 2)}\n`;
  const change = before === undefined ? "created" : update.change === "unchanged" ? "unchanged" : "updated";
  const diff = change === "unchanged" ? "" : renderDiff(COPILOT_HOOKS_FILE, before ?? "", text);
  if (change === "unchanged" || options.dryRun) return { file: COPILOT_HOOKS_FILE, change, written: false, diff };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return { file: COPILOT_HOOKS_FILE, change, written: true, diff };
}

export const CLINE_HOOKS_FILE = ".clinerules/hooks/PostToolUse";
/** The same launcher as the other hosts: the project's own package first, the global `evergreen` bin as fallback. */
export const CLINE_HOOK_COMMAND = "npx --no-install evergreen-deprecation hook cline";
/** Cline reads one executable file per event through its shebang, so the configuration is the script itself. */
export const CLINE_HOOK_SCRIPT = `#!/usr/bin/env bash\n# Evergreen checks the file Cline's PostToolUse payload names; it only prints and never edits files.\nexec ${CLINE_HOOK_COMMAND}\n`;

export type InitClineHooksOptions = InitClaudeHooksOptions;
export type InitClineHooksResult = InitClaudeHooksResult;

/**
 * Writes Cline's project-level `PostToolUse` file hook at `.clinerules/hooks/PostToolUse`, the workspace
 * location the VS Code extension documents
 * (<https://github.com/cline/cline/blob/main/.clinerules/hooks/README.md>, checked 2026-11-08 against Cline
 * 4.1.26, current stable, 2026-10-26). Cline keeps one file per event, not a list of entries, so a file Evergreen
 * did not write is left untouched.
 */
export async function initClineHooks(options: InitClineHooksOptions): Promise<InitClineHooksResult> {
  const root = resolve(options.root);
  const info = await lstat(root).catch(() => undefined);
  if (!info?.isDirectory()) throw new AgentFileError(`${root} is not a directory.`);
  const path = join(root, CLINE_HOOKS_FILE);
  await assertInside(root, path);
  const before = await read(path);
  if (before !== undefined && before !== CLINE_HOOK_SCRIPT)
    throw new AgentFileError(
      `${CLINE_HOOKS_FILE} already holds a hook Evergreen did not write, so it was not changed. Add \`${CLINE_HOOK_COMMAND}\` to it yourself.`,
    );
  const change = before === undefined ? "created" : "unchanged";
  const diff = change === "unchanged" ? "" : renderDiff(CLINE_HOOKS_FILE, "", CLINE_HOOK_SCRIPT);
  if (change === "unchanged" || options.dryRun) return { file: CLINE_HOOKS_FILE, change, written: false, diff };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, CLINE_HOOK_SCRIPT, { mode: 0o755 });
  return { file: CLINE_HOOKS_FILE, change, written: true, diff };
}

export const DEVIN_HOOKS_FILE = ".devin/hooks.v1.json";
export const DEVIN_HOOK_MATCHER = "^(write|edit|apply_patch)$";
/** The same launcher as the other hosts: the project's own package first, the global `evergreen` bin as fallback. */
export const DEVIN_HOOK_COMMAND = "npx --no-install evergreen-deprecation hook devin";
/** Devin measures hook timeouts in seconds, so this is a minute, matching the other hosts. */
export const DEVIN_HOOK_TIMEOUT_SEC = 60;

export type InitDevinHooksOptions = InitClaudeHooksOptions;
export type InitDevinHooksResult = InitClaudeHooksResult;

/** Recognizes the Devin Local hook this command wrote, however its launcher is spelled. */
const EVERGREEN_DEVIN_HOOK_COMMAND = /\bevergreen(?:-deprecation)?\b.*\bhook\s+devin\b/;

function hasEvergreenDevinPostToolUse(entries: readonly unknown[]): boolean {
  return entries.some((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.hooks)) return false;
    return entry.hooks.some(
      (hook) => isRecord(hook) && typeof hook.command === "string" && EVERGREEN_DEVIN_HOOK_COMMAND.test(hook.command),
    );
  });
}

/**
 * Merges the `PostToolUse` entry into a parsed Devin hooks document. In `.devin/hooks.v1.json` the hooks object
 * is the entire file (no wrapper key), with `PostToolUse` arrays of `{ matcher, hooks }` entries
 * (<https://docs.devin.ai/cli/extensibility/hooks/overview.md>, checked 2026-11-08).
 */
export function withDevinPostToolUse(document: unknown): {
  document: Record<string, unknown>;
  change: "added" | "unchanged";
} {
  if (!isRecord(document))
    throw new AgentFileError(`${DEVIN_HOOKS_FILE} does not hold a JSON object, so it was not changed.`);
  const postValue = document.PostToolUse;
  if (postValue !== undefined && !Array.isArray(postValue)) {
    throw new AgentFileError(
      `${DEVIN_HOOKS_FILE} has a "PostToolUse" value that is not an array, so it was not changed.`,
    );
  }
  const postToolUse = (postValue ?? []) as unknown[];
  if (hasEvergreenDevinPostToolUse(postToolUse)) return { document: structuredClone(document), change: "unchanged" };
  const entry = {
    matcher: DEVIN_HOOK_MATCHER,
    hooks: [{ type: "command", command: DEVIN_HOOK_COMMAND, timeout: DEVIN_HOOK_TIMEOUT_SEC }],
  };
  return {
    document: { ...structuredClone(document), PostToolUse: [...structuredClone(postToolUse), entry] },
    change: "added",
  };
}

/**
 * Writes or merges the Devin Local post-edit hook into `.devin/hooks.v1.json`, preserving the user's other
 * events and hooks. The home directory is never touched.
 */
export async function initDevinHooks(options: InitDevinHooksOptions): Promise<InitDevinHooksResult> {
  const root = resolve(options.root);
  const info = await lstat(root).catch(() => undefined);
  if (!info?.isDirectory()) throw new AgentFileError(`${root} is not a directory.`);
  const path = join(root, DEVIN_HOOKS_FILE);
  await assertInside(root, path);
  const before = await read(path);
  let parsed: unknown = {};
  if (before !== undefined) {
    try {
      parsed = JSON.parse(before);
    } catch {
      throw new AgentFileError(`${DEVIN_HOOKS_FILE} is not valid JSON, so it was not changed.`);
    }
  }
  const update = withDevinPostToolUse(parsed);
  const text = `${JSON.stringify(update.document, null, 2)}\n`;
  const change = before === undefined ? "created" : update.change === "unchanged" ? "unchanged" : "updated";
  const diff = change === "unchanged" ? "" : renderDiff(DEVIN_HOOKS_FILE, before ?? "", text);
  if (change === "unchanged" || options.dryRun) return { file: DEVIN_HOOKS_FILE, change, written: false, diff };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return { file: DEVIN_HOOKS_FILE, change, written: true, diff };
}

export async function initAgents(options: InitAgentsOptions): Promise<InitAgentsResult> {
  const root = resolve(options.root);
  const info = await lstat(root).catch(() => undefined);
  if (!info?.isDirectory()) throw new AgentFileError(`${root} is not a directory.`);

  let file: AgentFileName;
  if (options.file) file = options.file;
  else if ((await read(join(root, "AGENTS.md"))) !== undefined) file = "AGENTS.md";
  else if ((await read(join(root, "CLAUDE.md"))) !== undefined) file = "CLAUDE.md";
  else file = "AGENTS.md";

  return updateAgentFile(root, file, options.dryRun === undefined ? {} : { dryRun: options.dryRun });
}

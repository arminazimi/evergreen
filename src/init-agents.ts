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
export async function updateAgentFile(root: string, file: string, options: AgentFileOptions = {}): Promise<InitAgentsResult> {
  const path = join(root, file);
  await assertInside(root, path);
  const before = await read(path);
  const update = withAgentSection(before);
  const text = update.change === "created" && options.createPrefix ? `${options.createPrefix}${update.text}` : update.text;
  const diff = update.change === "unchanged" ? "" : renderDiff(file, before ?? "", text);
  if (update.change === "unchanged" || options.dryRun) return { file: file as AgentFileName, change: update.change, written: false, diff };
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
    return entry.hooks.some((hook) => isRecord(hook) && typeof hook.command === "string" && EVERGREEN_HOOK_COMMAND.test(hook.command));
  });
}

/** Merges the post-edit entry into a parsed settings document, keeping every existing key and hook in place. */
export function withClaudeCodePostToolUse(settings: unknown): { settings: Record<string, unknown>; change: "added" | "unchanged" } {
  if (!isRecord(settings)) throw new AgentFileError(`${CLAUDE_CODE_SETTINGS_FILE} does not hold a JSON object, so it was not changed.`);
  const hooksValue = settings.hooks;
  if (hooksValue !== undefined && !isRecord(hooksValue)) {
    throw new AgentFileError(`${CLAUDE_CODE_SETTINGS_FILE} has a "hooks" value that is not an object, so it was not changed.`);
  }
  const hooks = (hooksValue ?? {}) as Record<string, unknown>;
  const postValue = hooks.PostToolUse;
  if (postValue !== undefined && !Array.isArray(postValue)) {
    throw new AgentFileError(`${CLAUDE_CODE_SETTINGS_FILE} has a "hooks.PostToolUse" value that is not an array, so it was not changed.`);
  }
  const postToolUse = (postValue ?? []) as unknown[];
  if (hasEvergreenPostToolUse(postToolUse)) return { settings: structuredClone(settings), change: "unchanged" };
  const entry = {
    matcher: CLAUDE_CODE_HOOK_MATCHER,
    hooks: [{ type: "command", command: CLAUDE_CODE_HOOK_COMMAND, timeout: 60 }],
  };
  return {
    settings: { ...structuredClone(settings), hooks: { ...hooks, PostToolUse: [...structuredClone(postToolUse), entry] } },
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
  if (change === "unchanged" || options.dryRun) return { file: CLAUDE_CODE_SETTINGS_FILE, change, written: false, diff };
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
    return entry.hooks.some((hook) => isRecord(hook) && typeof hook.command === "string" && EVERGREEN_CODEX_HOOK_COMMAND.test(hook.command));
  });
}

/** Merges the post-edit entry into a parsed hooks document, keeping every existing key and hook in place. */
export function withCodexPostToolUse(hooks: unknown): { hooks: Record<string, unknown>; change: "added" | "unchanged" } {
  if (!isRecord(hooks)) throw new AgentFileError(`${CODEX_HOOKS_FILE} does not hold a JSON object, so it was not changed.`);
  const hooksValue = hooks.hooks;
  if (hooksValue !== undefined && !isRecord(hooksValue)) {
    throw new AgentFileError(`${CODEX_HOOKS_FILE} has a "hooks" value that is not an object, so it was not changed.`);
  }
  const events = (hooksValue ?? {}) as Record<string, unknown>;
  const postValue = events.PostToolUse;
  if (postValue !== undefined && !Array.isArray(postValue)) {
    throw new AgentFileError(`${CODEX_HOOKS_FILE} has a "hooks.PostToolUse" value that is not an array, so it was not changed.`);
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

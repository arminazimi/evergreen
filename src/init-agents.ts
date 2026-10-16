import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

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

/** Refuses a file that is a link pointing outside the repository: the command must not write through it. */
async function assertInside(root: string, path: string): Promise<void> {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (!info.isSymbolicLink()) return;
  const target = await realpath(path);
  const inside = relative(await realpath(root), target);
  if (inside.startsWith("..") || inside.split(sep)[0] === "..") {
    throw new AgentFileError(`${path} is a link to a file outside the repository, so it was not changed.`);
  }
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

  const path = join(root, file);
  await assertInside(root, path);
  const before = await read(path);
  const { text, change } = withAgentSection(before);
  const diff = change === "unchanged" ? "" : renderDiff(file, before ?? "", text);
  if (change === "unchanged" || options.dryRun) return { file, change, written: false, diff };
  await writeFile(path, text);
  return { file, change, written: true, diff };
}

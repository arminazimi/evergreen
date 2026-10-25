import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { AgentFileError, renderDiff } from "./agent-instructions.js";
import type { Severity } from "./domain.js";
import { withHookBlock } from "./init-hooks.js";

const execute = promisify(execFile);

export interface InitPersonalOptions {
  gate: Severity;
  /** Report what would change, including a diff, and write nothing. */
  dryRun?: boolean;
  env?: NodeJS.ProcessEnv;
  /** Asked once, before anything is written; returning false changes nothing. */
  confirm?: (summary: string) => Promise<boolean>;
}

export interface InitPersonalResult {
  change: "created" | "updated" | "unchanged" | "declined";
  written: boolean;
  configFile: string;
  hooksDirectory: string;
  /** A unified diff of the hook and the config; empty when nothing changes. */
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

async function globalHooksPath(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  try {
    const { stdout } = await execute("git", ["config", "--global", "--get", "core.hooksPath"], { env });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

function personalDirectory(env: NodeJS.ProcessEnv): string {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "evergreen");
}

/** True once `evergreen init --personal` has written the global config. */
export async function hasPersonalConfig(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return (await read(join(personalDirectory(env), "config.json"))) !== undefined;
}

/** Writes a global config and a global pre-push hook, then points `core.hooksPath` at it, so every repository on this machine is protected. */
export async function initPersonal(options: InitPersonalOptions): Promise<InitPersonalResult> {
  const env = options.env ?? process.env;
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  const base = personalDirectory(env);
  const configFile = join(base, "config.json");
  const hooksDirectory = join(base, "git-hooks");
  const hookFile = join(hooksDirectory, "pre-push");

  const current = await globalHooksPath(env);
  if (current !== undefined && resolve(home, current) !== resolve(hooksDirectory)) {
    throw new AgentFileError(`Git already uses ${current} as the global hooks path, so it was not changed. Add \`npx --no-install evergreen-deprecation scan . --fail-on ${options.gate} --format compact\` to the pre-push hook there yourself.`);
  }

  const hookBefore = await read(hookFile);
  const hook = withHookBlock(hookBefore, options.gate, true);
  if (hook.change === "added") {
    throw new AgentFileError(`${hookFile} already exists and is not managed by Evergreen, so it was not changed.`);
  }
  const configBefore = await read(configFile);
  const config = `${JSON.stringify({ failOn: options.gate }, null, 2)}\n`;
  const pathSet = current !== undefined;

  const diff = [
    hook.change === "unchanged" ? "" : renderDiff(hookFile, hookBefore ?? "", hook.text),
    config === configBefore ? "" : renderDiff(configFile, configBefore ?? "", config),
  ].filter(Boolean).join("\n");
  const unchanged = hook.change === "unchanged" && config === configBefore && pathSet;
  const change = unchanged ? "unchanged" : hookBefore === undefined ? "created" : "updated";
  const result = { change, written: false, configFile, hooksDirectory, diff } as const;
  if (unchanged || options.dryRun) return result;

  const summary = `Write ${configFile} and ${hookFile}, and run \`git config --global core.hooksPath ${hooksDirectory}\`. Every repository on this machine will then run the Evergreen pre-push hook.`;
  if (!options.confirm || !(await options.confirm(summary))) return { ...result, change: "declined" };

  await mkdir(hooksDirectory, { recursive: true });
  await writeFile(configFile, config);
  await writeFile(hookFile, hook.text);
  await chmod(hookFile, 0o755);
  await execute("git", ["config", "--global", "core.hooksPath", hooksDirectory], { env });
  return { ...result, written: true };
}

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

export function personalDirectory(env: NodeJS.ProcessEnv): string {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "evergreen");
}

/** True once `evergreen init --personal` has written the global config. */
export async function hasPersonalConfig(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return (await read(join(personalDirectory(env), "config.json"))) !== undefined;
}

interface PersonalPaths {
  home: string;
  configFile: string;
  hooksDirectory: string;
  hookFile: string;
}

function personalPaths(env: NodeJS.ProcessEnv): PersonalPaths {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  const base = personalDirectory(env);
  const hooksDirectory = join(base, "git-hooks");
  return { home, configFile: join(base, "config.json"), hooksDirectory, hookFile: join(hooksDirectory, "pre-push") };
}

/** Refuses to replace a global hooks path that belongs to something else. */
function assertHooksPathFree(current: string | undefined, paths: PersonalPaths, gate: Severity): void {
  if (current === undefined || resolve(paths.home, current) === resolve(paths.hooksDirectory)) return;
  throw new AgentFileError(
    `Git already uses ${current} as the global hooks path, so it was not changed. Add \`npx --no-install evergreen-deprecation scan . --fail-on ${gate} --format compact\` to the pre-push hook there yourself.`,
  );
}

/** Refuses to touch an existing pre-push hook that Evergreen does not manage. */
function assertHookManaged(hook: ReturnType<typeof withHookBlock>, hookFile: string): void {
  if (hook.change === "added") {
    throw new AgentFileError(`${hookFile} already exists and is not managed by Evergreen, so it was not changed.`);
  }
}

function personalDiff(
  paths: PersonalPaths,
  hook: ReturnType<typeof withHookBlock>,
  hookBefore: string | undefined,
  configBefore: string | undefined,
  config: string,
): string {
  const parts = [
    hook.change === "unchanged" ? "" : renderDiff(paths.hookFile, hookBefore ?? "", hook.text),
    config === configBefore ? "" : renderDiff(paths.configFile, configBefore ?? "", config),
  ];
  return parts.filter(Boolean).join("\n");
}

function personalChange(unchanged: boolean, hookBefore: string | undefined): InitPersonalResult["change"] {
  if (unchanged) return "unchanged";
  return hookBefore === undefined ? "created" : "updated";
}

interface PersonalWrite {
  paths: PersonalPaths;
  config: string;
  hookText: string;
  summary: string;
}

async function writePersonal(
  write: PersonalWrite,
  env: NodeJS.ProcessEnv,
  confirm: InitPersonalOptions["confirm"],
): Promise<boolean> {
  if (!confirm || !(await confirm(write.summary))) return false;
  const { paths } = write;
  await mkdir(paths.hooksDirectory, { recursive: true });
  await writeFile(paths.configFile, write.config);
  await writeFile(paths.hookFile, write.hookText);
  await chmod(paths.hookFile, 0o755);
  await execute("git", ["config", "--global", "core.hooksPath", paths.hooksDirectory], { env });
  return true;
}

/** Writes a global config and a global pre-push hook, then points `core.hooksPath` at it, so every repository on this machine is protected. */
export async function initPersonal(options: InitPersonalOptions): Promise<InitPersonalResult> {
  const env = options.env ?? process.env;
  const paths = personalPaths(env);
  const current = await globalHooksPath(env);
  assertHooksPathFree(current, paths, options.gate);

  const hookBefore = await read(paths.hookFile);
  const hook = withHookBlock(hookBefore, options.gate, true);
  assertHookManaged(hook, paths.hookFile);
  const configBefore = await read(paths.configFile);
  const config = `${JSON.stringify({ failOn: options.gate }, null, 2)}\n`;
  const unchanged = hook.change === "unchanged" && config === configBefore && current !== undefined;

  const result: InitPersonalResult = {
    change: personalChange(unchanged, hookBefore),
    written: false,
    configFile: paths.configFile,
    hooksDirectory: paths.hooksDirectory,
    diff: unchanged ? "" : personalDiff(paths, hook, hookBefore, configBefore, config),
  };
  if (unchanged || options.dryRun) return result;

  const summary = `Write ${paths.configFile} and ${paths.hookFile}, and run \`git config --global core.hooksPath ${paths.hooksDirectory}\`. Every repository on this machine will then run the Evergreen pre-push hook.`;
  const written = await writePersonal({ paths, config, hookText: hook.text, summary }, env, options.confirm);
  return written ? { ...result, written: true } : { ...result, change: "declined" };
}

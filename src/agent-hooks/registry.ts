import { readdir } from "node:fs/promises";

import type { HostHook } from "./types.js";

const hostsDirectory = new URL("./hosts/", import.meta.url);

function isHostModule(value: unknown): value is { hostHook: HostHook } {
  return typeof value === "object" && value !== null && "hostHook" in value && value.hostHook !== undefined;
}

let builtIn: Promise<HostHook[]> | undefined;

/**
 * Every host module in a directory, ordered by file name. A module is any `<id>.js` that exports `hostHook`; the
 * file name is the host id, so two hosts can never collide and no list needs an entry.
 */
export async function loadHostHooks(directory: URL = hostsDirectory): Promise<HostHook[]> {
  const files = (await readdir(directory)).filter((name) => name.endsWith(".js")).sort();
  const hooks: HostHook[] = [];
  for (const file of files) {
    const module: unknown = await import(new URL(file, directory).href);
    if (!isHostModule(module)) throw new Error(`${file} does not export hostHook.`);
    hooks.push(module.hostHook);
  }
  return hooks;
}

/** The built-in hosts, loaded once. */
export function builtInHostHooks(): Promise<HostHook[]> {
  builtIn ??= loadHostHooks();
  return builtIn;
}

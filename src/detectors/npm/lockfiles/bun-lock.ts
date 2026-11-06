import semver from "semver";

import { stripJsonc } from "../../../jsonc.js";
import { addEdges, addResolved } from "./shared.js";
import type { LockData } from "./shared.js";

function packageFromBunDescriptor(rawKey: string): { name: string; version: string } | undefined {
  const key = rawKey.replace(/\(.+\)$/, "");
  const separator = key.lastIndexOf("@");
  if (separator <= 0) return undefined;
  let name = key.slice(0, separator);
  let version = key.slice(separator + 1);
  if (name.includes("@npm:")) {
    name = name.slice(name.indexOf("@npm:") + 5);
  } else if (name.startsWith("npm:")) {
    name = name.slice(4);
  }
  if (version.startsWith("npm:")) version = version.slice(4);
  return semver.valid(version) ? { name, version } : undefined;
}

/** Reads the text `bun.lock` (JSONC). The binary `bun.lockb` is reported as unclassified by the detector. */
export function parseBunLock(contents: string, { versions: target, graph }: LockData): void {
  let lock: { packages?: Record<string, unknown>; workspaces?: Record<string, unknown> };
  try {
    lock = JSON.parse(stripJsonc(contents)) as {
      packages?: Record<string, unknown>;
      workspaces?: Record<string, unknown>;
    };
  } catch {
    return;
  }
  if (!lock || typeof lock !== "object") return;
  const packages = lock.packages;
  if (!packages || typeof packages !== "object") return;

  for (const [key, entry] of Object.entries(packages)) {
    if (!Array.isArray(entry) || entry.length === 0) continue;
    const descriptor = typeof entry[0] === "string" ? entry[0] : "";
    const parsed = packageFromBunDescriptor(descriptor) ?? packageFromBunDescriptor(key);
    if (!parsed) continue;
    addResolved(target, parsed.name, parsed.version);

    const meta = entry
      .slice(1)
      .find(
        (item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item),
      );
    if (meta) {
      const deps = meta.dependencies as Record<string, unknown> | undefined;
      const optDeps = meta.optionalDependencies as Record<string, unknown> | undefined;
      addEdges(graph, parsed.name, deps, optDeps);
    }
  }
}

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import semver from "semver";

import type { ReplacementRequirements } from "./domain.js";

/** The Node.js and Python versions a repository pins, as written in its files. */
export type PinnedRuntimes = ReplacementRequirements;

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function toolVersion(contents: string | undefined, tool: string): string | undefined {
  for (const line of (contents ?? "").split(/\r?\n/)) {
    const match = new RegExp(`^${tool}\\s+(\\S+)`, "i").exec(line.trim());
    if (match?.[1]) return match[1];
  }
  return undefined;
}

/** Reads the runtimes a repository pins in its root files. Nothing is executed and no network is used. */
export async function readPinnedRuntimes(root: string): Promise<PinnedRuntimes> {
  const toolVersions = await readOptional(resolve(root, ".tool-versions"));
  const node =
    (await readOptional(resolve(root, ".nvmrc")))?.trim() ||
    (await readOptional(resolve(root, ".node-version")))?.trim() ||
    toolVersion(toolVersions, "nodejs") ||
    toolVersion(toolVersions, "node");
  const python =
    (await readOptional(resolve(root, ".python-version")))?.trim() || toolVersion(toolVersions, "python");
  return {
    ...(node && semver.coerce(node) ? { node } : {}),
    ...(python && semver.coerce(python) ? { python } : {}),
  };
}

/** True when the pinned version is lower than the minimum. A pin that is not a version, such as `lts/*`, never conflicts. */
export function isBelowRequirement(pinned: string, minimum: string): boolean {
  const have = semver.coerce(pinned);
  const need = semver.coerce(minimum);
  return have !== null && need !== null && semver.lt(have, need);
}

const RUNTIME_NAMES = { node: "Node.js", python: "Python" } as const;

/** One warning per runtime whose pinned version is below what the replacement needs. */
export function runtimeConflicts(replacement: string, requires: ReplacementRequirements, pinned: PinnedRuntimes): string[] {
  const warnings: string[] = [];
  for (const runtime of ["node", "python"] as const) {
    const minimum = requires[runtime];
    const have = pinned[runtime];
    if (minimum && have && isBelowRequirement(have, minimum)) {
      warnings.push(
        `Warning: ${replacement} requires ${RUNTIME_NAMES[runtime]} ${minimum} or newer, but this repository pins ${RUNTIME_NAMES[runtime]} ${have}. Upgrade the runtime first or choose another replacement.`,
      );
    }
  }
  return warnings;
}

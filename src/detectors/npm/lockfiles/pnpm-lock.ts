import semver from "semver";
import { parseAllDocuments } from "yaml";

import { addEdges, addResolved } from "./shared.js";
import type { LockData } from "./shared.js";

function packageFromPnpmKey(rawKey: string): { name: string; version: string } | undefined {
  const key = rawKey.replace(/^\//, "").replace(/\(.+\)$/, "");
  const separator = key.lastIndexOf("@");
  if (separator <= 0) return undefined;
  const name = key.slice(0, separator);
  const version = key.slice(separator + 1);
  return semver.valid(version) ? { name, version } : undefined;
}

/**
 * pnpm lockfiles can hold more than one YAML document (recent pnpm versions put the package-manager
 * lockfile first and the project lockfile after a `---`), so every document is read. A document that does
 * not parse is skipped: an unreadable lockfile means unresolved versions, never a failed scan.
 */
export function parsePnpmLock(contents: string, { versions: target, graph }: LockData): void {
  for (const document of parseAllDocuments(contents)) {
    if (document.errors.length > 0) continue;
    let lock: { packages?: Record<string, unknown>; snapshots?: Record<string, unknown> } | null;
    try {
      lock = document.toJS() as typeof lock;
    } catch {
      // An unresolved alias is a damaged document: skip it like any other parse error.
      continue;
    }
    for (const entries of [lock?.packages ?? {}, lock?.snapshots ?? {}]) {
      for (const [key, entry] of Object.entries(entries)) {
        const parsed = packageFromPnpmKey(key);
        if (!parsed) continue;
        addResolved(target, parsed.name, parsed.version);
        const edges =
          entry && typeof entry === "object"
            ? (entry as { dependencies?: Record<string, unknown>; optionalDependencies?: Record<string, unknown> })
            : {};
        addEdges(graph, parsed.name, edges.dependencies, edges.optionalDependencies);
      }
    }
  }
}

import { member, readJsonLines } from "./json-lines.js";

/**
 * Pure, bounded parser for `packages.lock.json`: the resolved version of every `"type": "Direct"` dependency,
 * for each target framework in the lock file.
 *
 * `Transitive` and `Project` entries are not declarations of the project and are skipped, as is an entry with
 * no resolved version. The line is the one of `resolved`. A file that is not an object with `dependencies`, or
 * that is malformed, returns nothing.
 */

export interface LockedPackage {
  name: string;
  /** The resolved version. */
  version: string;
  /** The target framework moniker the entry is under, such as `net6.0`. */
  framework: string;
  /** The 1-based line of the `resolved` value. */
  line: number;
}

export function parsePackagesLock(contents: string): LockedPackage[] {
  const dependencies = member(readJsonLines(contents), "dependencies")?.value;
  if (dependencies?.kind !== "object") return [];
  const packages: LockedPackage[] = [];
  for (const framework of dependencies.members) {
    if (framework.value.kind !== "object") continue;
    for (const entry of framework.value.members) {
      const type = member(entry.value, "type")?.value;
      const resolved = member(entry.value, "resolved")?.value;
      if (type?.kind !== "string" || type.value !== "Direct" || resolved?.kind !== "string" || resolved.value === "") continue;
      packages.push({ name: entry.key, version: resolved.value, framework: framework.key, line: resolved.line });
    }
  }
  return packages;
}

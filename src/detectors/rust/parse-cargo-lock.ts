import { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH, readTomlLines, stringValue } from "./toml-lines.js";

/**
 * Pure, bounded parser for the resolved crate versions in Cargo.lock.
 *
 * It returns each `[[package]]` that comes from a registry (it has a `source` that starts with `registry+` or
 * `sparse+`), with the line of its `version`. Packages without a source (the project and its path crates), git
 * sources, packages with no readable name or version, and a malformed file return nothing. The parser never
 * evaluates contents or runs Cargo.
 */

export { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH };

export interface CargoLockPackage {
  crate: string;
  /** The resolved version, exactly as written. */
  value: string;
  /** The 1-based line of the `version` key. */
  line: number;
}

/** Parse registry packages from a Cargo.lock without file, network, or process I/O. */
export function parseCargoLock(contents: string): CargoLockPackage[] {
  const lines = readTomlLines(contents);
  if (!lines) return [];

  const packages: CargoLockPackage[] = [];
  let current: { name?: string; version?: string; versionLine?: number; source?: string } | undefined;
  const finish = (): void => {
    if (current?.name && current.version !== undefined && current.versionLine !== undefined && current.source && /^(?:registry|sparse)\+/.test(current.source)) {
      packages.push({ crate: current.name, value: current.version, line: current.versionLine });
    }
    current = undefined;
  };

  for (const entry of lines) {
    if (entry.header !== undefined) {
      finish();
      if (entry.arrayTable && entry.header === "package") current = {};
      continue;
    }
    if (!current || entry.key === undefined) continue;
    const value = stringValue(entry.value);
    if (value === undefined) continue;
    if (entry.key === "name") current.name = value;
    else if (entry.key === "version") {
      current.version = value;
      current.versionLine = entry.line;
    } else if (entry.key === "source") current.source = value;
  }
  finish();
  return packages;
}

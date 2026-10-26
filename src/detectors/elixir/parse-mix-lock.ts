import { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH } from "./parse-elixir-runtime.js";

/**
 * Pure, bounded parser for Hex packages resolved in `mix.lock`.
 *
 * Each entry of the form `"name": {:hex, :name, "version", …}` yields the package name and version with
 * the 1-based line of that entry. Git, path, and other non-Hex sources return nothing. A truncated or
 * malformed Hex entry returns nothing for that line rather than a partial result. The parser never
 * evaluates contents or runs Mix.
 */

export { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH };

export interface MixLockPackageDeclaration {
  kind: "locked-package";
  /** The Hex package name from the lock key. */
  name: string;
  /** The resolved version after trim. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

/** `"name": {:hex, :atom, "1.2.3", …` — the version string is the third tuple element. */
const HEX_ENTRY = /^\s*"([a-z][a-z0-9_]*)":\s*\{:hex,\s*:([a-z][a-z0-9_]*),\s*"([^"#{]*)"/;

/**
 * Parse resolved Hex packages from a `mix.lock` file. Unsupported and malformed lines are skipped;
 * an oversized file yields nothing.
 */
export function parseMixLock(contents: string): MixLockPackageDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: MixLockPackageDeclaration[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const match = HEX_ENTRY.exec(rawLine);
    if (!match) continue;
    const name = match[1]!;
    const atom = match[2]!;
    const value = match[3]!.trim();
    if (name !== atom || value === "") continue;
    declarations.push({ kind: "locked-package", name, value, line: index + 1 });
  }
  return declarations;
}

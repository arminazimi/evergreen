import type { DependencyDeclaration } from "./jdk-version.js";

/**
 * Pure, bounded parser for `gradle/libs.versions.toml` (Gradle version catalogs).
 *
 * Reads only the `[versions]` and `[libraries]` sections. Each library entry must be
 * an inline table on a single line with literal `group`, `name`, and either a literal
 * `version` or a `version.ref` that resolves to a literal in `[versions]`. Everything
 * else (multi-line tables, arrays, plugins, bundles, property-interpolated versions) is
 * skipped. The file is never evaluated; only literal string values are extracted.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;
export const MAXIMUM_DECLARATIONS = 5000;

/** Parse a Gradle version catalog without file, network, or process I/O. */
export function parseCatalog(contents: string): DependencyDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const rawLines = contents.split(/\r?\n/);
    // Map alias (normalized to lower-case) → version string
    const versions = new Map<string, string>();
    const found: DependencyDeclaration[] = [];

    // First pass: collect all [versions] entries so refs can be resolved when
    // [libraries] appears after [versions] (the standard order).
    let section = "";
    for (const rawLine of rawLines) {
      const line = rawLine.length > MAXIMUM_LINE_LENGTH ? "" : rawLine;
      const sectionMatch = /^\s*\[([^\]]+)\]\s*$/.exec(line);
      if (sectionMatch) {
        section = sectionMatch[1]!.trim().toLowerCase();
        continue;
      }
      if (section === "versions") {
        const versionMatch = /^\s*([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"\s*$/.exec(line);
        if (versionMatch) {
          versions.set(versionMatch[1]!.toLowerCase(), versionMatch[2]!);
        }
      }
    }

    // Second pass: collect [libraries] entries with resolved versions.
    section = "";
    let lineNumber = 0;
    for (const rawLine of rawLines) {
      lineNumber++;
      const line = rawLine.length > MAXIMUM_LINE_LENGTH ? "" : rawLine;

      const sectionMatch = /^\s*\[([^\]]+)\]\s*$/.exec(line);
      if (sectionMatch) {
        section = sectionMatch[1]!.trim().toLowerCase();
        continue;
      }

      if (section !== "libraries") continue;

      // Skip blank lines and comments
      if (/^\s*(?:#.*)?$/.test(line)) continue;

      // Inline table with a literal version:
      //   alias = { group = "...", name = "...", version = "..." }
      const libInlineMatch =
        /^\s*[A-Za-z0-9_-]+\s*=\s*\{[^}]*\bgroup\s*=\s*"([^"]+)"[^}]*\bname\s*=\s*"([^"]+)"[^}]*\bversion\s*=\s*"([^"]+)"[^}]*\}/.exec(
          line,
        );
      if (libInlineMatch) {
        const [, group, name, version] = libInlineMatch as unknown as [string, string, string, string];
        if (found.length < MAXIMUM_DECLARATIONS) {
          found.push({ kind: "dependency", group, artifact: name, version, line: lineNumber });
        }
        continue;
      }

      // Inline table with a version.ref:
      //   alias = { group = "...", name = "...", version.ref = "..." }
      const libRefMatch =
        /^\s*[A-Za-z0-9_-]+\s*=\s*\{[^}]*\bgroup\s*=\s*"([^"]+)"[^}]*\bname\s*=\s*"([^"]+)"[^}]*\bversion\.ref\s*=\s*"([^"]+)"[^}]*\}/.exec(
          line,
        );
      if (libRefMatch) {
        const [, group, name, ref] = libRefMatch as unknown as [string, string, string, string];
        const version = versions.get(ref.toLowerCase());
        if (version !== undefined && found.length < MAXIMUM_DECLARATIONS) {
          found.push({ kind: "dependency", group, artifact: name, version, line: lineNumber });
        }
        continue;
      }
    }

    return found.sort((left, right) => left.line - right.line);
  } catch {
    return [];
  }
}

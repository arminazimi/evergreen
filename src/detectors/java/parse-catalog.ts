import type { DependencyDeclaration } from "./jdk-version.js";
import { required } from "../../required.js";

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

function libraryDeclaration(
  match: RegExpExecArray,
  line: number,
  versionFor: (third: string) => string | undefined,
): DependencyDeclaration | undefined {
  const group = match[1];
  const name = match[2];
  const third = match[3];
  if (group === undefined || name === undefined || third === undefined) return undefined;
  const version = versionFor(third);
  if (version === undefined) return undefined;
  return { kind: "dependency", group, artifact: name, version, line };
}

function tryPushLibrary(
  found: DependencyDeclaration[],
  match: RegExpExecArray | null,
  line: number,
  versionFor: (third: string) => string | undefined,
): boolean {
  if (!match) return false;
  const declaration = libraryDeclaration(match, line, versionFor);
  if (declaration && found.length < MAXIMUM_DECLARATIONS) found.push(declaration);
  return true;
}

/** Parse a Gradle version catalog without file, network, or process I/O. */
/** First pass: every [versions] entry, so refs resolve even when [libraries] comes first. */
function collectVersions(rawLines: readonly string[]): Map<string, string> {
  // Map alias (normalized to lower-case) → version string
  const versions = new Map<string, string>();
  let section = "";
  for (const rawLine of rawLines) {
    const line = rawLine.length > MAXIMUM_LINE_LENGTH ? "" : rawLine;
    const sectionMatch = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (sectionMatch) {
      section = required(sectionMatch[1], "section name").trim().toLowerCase();
      continue;
    }
    if (section === "versions") {
      const versionMatch = /^\s*([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"\s*$/.exec(line);
      if (versionMatch) {
        versions.set(required(versionMatch[1], "version alias").toLowerCase(), required(versionMatch[2], "version"));
      }
    }
  }
  return versions;
}

/** Second pass: the [libraries] entries with their versions resolved. */
function collectLibraries(rawLines: readonly string[], versions: ReadonlyMap<string, string>): DependencyDeclaration[] {
  const found: DependencyDeclaration[] = [];
  let section = "";
  let lineNumber = 0;
  for (const rawLine of rawLines) {
    lineNumber++;
    const line = rawLine.length > MAXIMUM_LINE_LENGTH ? "" : rawLine;

    const sectionMatch = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (sectionMatch) {
      section = required(sectionMatch[1], "section name").trim().toLowerCase();
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
    if (tryPushLibrary(found, libInlineMatch, lineNumber, (version) => version)) continue;

    // Inline table with a version.ref:
    //   alias = { group = "...", name = "...", version.ref = "..." }
    const libRefMatch =
      /^\s*[A-Za-z0-9_-]+\s*=\s*\{[^}]*\bgroup\s*=\s*"([^"]+)"[^}]*\bname\s*=\s*"([^"]+)"[^}]*\bversion\.ref\s*=\s*"([^"]+)"[^}]*\}/.exec(
        line,
      );
    tryPushLibrary(found, libRefMatch, lineNumber, (ref) => versions.get(ref.toLowerCase()));
  }
  return found;
}

export function parseCatalog(contents: string): DependencyDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const rawLines = contents.split(/\r?\n/);
    const found = collectLibraries(rawLines, collectVersions(rawLines));
    return found.sort((left, right) => left.line - right.line);
  } catch {
    return [];
  }
}

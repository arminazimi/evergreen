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

const SECTION = /^\s*\[([^\]]+)\]\s*$/;
const VERSION_ENTRY = /^\s*([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"\s*$/;
const BLANK_OR_COMMENT = /^\s*(?:#.*)?$/;
// alias = { group = "...", name = "...", version = "..." }
const INLINE_VERSION =
  /^\s*[A-Za-z0-9_-]+\s*=\s*\{[^}]*\bgroup\s*=\s*"([^"]+)"[^}]*\bname\s*=\s*"([^"]+)"[^}]*\bversion\s*=\s*"([^"]+)"[^}]*\}/;
// alias = { group = "...", name = "...", version.ref = "..." }
const VERSION_REF =
  /^\s*[A-Za-z0-9_-]+\s*=\s*\{[^}]*\bgroup\s*=\s*"([^"]+)"[^}]*\bname\s*=\s*"([^"]+)"[^}]*\bversion\.ref\s*=\s*"([^"]+)"[^}]*\}/;

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

/** The library an entry line declares with a resolvable version, or undefined. */
function libraryOf(line: string, lineNumber: number, versions: Map<string, string>): DependencyDeclaration | undefined {
  const inline = INLINE_VERSION.exec(line);
  if (inline) return libraryDeclaration(inline, lineNumber, (version) => version);
  const ref = VERSION_REF.exec(line);
  if (ref) return libraryDeclaration(ref, lineNumber, (alias) => versions.get(alias.toLowerCase()));
  return undefined;
}

/** A line over the length limit is read as blank, so it can declare nothing. */
const lineText = (rawLine: string): string => (rawLine.length > MAXIMUM_LINE_LENGTH ? "" : rawLine);

/** The section name a header line opens, lower-cased, or undefined when the line is not a header. */
function sectionOf(line: string): string | undefined {
  const match = SECTION.exec(line);
  return match ? required(match[1], "section name").trim().toLowerCase() : undefined;
}

/** First pass: every literal `[versions]` entry, so `version.ref` can be resolved whatever the section order. */
function collectVersions(lines: string[]): Map<string, string> {
  const versions = new Map<string, string>();
  let section = "";
  for (const rawLine of lines) {
    const line = lineText(rawLine);
    const header = sectionOf(line);
    if (header !== undefined) {
      section = header;
      continue;
    }
    if (section !== "versions") continue;
    const versionMatch = VERSION_ENTRY.exec(line);
    if (versionMatch)
      versions.set(required(versionMatch[1], "version alias").toLowerCase(), required(versionMatch[2], "version"));
  }
  return versions;
}

/** Second pass: the `[libraries]` entries, with their versions resolved. */
function collectLibraries(lines: string[], versions: Map<string, string>): DependencyDeclaration[] {
  const found: DependencyDeclaration[] = [];
  let section = "";
  for (const [index, rawLine] of lines.entries()) {
    const line = lineText(rawLine);
    const header = sectionOf(line);
    if (header !== undefined) {
      section = header;
      continue;
    }
    if (section !== "libraries" || BLANK_OR_COMMENT.test(line)) continue;
    const declaration = libraryOf(line, index + 1, versions);
    if (declaration && found.length < MAXIMUM_DECLARATIONS) found.push(declaration);
  }
  return found;
}

/** Parse a Gradle version catalog without file, network, or process I/O. */
export function parseCatalog(contents: string): DependencyDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const lines = contents.split(/\r?\n/);
    return collectLibraries(lines, collectVersions(lines)).sort((left, right) => left.line - right.line);
  } catch {
    return [];
  }
}

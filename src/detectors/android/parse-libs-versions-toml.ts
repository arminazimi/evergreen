/**
 * Pure, bounded parser for Android-related pins in Gradle `libs.versions.toml`.
 *
 * Reads only literal `[versions]` entries:
 *
 * - `agp = "…"` → kind `agp`;
 * - `kotlin = "…"` → kind `kotlin`.
 *
 * Unsupported / skipped (returns nothing for that site, not an error):
 * - keys other than `agp` / `kotlin`;
 * - values outside `[versions]` (including `[plugins]` `version.ref` / inline `version`);
 * - template or interpolated values (`{{…}}`, `$`);
 * - lookalike text inside comments or other string values.
 *
 * An unterminated basic string makes the file unreadable: the parser returns `[]`.
 * Multi-line / literal TOML strings are not supported and yield `[]` for the file.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;
export const MAXIMUM_DECLARATIONS = 5000;

export type AndroidVersionCatalogKind = "agp" | "kotlin";

export interface AndroidVersionCatalogDeclaration {
  kind: AndroidVersionCatalogKind;
  value: string;
  line: number;
}

const VERSION_KEYS = new Set(["agp", "kotlin"]);

/** Validate basic strings are terminated; `#` comments outside strings are ignored for this check. */
function stringsTerminated(source: string): boolean {
  let index = 0;
  while (index < source.length) {
    const code = source.charCodeAt(index);
    if (code === 0x23) {
      // comment to end of line
      const end = source.indexOf("\n", index);
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    if (code === 0x27) return false; // literal strings unsupported
    if (source.startsWith('"""', index) || source.startsWith("'''", index)) return false;
    if (code === 0x22) {
      let position = index + 1;
      while (position < source.length) {
        const inner = source.charCodeAt(position);
        if (inner === 0x0a) return false;
        if (inner === 0x5c) {
          position += 2;
          continue;
        }
        if (inner === 0x22) {
          index = position + 1;
          break;
        }
        position++;
      }
      if (position >= source.length || source.charCodeAt(position) === 0x0a) return false;
      continue;
    }
    index++;
  }
  return true;
}

/** Strip a `#` comment that is not inside a basic string on this single line. */
function stripComment(line: string): string | undefined {
  let index = 0;
  while (index < line.length) {
    const code = line.charCodeAt(index);
    if (code === 0x23) return line.slice(0, index);
    if (code === 0x22) {
      let position = index + 1;
      while (position < line.length) {
        const inner = line.charCodeAt(position);
        if (inner === 0x5c) {
          position += 2;
          continue;
        }
        if (inner === 0x22) {
          index = position + 1;
          break;
        }
        position++;
      }
      if (position >= line.length) return undefined;
      continue;
    }
    index++;
  }
  return line;
}

const SECTION = /^\s*\[([^\]]+)\]\s*$/;
const ASSIGNMENT = /^\s*(agp|kotlin)\s*=\s*"([^"$]*)"\s*$/;

/** Parse `libs.versions.toml` without file, network, or process I/O. */
export function parseAndroidLibsVersionsToml(contents: string): AndroidVersionCatalogDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES || contents.includes("\0")) return [];
  if (!stringsTerminated(contents)) return [];

  const found: AndroidVersionCatalogDeclaration[] = [];
  let section = "";
  const lines = contents.split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const raw = lines[lineIndex]!;
    if (raw.length > MAXIMUM_LINE_LENGTH) continue;
    const stripped = stripComment(raw.replace(/\r$/, ""));
    if (stripped === undefined) return [];
    const line = stripped.trim();
    if (!line) continue;

    const header = SECTION.exec(line);
    if (header) {
      section = header[1]!.trim();
      continue;
    }
    if (section !== "versions") continue;

    const match = ASSIGNMENT.exec(line);
    if (!match) continue;
    const key = match[1]!;
    const value = match[2]!;
    if (!VERSION_KEYS.has(key) || !value || value.includes("{{")) continue;
    if (found.length >= MAXIMUM_DECLARATIONS) break;
    found.push({ kind: key as AndroidVersionCatalogKind, value, line: lineIndex + 1 });
  }

  return found.sort((left, right) => left.line - right.line || left.kind.localeCompare(right.kind));
}

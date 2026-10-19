/**
 * Pure, bounded parser for Android-related pins in Gradle `libs.versions.toml`.
 *
 * Reads only literal `[versions]` entries:
 *
 * - `agp = "…"` / `agp = '…'` → kind `agp`;
 * - `kotlin = "…"` / `kotlin = '…'` → kind `kotlin`.
 *
 * Unsupported / skipped (returns nothing for that site, not an error):
 * - keys other than `agp` / `kotlin`;
 * - values outside `[versions]` (including `[plugins]` `version.ref` / inline `version`);
 * - dynamic / ranged / named versions (`8.+`, `latest.release`, `[8.0,9.0)`);
 * - lookalike text inside comments or other string values.
 *
 * String rules for this scanner:
 * - one-line basic (`"…"`) and literal (`'…'`) strings are supported;
 * - unterminated strings make the file unreadable (`[]`);
 * - multi-line strings (`"""` / `'''`) are unsupported and yield `[]` for the file.
 *
 * Array-of-tables headers (`[[…]]`) end the `[versions]` section like any other table.
 */

import {
  MAXIMUM_DECLARATIONS,
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  isLiteralVersion,
} from "./gradle-scan.js";

export { MAXIMUM_DECLARATIONS, MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH };

export type AndroidVersionCatalogKind = "agp" | "kotlin";

export interface AndroidVersionCatalogDeclaration {
  kind: AndroidVersionCatalogKind;
  value: string;
  line: number;
}

/**
 * Walk the file once: reject multi-line strings and unterminated one-line strings.
 * One-line `'…'` / `"…"` are allowed (including inside `[libraries]`).
 */
function stringsReadable(source: string): boolean {
  let index = 0;
  while (index < source.length) {
    const code = source.charCodeAt(index);
    if (code === 0x23) {
      const end = source.indexOf("\n", index);
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith('"""', index) || source.startsWith("'''", index)) return false;
    if (code === 0x22 || code === 0x27) {
      const quote = code;
      let position = index + 1;
      while (position < source.length) {
        const inner = source.charCodeAt(position);
        if (inner === 0x0a) return false;
        // Basic strings allow escapes; literal strings do not (TOML).
        if (quote === 0x22 && inner === 0x5c) {
          position += 2;
          continue;
        }
        if (inner === quote) {
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

/** Strip a `#` comment that is not inside a one-line string on this line. */
function stripComment(line: string): string | undefined {
  let index = 0;
  while (index < line.length) {
    const code = line.charCodeAt(index);
    if (code === 0x23) return line.slice(0, index);
    if (code === 0x22 || code === 0x27) {
      const quote = code;
      let position = index + 1;
      while (position < line.length) {
        const inner = line.charCodeAt(position);
        if (quote === 0x22 && inner === 0x5c) {
          position += 2;
          continue;
        }
        if (inner === quote) {
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

/** `[versions]` / `[[bundles]]` — name without surrounding brackets. */
const SECTION = /^\s*\[\[?([^\]]+)\]\]?\s*$/;
const ASSIGNMENT = /^\s*(agp|kotlin)\s*=\s*(?:"([^"]*)"|'([^']*)')\s*$/;

/** Parse `libs.versions.toml` without file, network, or process I/O. */
export function parseAndroidLibsVersionsToml(contents: string): AndroidVersionCatalogDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES || contents.includes("\0")) return [];
  if (!stringsReadable(contents)) return [];

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
    const key = match[1] as AndroidVersionCatalogKind;
    const value = match[2] ?? match[3]!;
    if (!value || value.includes("$") || !isLiteralVersion(value)) continue;
    if (found.length >= MAXIMUM_DECLARATIONS) break;
    found.push({ kind: key, value, line: lineIndex + 1 });
  }

  return found.sort((left, right) => left.line - right.line || left.kind.localeCompare(right.kind));
}

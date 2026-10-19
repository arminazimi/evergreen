/**
 * Pure, bounded parser for Android Gradle Plugin pins in `settings.gradle` / `settings.gradle.kts`.
 *
 * Reads only literal `id(...) version "..."` (and Groovy `id '...' version '...'`) forms for:
 *
 * - `com.android.application` / `com.android.library` → kind `agp`;
 * - `org.jetbrains.kotlin.android` → kind `kotlin-android`.
 *
 * Unsupported / skipped (returns nothing for that site, not an error):
 * - variable or unquoted versions (`version agpVersion`);
 * - string interpolation (`$`) in the version;
 * - other plugin ids;
 * - lookalike text inside comments;
 * - Kotlin string templates that confuse the comment/string scanner: the whole file yields `[]`.
 *
 * An unterminated comment or string makes the file unreadable: the parser returns `[]`.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;
export const MAXIMUM_DECLARATIONS = 5000;

export type AndroidSettingsPluginKind = "agp" | "kotlin-android";

export interface AndroidSettingsPluginDeclaration {
  kind: AndroidSettingsPluginKind;
  value: string;
  line: number;
}

const blankNonNewlines = (text: string): string => text.replace(/[^\n]/g, " ");

/** Blank comments only; string literals stay so plugin ids and versions remain readable. */
function maskComments(source: string): string | undefined {
  const chunks: string[] = [];
  let index = 0;

  while (index < source.length) {
    if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index);
      const stop = end < 0 ? source.length : end;
      chunks.push(blankNonNewlines(source.slice(index, stop)));
      index = stop;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) return undefined;
      chunks.push(blankNonNewlines(source.slice(index, end + 2)));
      index = end + 2;
      continue;
    }
    if (source.startsWith('"""', index) || source.startsWith("'''", index)) {
      const quote = source.slice(index, index + 3);
      const end = source.indexOf(quote, index + 3);
      if (end < 0) return undefined;
      chunks.push(source.slice(index, end + 3));
      index = end + 3;
      continue;
    }

    const quoteCode = source.charCodeAt(index);
    if (quoteCode === 0x22 || quoteCode === 0x27) {
      let position = index + 1;
      while (position < source.length) {
        const code = source.charCodeAt(position);
        if (code === 0x0a) break;
        if (code === 0x5c) {
          position += 2;
          continue;
        }
        if (code === quoteCode) {
          chunks.push(source.slice(index, position + 1));
          index = position + 1;
          break;
        }
        position++;
      }
      if (position >= source.length || source.charCodeAt(position) === 0x0a) return undefined;
      continue;
    }

    const plainStart = index;
    while (index < source.length) {
      const code = source.charCodeAt(index);
      if (code === 0x2f) {
        const next = source.charCodeAt(index + 1);
        if (next === 0x2f || next === 0x2a) break;
      } else if (code === 0x22 || code === 0x27) {
        break;
      }
      index++;
    }
    if (index > plainStart) chunks.push(source.slice(plainStart, index));
  }

  return chunks.join("");
}

const PLUGIN =
  /\bid\s*(?:\(\s*)?(["'])(com\.android\.(?:application|library)|org\.jetbrains\.kotlin\.android)\1\s*\)?\s*version\s*(?:\(\s*)?(["'])([^"'$]+)\3\s*\)?/g;

function kindFor(id: string): AndroidSettingsPluginKind {
  return id === "org.jetbrains.kotlin.android" ? "kotlin-android" : "agp";
}

/** Parse a settings.gradle(.kts) without file, network, or process I/O. */
export function parseAndroidSettingsGradle(contents: string): AndroidSettingsPluginDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES || contents.includes("\0")) return [];

  const maskedRaw = maskComments(contents);
  if (maskedRaw === undefined) return [];

  const code = maskedRaw
    .split("\n")
    .map((line) => (line.length > MAXIMUM_LINE_LENGTH ? " ".repeat(line.length) : line))
    .join("\n");

  const lineStarts = [0];
  for (let index = code.indexOf("\n"); index >= 0; index = code.indexOf("\n", index + 1)) lineStarts.push(index + 1);
  const lineAt = (offset: number): number => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStarts[mid]! <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };

  const found: AndroidSettingsPluginDeclaration[] = [];
  for (const match of code.matchAll(PLUGIN)) {
    if (found.length >= MAXIMUM_DECLARATIONS) break;
    const id = match[2]!;
    const value = match[4]!.trim();
    if (!value) continue;
    found.push({ kind: kindFor(id), value, line: lineAt(match.index!) });
  }

  return found.sort((left, right) => left.line - right.line || left.kind.localeCompare(right.kind));
}

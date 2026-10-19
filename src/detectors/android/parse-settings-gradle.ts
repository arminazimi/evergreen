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
 * - dynamic / ranged versions (`8.+`, `latest.release`, `[8.0,9.0)`);
 * - string interpolation (`$`) in the version;
 * - other plugin ids;
 * - `kotlin("android") version "…"` shorthand;
 * - `id("…").version("…")` chained form;
 * - plugin versions from `pluginManagement` resolution strategies;
 * - lookalike text inside string literals or comments;
 * - Kotlin string templates that confuse the quote scanner: the whole file yields `[]`.
 *
 * An unterminated comment or string makes the file unreadable: the parser returns `[]`.
 */

import {
  MAXIMUM_DECLARATIONS,
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  blankOverlongLines,
  isLiteralVersion,
  lineIndex,
  maskGradleSource,
} from "./gradle-scan.js";

export { MAXIMUM_DECLARATIONS, MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH };

export type AndroidSettingsPluginKind = "agp" | "kotlin-android";

export interface AndroidSettingsPluginDeclaration {
  kind: AndroidSettingsPluginKind;
  value: string;
  line: number;
}

const PLUGIN_IDS = new Map<string, AndroidSettingsPluginKind>([
  ["com.android.application", "agp"],
  ["com.android.library", "agp"],
  ["org.jetbrains.kotlin.android", "kotlin-android"],
]);

/** Bound inter-token whitespace so incomplete `id` forms cannot scan the rest of a huge file. */
const MAXIMUM_INTER_TOKEN_WHITESPACE = 256;

function isWs(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0d || code === 0x0a;
}

/** Skip whitespace up to a fixed budget; undefined when the gap is too large. */
function skipWhitespace(source: string, offset: number): number | undefined {
  let index = offset;
  const start = offset;
  while (index < source.length && isWs(source.charCodeAt(index))) {
    if (index - start >= MAXIMUM_INTER_TOKEN_WHITESPACE) return undefined;
    index++;
  }
  return index;
}

/** Read a single-line quoted string from `offset` (must point at the opening quote). */
function readQuoted(source: string, offset: number): { value: string; end: number } | undefined {
  const quote = source.charCodeAt(offset);
  if (quote !== 0x22 && quote !== 0x27) return undefined;
  let position = offset + 1;
  let value = "";
  while (position < source.length) {
    const code = source.charCodeAt(position);
    if (code === 0x0a) return undefined;
    if (code === 0x5c) {
      if (position + 1 >= source.length) return undefined;
      value += source[position + 1]!;
      position += 2;
      continue;
    }
    if (code === quote) return { value, end: position + 1 };
    value += source[position]!;
    position++;
  }
  return undefined;
}

/**
 * After an `id` keyword in the original source, read optional `(`, plugin id, optional `)`,
 * `version`, optional `(`, and a literal version string.
 */
function readPluginPin(
  source: string,
  afterId: number,
): { kind: AndroidSettingsPluginKind; value: string } | undefined {
  let index = skipWhitespace(source, afterId);
  if (index === undefined) return undefined;

  if (source.charCodeAt(index) === 0x28) {
    index = skipWhitespace(source, index + 1);
    if (index === undefined) return undefined;
  }

  const idLiteral = readQuoted(source, index);
  if (!idLiteral) return undefined;
  const kind = PLUGIN_IDS.get(idLiteral.value);
  if (!kind) return undefined;
  index = idLiteral.end;

  index = skipWhitespace(source, index);
  if (index === undefined) return undefined;
  if (source.charCodeAt(index) === 0x29) {
    index = skipWhitespace(source, index + 1);
    if (index === undefined) return undefined;
  }

  if (!source.startsWith("version", index)) return undefined;
  const afterVersion = index + "version".length;
  // Reject `versionX` / chained `.version` was already rejected by needing `version` after `)`.
  const boundary = source.charCodeAt(afterVersion);
  if (afterVersion < source.length && ((boundary >= 0x41 && boundary <= 0x5a) || (boundary >= 0x61 && boundary <= 0x7a) || boundary === 0x5f || (boundary >= 0x30 && boundary <= 0x39))) {
    return undefined;
  }

  index = skipWhitespace(source, afterVersion);
  if (index === undefined) return undefined;
  if (source.charCodeAt(index) === 0x28) {
    index = skipWhitespace(source, index + 1);
    if (index === undefined) return undefined;
  }

  const versionLiteral = readQuoted(source, index);
  if (!versionLiteral || versionLiteral.value.includes("$") || !isLiteralVersion(versionLiteral.value)) return undefined;
  return { kind, value: versionLiteral.value };
}

const ID_KEYWORD = /\bid\b/g;

/** Parse a settings.gradle(.kts) without file, network, or process I/O. */
export function parseAndroidSettingsGradle(contents: string): AndroidSettingsPluginDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES || contents.includes("\0")) return [];

  const maskedRaw = maskGradleSource(contents);
  if (maskedRaw === undefined) return [];

  const masked = blankOverlongLines(maskedRaw);
  const { lineAt, lineLengthAt } = lineIndex(masked);

  const found: AndroidSettingsPluginDeclaration[] = [];
  for (const match of masked.matchAll(ID_KEYWORD)) {
    if (found.length >= MAXIMUM_DECLARATIONS) break;
    const absolute = match.index!;
    if (lineLengthAt(absolute) > MAXIMUM_LINE_LENGTH) continue;
    const pin = readPluginPin(contents, absolute + match[0].length);
    if (!pin) continue;
    found.push({ kind: pin.kind, value: pin.value, line: lineAt(absolute) });
  }

  return found.sort((left, right) => left.line - right.line || left.kind.localeCompare(right.kind));
}

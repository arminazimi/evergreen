/**
 * Pure, bounded parser for Android SDK settings in `build.gradle` and `build.gradle.kts`.
 *
 * Reads only literal assignments inside an `android { ... }` block (including nested
 * `defaultConfig`):
 *
 * - `compileSdk`, `minSdk`, `targetSdk` as a bare or quoted integer (`34`, `"34"`, `= 34`);
 * - `buildToolsVersion` as a quoted version string (`"34.0.0"`, `= "34.0.0"`).
 *
 * Unsupported / skipped (returns nothing for that site, not an error):
 * - values outside an `android` block;
 * - property references, version-catalog calls, string interpolation (`$`);
 * - method-call forms such as `compileSdk(34)` or `minSdk(21)`;
 * - legacy Groovy names `compileSdkVersion` / `minSdkVersion` / `targetSdkVersion`
 *   (only the four names above are in scope for this parser);
 * - receiver / ext properties such as `ext.minSdk` or `foo.compileSdk`;
 * - lookalike text inside string literals or comments;
 * - Groovy/Kotlin forms that are not a single literal on one line;
 * - Kotlin string templates that confuse the quote scanner (unterminated or nested
 *   `$"..."` forms the scanner cannot pair): the whole file yields `[]`.
 *
 * An unterminated comment or string makes the file unreadable: the parser returns `[]`.
 */

import {
  MAXIMUM_DECLARATIONS,
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  blankOverlongLines,
  lineIndex,
  maskGradleSource,
} from "./gradle-scan.js";
import { required } from "../../required.js";

export { MAXIMUM_DECLARATIONS, MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH };

export type AndroidSdkKind = "compileSdk" | "minSdk" | "targetSdk" | "buildToolsVersion";

export interface AndroidSdkDeclaration {
  kind: AndroidSdkKind;
  value: string;
  line: number;
}

/** Half-open `[start, end)` spans of each `android { ... }` block (outer braces included). */
function androidBlocks(masked: string): Array<[number, number]> {
  const blocks: Array<[number, number]> = [];
  const opener = /\bandroid\b\s*\{/g;
  for (const match of masked.matchAll(opener)) {
    const openBrace = required(match.index, "block offset") + match[0].length - 1;
    let depth = 1;
    let index = openBrace + 1;
    for (; index < masked.length && depth > 0; index++) {
      const character = masked[index];
      if (character === "{") depth++;
      else if (character === "}" && --depth === 0) {
        blocks.push([openBrace, index + 1]);
        break;
      }
    }
  }
  return blocks;
}

// Keyword only — do not consume trailing whitespace here. On the masked view, blanked
// string literals are spaces; swallowing them would skip past the real RHS in the original.
const KEYWORD = /(?<!\.)\b(compileSdk|minSdk|targetSdk|buildToolsVersion)\b/g;

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0d;
}

/** True when `offset` starts `//` or `/*`. */
function atComment(source: string, offset: number): boolean {
  return source.startsWith("//", offset) || source.startsWith("/*", offset);
}

function skipSpaces(source: string, from: number): number {
  let index = from;
  while (index < source.length && isSpace(source.charCodeAt(index))) index++;
  return index;
}

/** Offset of the literal after optional spaces and an optional `=`. */
function literalStart(source: string, offset: number): number {
  const index = skipSpaces(source, offset);
  if (index < source.length && source.charCodeAt(index) === 0x3d) return skipSpaces(source, index + 1);
  return index;
}

/** Read a quoted string starting at the opening quote; undefined on newline or dangling escape. */
function readQuoted(source: string, start: number): { value: string; end: number } | undefined {
  const quote = source.charAt(start);
  let position = start + 1;
  let value = "";
  while (position < source.length) {
    const code = source.charCodeAt(position);
    if (code === 0x0a) return undefined;
    if (code === 0x5c) {
      if (position + 1 >= source.length) return undefined;
      value += source.charAt(position + 1);
      position += 2;
      continue;
    }
    if (source[position] === quote) {
      position++;
      break;
    }
    value += source.charAt(position);
    position++;
  }
  return { value, end: position };
}

function readBareNumber(source: string, start: number): string | undefined {
  let position = start;
  while (position < source.length) {
    const code = source.charCodeAt(position);
    if (code < 0x30 || code > 0x39) break;
    position++;
  }
  const trail = skipSpaces(source, position);
  if (trail < source.length) {
    const next = source.charCodeAt(trail);
    if (next !== 0x0a && next !== 0x3b && next !== 0x7d && !atComment(source, trail)) return undefined;
  }
  return source.slice(start, position);
}

function isQuote(code: number): boolean {
  return code === 0x22 || code === 0x27;
}

function isTerminator(code: number): boolean {
  // 0x28 is the method-call form, e.g. compileSdk(34).
  return code === 0x28 || code === 0x0a || code === 0x3b || code === 0x7d;
}

/** buildToolsVersion: a closed quoted dotted version without interpolation. */
function readBuildToolsLiteral(source: string, index: number): string | undefined {
  if (!isQuote(source.charCodeAt(index))) return undefined;
  const quoted = readQuoted(source, index);
  if (quoted === undefined || source[quoted.end - 1] !== source.charAt(index)) return undefined;
  return !quoted.value.includes("$") && /^\d+(?:\.\d+)*$/.test(quoted.value) ? quoted.value : undefined;
}

/** Other SDK kinds: a quoted or bare integer. */
function readSdkNumberLiteral(source: string, index: number): string | undefined {
  const startCode = source.charCodeAt(index);
  if (isQuote(startCode)) {
    const quoted = readQuoted(source, index);
    if (quoted === undefined) return undefined;
    return !quoted.value.includes("$") && /^\d+$/.test(quoted.value) ? quoted.value : undefined;
  }
  if (startCode < 0x30 || startCode > 0x39) return undefined;
  return readBareNumber(source, index);
}

/**
 * Read a literal RHS from the original source after a keyword match.
 * Accepts an optional `=`. Stops at newline, `;`, `}`, or a comment start.
 * Method-call `(` forms yield undefined.
 */
function readLiteral(source: string, offset: number, kind: AndroidSdkKind): string | undefined {
  const index = literalStart(source, offset);
  if (index >= source.length || atComment(source, index) || isTerminator(source.charCodeAt(index))) return undefined;
  return kind === "buildToolsVersion" ? readBuildToolsLiteral(source, index) : readSdkNumberLiteral(source, index);
}

/** Parse an Android Gradle build script without file, network, or process I/O. */
export function parseAndroidBuildGradle(contents: string): AndroidSdkDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES || contents.includes("\0")) return [];

  const maskedRaw = maskGradleSource(contents);
  if (maskedRaw === undefined) return [];

  const masked = blankOverlongLines(maskedRaw);
  const { lineAt, lineLengthAt } = lineIndex(masked);

  const found: AndroidSdkDeclaration[] = [];
  const add = (declaration: AndroidSdkDeclaration) => {
    if (found.length < MAXIMUM_DECLARATIONS) found.push(declaration);
  };

  for (const [blockStart, blockEnd] of androidBlocks(masked)) {
    const block = masked.slice(blockStart, blockEnd);
    KEYWORD.lastIndex = 0;
    for (const match of block.matchAll(KEYWORD)) {
      const absolute = blockStart + required(match.index, "keyword offset");
      if (lineLengthAt(absolute) > MAXIMUM_LINE_LENGTH) continue;
      const kind = match[1] as AndroidSdkKind;
      const value = readLiteral(contents, absolute + match[0].length, kind);
      if (value === undefined) continue;
      add({ kind, value, line: lineAt(absolute) });
    }
  }

  return found.sort((left, right) => left.line - right.line || left.kind.localeCompare(right.kind));
}

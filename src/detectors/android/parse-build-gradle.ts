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
    const openBrace = match.index! + match[0].length - 1;
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

/**
 * Read a literal RHS from the original source after a keyword match.
 * Accepts an optional `=`. Stops at newline, `;`, `}`, or a comment start.
 * Method-call `(` forms yield undefined.
 */
function readLiteral(source: string, offset: number, kind: AndroidSdkKind): string | undefined {
  let index = offset;
  while (index < source.length && isSpace(source.charCodeAt(index))) index++;
  if (index < source.length && source.charCodeAt(index) === 0x3d) {
    index++;
    while (index < source.length && isSpace(source.charCodeAt(index))) index++;
  }
  if (index >= source.length || atComment(source, index)) return undefined;

  const startCode = source.charCodeAt(index);
  if (startCode === 0x28) return undefined; // method-call form, e.g. compileSdk(34)
  if (startCode === 0x0a || startCode === 0x3b || startCode === 0x7d) return undefined;

  if (kind === "buildToolsVersion") {
    if (startCode !== 0x22 && startCode !== 0x27) return undefined;
    const quote = source[index]!;
    let position = index + 1;
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
      if (source[position] === quote) {
        position++;
        break;
      }
      value += source[position]!;
      position++;
    }
    if (position > source.length || source[position - 1] !== quote) return undefined;
    if (value.includes("$") || !/^\d+(?:\.\d+)*$/.test(value)) return undefined;
    return value;
  }

  if (startCode === 0x22 || startCode === 0x27) {
    const quote = source[index]!;
    let position = index + 1;
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
      if (source[position] === quote) {
        position++;
        break;
      }
      value += source[position]!;
      position++;
    }
    if (value.includes("$") || !/^\d+$/.test(value)) return undefined;
    return value;
  }

  if (startCode < 0x30 || startCode > 0x39) return undefined;
  let position = index;
  while (position < source.length) {
    const code = source.charCodeAt(position);
    if (code < 0x30 || code > 0x39) break;
    position++;
  }
  const value = source.slice(index, position);
  let trail = position;
  while (trail < source.length && isSpace(source.charCodeAt(trail))) trail++;
  if (trail < source.length) {
    const next = source.charCodeAt(trail);
    if (next !== 0x0a && next !== 0x3b && next !== 0x7d && !atComment(source, trail)) return undefined;
  }
  return value;
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
      const absolute = blockStart + match.index!;
      if (lineLengthAt(absolute) > MAXIMUM_LINE_LENGTH) continue;
      const kind = match[1] as AndroidSdkKind;
      const value = readLiteral(contents, absolute + match[0].length, kind);
      if (value === undefined) continue;
      add({ kind, value, line: lineAt(absolute) });
    }
  }

  return found.sort((left, right) => left.line - right.line || left.kind.localeCompare(right.kind));
}

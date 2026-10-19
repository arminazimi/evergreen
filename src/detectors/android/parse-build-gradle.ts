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

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;
export const MAXIMUM_DECLARATIONS = 5000;

export type AndroidSdkKind = "compileSdk" | "minSdk" | "targetSdk" | "buildToolsVersion";

export interface AndroidSdkDeclaration {
  kind: AndroidSdkKind;
  value: string;
  line: number;
}

const blankNonNewlines = (text: string): string => text.replace(/[^\n]/g, " ");

/**
 * One linear scan: comments and string literal text (including quotes) become spaces;
 * newlines and offsets stay unchanged. Returns undefined when a comment or string is unterminated.
 */
function mask(source: string): string | undefined {
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
      chunks.push(blankNonNewlines(source.slice(index, end + 3)));
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
          chunks.push(blankNonNewlines(source.slice(index, position + 1)));
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

  const maskedRaw = mask(contents);
  if (maskedRaw === undefined) return [];

  // Overlong lines are not read (blanked in the masked view; values on those lines are skipped).
  const masked = maskedRaw
    .split("\n")
    .map((line) => (line.length > MAXIMUM_LINE_LENGTH ? " ".repeat(line.length) : line))
    .join("\n");

  const lineStarts = [0];
  for (let index = masked.indexOf("\n"); index >= 0; index = masked.indexOf("\n", index + 1)) lineStarts.push(index + 1);
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
  const lineLengthAt = (offset: number): number => {
    const line = lineAt(offset) - 1;
    const start = lineStarts[line]!;
    const end = line + 1 < lineStarts.length ? lineStarts[line + 1]! - 1 : masked.length;
    return end - start;
  };

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

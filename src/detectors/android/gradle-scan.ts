/**
 * Shared, linear Gradle source scanning for Android detectors.
 *
 * Masks comments and string literals to spaces (newlines and offsets unchanged) so
 * keyword searches cannot see lookalikes inside strings or comments.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;
export const MAXIMUM_DECLARATIONS = 5000;

/** Gradle/catalog version literal: digits first, optional dotted segments, optional pre-release/build suffix. No `+`, ranges, or named dynamics. */
export const LITERAL_VERSION = /^\d+(?:\.\d+)*(?:[-.][0-9A-Za-z.]+)?$/;

export function isLiteralVersion(value: string): boolean {
  return LITERAL_VERSION.test(value);
}

export function blankNonNewlines(text: string): string {
  return text.replace(/[^\n]/g, " ");
}

/**
 * One linear scan: comments and string literal text (including quotes) become spaces;
 * newlines and offsets stay unchanged. Returns undefined when a comment or string is unterminated.
 */
export function maskGradleSource(source: string): string | undefined {
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

/** Blank overlong lines in a masked view so they are not keyword-searched. */
export function blankOverlongLines(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > MAXIMUM_LINE_LENGTH ? " ".repeat(line.length) : line))
    .join("\n");
}

export interface LineIndex {
  lineAt(offset: number): number;
  lineLengthAt(offset: number): number;
}

/** 1-based line lookup over a text whose newlines match the original source. */
export function lineIndex(text: string): LineIndex {
  const lineStarts = [0];
  for (let index = text.indexOf("\n"); index >= 0; index = text.indexOf("\n", index + 1)) lineStarts.push(index + 1);

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
    const end = line + 1 < lineStarts.length ? lineStarts[line + 1]! - 1 : text.length;
    return end - start;
  };

  return { lineAt, lineLengthAt };
}

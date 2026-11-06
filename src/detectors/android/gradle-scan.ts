/**
 * Shared, linear Gradle source scanning for Android detectors.
 *
 * Masks comments and string literals to spaces (newlines and offsets unchanged) so
 * keyword searches cannot see lookalikes inside strings or comments.
 */

import { required } from "../../required.js";

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

interface MaskedSpan {
  chunk: string;
  next: number;
}

function startsMaskedSpan(source: string, index: number): boolean {
  if (source.startsWith("//", index) || source.startsWith("/*", index)) return true;
  const code = source.charCodeAt(index);
  return code === 0x22 || code === 0x27;
}

function maskDelimited(source: string, index: number, close: string, openLength: number): MaskedSpan | undefined {
  const end = source.indexOf(close, index + openLength);
  if (end < 0) return undefined;
  return { chunk: blankNonNewlines(source.slice(index, end + close.length)), next: end + close.length };
}

function maskQuoted(source: string, index: number): MaskedSpan | undefined {
  const quoteCode = source.charCodeAt(index);
  let position = index + 1;
  while (position < source.length) {
    const code = source.charCodeAt(position);
    if (code === 0x0a) return undefined;
    if (code === 0x5c) {
      position += 2;
      continue;
    }
    if (code === quoteCode) return { chunk: blankNonNewlines(source.slice(index, position + 1)), next: position + 1 };
    position++;
  }
  return undefined;
}

/** Mask the comment or string that starts at `index`; undefined when it is unterminated. */
function maskSpan(source: string, index: number): MaskedSpan | undefined {
  if (source.startsWith("//", index)) {
    const end = source.indexOf("\n", index);
    const stop = end < 0 ? source.length : end;
    return { chunk: blankNonNewlines(source.slice(index, stop)), next: stop };
  }
  if (source.startsWith("/*", index)) return maskDelimited(source, index, "*/", 2);
  if (source.startsWith('"""', index) || source.startsWith("'''", index)) {
    return maskDelimited(source, index, source.slice(index, index + 3), 3);
  }
  return maskQuoted(source, index);
}

/** End of the plain run that starts at `index`: up to the next comment or quote. */
function plainEnd(source: string, from: number): number {
  let index = from;
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
  return index;
}

/**
 * One linear scan: comments and string literal text (including quotes) become spaces;
 * newlines and offsets stay unchanged. Returns undefined when a comment or string is unterminated.
 */
export function maskGradleSource(source: string): string | undefined {
  const chunks: string[] = [];
  let index = 0;

  while (index < source.length) {
    if (startsMaskedSpan(source, index)) {
      const span = maskSpan(source, index);
      if (span === undefined) return undefined;
      chunks.push(span.chunk);
      index = span.next;
      continue;
    }
    const end = plainEnd(source, index);
    chunks.push(source.slice(index, end));
    index = end;
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
      const pivot = required(lineStarts[mid], "line start");
      if (pivot <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };

  const lineLengthAt = (offset: number): number => {
    const line = lineAt(offset) - 1;
    const start = required(lineStarts[line], "line start");
    const next = lineStarts[line + 1];
    const end = next === undefined ? text.length : next - 1;
    return end - start;
  };

  return { lineAt, lineLengthAt };
}

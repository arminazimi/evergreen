import { parseImageReference } from "./parse-image.js";
import { required } from "../../required.js";

/**
 * Pure, bounded parser for the `image` field in `devcontainer.json` files.
 *
 * Dev container files are JSONC (JSON with comments and trailing commas).
 * Only the top-level `"image"` key is read. The parser strips `//` and `/* ... *\/`
 * comments and trailing commas while preserving line structure so that line
 * numbers remain accurate, then delegates to JSON.parse. It never evaluates
 * contents, executes tools, or makes network calls.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;

export interface DevcontainerImageDeclaration {
  kind: "image";
  value: string;
  line: number;
}

export type DevcontainerDeclaration = DevcontainerImageDeclaration;

/** End index (exclusive) of the string literal that opens at `start`; escapes are consumed verbatim. */
function stringEnd(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length) {
    const ch = text.charAt(i);
    i++;
    if (ch === "\\" && i < text.length) i++;
    else if (ch === '"') break;
  }
  return i;
}

/** End index (exclusive) of the `//` comment starting at `start`: up to, not including, the newline. */
function lineCommentEnd(text: string, start: number): number {
  let i = start + 2;
  while (i < text.length && text[i] !== "\n") i++;
  return i;
}

/** End index (exclusive) of the block comment opening at `start`; unterminated runs to the end. */
function blockCommentEnd(text: string, start: number): number {
  const close = text.indexOf("*/", start + 2);
  return close === -1 ? text.length : close + 2;
}

/** Replace a comment with spaces, keeping newlines so line numbers stay accurate. */
function blank(segment: string): string {
  return segment.replace(/[^\n]/g, " ");
}

/** Strip `//` single-line and `/* ... *\/` block comments, preserving newlines. */
function stripJsoncComments(text: string): string {
  let result = "";
  let i = 0;

  while (i < text.length) {
    const ch = text.charAt(i);
    const next = text[i + 1];
    let end = i + 1;
    let replacement: string | undefined;
    if (ch === '"') {
      end = stringEnd(text, i);
    } else if (ch === "/" && next === "/") {
      end = lineCommentEnd(text, i);
      replacement = blank(text.slice(i, end));
    } else if (ch === "/" && next === "*") {
      end = blockCommentEnd(text, i);
      replacement = blank(text.slice(i, end));
    }
    result += replacement ?? text.slice(i, end);
    i = end;
  }

  return result;
}

/**
 * Strip trailing commas before `}` or `]`, replacing them with spaces to preserve line numbers.
 * String-aware: commas inside string literals are preserved.
 */
function stripTrailingCommas(text: string): string {
  const chars = text.split("");
  let inString = false;

  for (let i = 0; i < chars.length; i++) {
    const ch = required(chars[i], "character");

    if (inString) {
      if (ch === "\\" && i + 1 < chars.length) {
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === ",") {
      let nextIndex = i + 1;
      while (nextIndex < chars.length && /\s/.test(required(chars[nextIndex], "character"))) {
        nextIndex++;
      }
      if (nextIndex < chars.length && (chars[nextIndex] === "}" || chars[nextIndex] === "]")) {
        chars[i] = " ";
      }
    }
  }

  return chars.join("");
}

/** Return the 1-based line number of the first occurrence of `needle` in `text`. */
function lineOf(text: string, needle: string): number {
  const index = text.indexOf(needle);
  if (index === -1) return 1;
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

/** Parse the `image` declaration from a devcontainer.json file without any I/O. */
export function parseDevcontainer(contents: string): DevcontainerDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const stripped = stripTrailingCommas(stripJsoncComments(contents));
    const parsed: unknown = JSON.parse(stripped);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];

    const image = (parsed as Record<string, unknown>)["image"];
    if (typeof image !== "string" || image.trim() === "") return [];

    const value = image.trim();
    if (!parseImageReference(value)) return [];

    // Find the line of the "image" key in the stripped text.
    const line = lineOf(stripped, `"image"`);
    return [{ kind: "image", value, line }];
  } catch {
    return [];
  }
}

import { parseImageReference } from "./parse-image.js";

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

/** Strip `//` single-line and `/* ... *\/` block comments, preserving newlines. */
function stripJsoncComments(text: string): string {
  let result = "";
  let i = 0;
  let inString = false;

  while (i < text.length) {
    const ch = text[i]!;

    if (inString) {
      result += ch;
      if (ch === "\\" && i + 1 < text.length) {
        // Escaped character — consume it verbatim so `\"` doesn't end the string.
        i++;
        result += text[i]!;
      } else if (ch === "\"") {
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === "\"") {
      inString = true;
      result += ch;
      i++;
      continue;
    }

    // Single-line comment: replace non-newline characters with spaces.
    if (ch === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") {
        result += " ";
        i++;
      }
      continue;
    }

    // Block comment: replace with spaces (keep newlines to preserve line numbers).
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length) {
        if (text[i] === "*" && text[i + 1] === "/") {
          i += 2;
          break;
        }
        result += text[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }

    result += ch;
    i++;
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
    const ch = chars[i]!;

    if (inString) {
      if (ch === "\\" && i + 1 < chars.length) {
        i++;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === ",") {
      let nextIndex = i + 1;
      while (nextIndex < chars.length && /\s/.test(chars[nextIndex]!)) {
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

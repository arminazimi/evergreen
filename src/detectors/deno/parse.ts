import { member, readJsonLines } from "../json-lines.js";
import { readTomlLines, stringValue, stripComment as stripTomlComment } from "../rust/toml-lines.js";

/**
 * Parsers for Deno and Bun declarations in `deno.json`, `deno.jsonc`, `bunfig.toml`, and `.bun-version`.
 *
 * File contents are untrusted input, so these parsers:
 *   - are pure: contents in, declarations out, with no file, network, clock, or process access;
 *   - never evaluate what they read and never execute tools;
 *   - are bounded: input above `MAXIMUM_INPUT_BYTES` or a line above `MAXIMUM_LINE_LENGTH` yields nothing;
 *   - return nothing, not an error, for forms they do not support (ranges, variables, "latest", unknown syntax).
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface DenoDeclaration {
  kind: "deno-runtime" | "bun-runtime";
  /** The declared version, normalized to a plain version string. */
  value: string;
  /** The 1-based line of the declaration, so findings point at the exact place. */
  line: number;
}

/**
 * Returns the normalized version string if `text` is an exact version pin,
 * or `undefined` if `text` is a range, wildcard, variable, "latest", or invalid version.
 */
export function exactVersionPin(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  if (/[\^~><=\*\$]/.test(trimmed) || /\blatest\b/i.test(trimmed)) return undefined;
  const cleaned = trimmed.replace(/^(?:bun-v?|deno-v?|v)/i, "");
  if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(cleaned)) {
    return cleaned;
  }
  return undefined;
}

function stripLineComment(line: string): string {
  const hashIndex = line.indexOf("#");
  return hashIndex >= 0 ? line.slice(0, hashIndex) : line;
}

/** Parse Bun runtime version from `.bun-version`. */
export function parseBunVersion(contents: string): DenoDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const lines = contents.split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    if (raw.length > MAXIMUM_LINE_LENGTH) continue;
    const text = stripLineComment(raw).trim();
    if (text === "") continue;
    const value = exactVersionPin(text);
    if (value) {
      return [{ kind: "bun-runtime", value, line: index + 1 }];
    }
    // If the first non-empty line is not an exact pin, stop.
    break;
  }
  return [];
}

/** Parse Bun runtime version from `bunfig.toml`. */
export function parseBunfig(contents: string): DenoDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const lines = readTomlLines(contents);
  if (!lines) return [];

  const declarations: DenoDeclaration[] = [];
  for (const entry of lines) {
    if (
      entry.table === "" ||
      entry.table === "runtime" ||
      entry.table === "bun" ||
      entry.table === "install"
    ) {
      if (
        entry.key === "version" ||
        entry.key === "bun" ||
        entry.key === "bunVersion" ||
        entry.key === "runtime"
      ) {
        const val = stringValue(entry.value);
        if (val) {
          const exact = exactVersionPin(val);
          if (exact) {
            declarations.push({ kind: "bun-runtime", value: exact, line: entry.line });
          }
        }
      }
    }
  }
  return declarations;
}

/** Parse Deno and Bun runtime versions from `deno.json` or `deno.jsonc`. */
export function parseDenoJson(contents: string): DenoDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const root = readJsonLines(contents, { comments: true });
  if (!root || root.kind !== "object") return [];

  const declarations: DenoDeclaration[] = [];

  const checkMember = (
    parent: typeof root,
    key: string,
    kind: "deno-runtime" | "bun-runtime",
  ) => {
    const mem = member(parent, key);
    if (mem && mem.value.kind === "string") {
      const exact = exactVersionPin(mem.value.value);
      if (exact) {
        declarations.push({ kind, value: exact, line: mem.value.line });
      }
    }
  };

  // 1. Direct "deno" or "bun" keys
  checkMember(root, "deno", "deno-runtime");
  checkMember(root, "bun", "bun-runtime");

  // 2. "runtime" field
  const runtimeMem = member(root, "runtime");
  if (runtimeMem) {
    if (runtimeMem.value.kind === "string") {
      const exact = exactVersionPin(runtimeMem.value.value);
      if (exact) {
        declarations.push({ kind: "deno-runtime", value: exact, line: runtimeMem.value.line });
      }
    } else if (runtimeMem.value.kind === "object") {
      checkMember(runtimeMem.value, "deno", "deno-runtime");
      checkMember(runtimeMem.value, "bun", "bun-runtime");
    }
  }

  // 3. "engines" field
  const enginesMem = member(root, "engines");
  if (enginesMem && enginesMem.value.kind === "object") {
    checkMember(enginesMem.value, "deno", "deno-runtime");
    checkMember(enginesMem.value, "bun", "bun-runtime");
  }

  return declarations;
}

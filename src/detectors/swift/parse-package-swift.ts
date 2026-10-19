/**
 * Pure, bounded parser for the declarations Evergreen reads from Package.swift.
 *
 * It returns `swift-tools-version` (only on line 1, optionally after a UTF-8 BOM) and direct
 * `.package` dependencies that pin a literal `from:` or `exact:` version string. Block comments
 * (slash-star through star-slash, including nested and multi-line forms) and line comments are
 * stripped before `.package` calls are read; `/*` inside a `//` line comment does not open a block
 * comment; `.package` text inside string literals (including multi-line `"""` strings) is ignored; a
 * tools-version directive inside a block comment does not count.
 * Every `.package(...)` call on a line is reported. Unsupported forms return nothing: platform
 * minimums (`.macOS(.v13)` and friends), `path:` / `branch:` / `revision:` packages, range and
 * `.upToNextMajor` requirements, dynamic values (`Version(...)`, string interpolation), multi-line
 * `.package` calls, tools-version text on line 2 or later or inside other comments or strings, and
 * malformed or unterminated lines. The parser never evaluates contents or runs SwiftPM.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface SwiftToolsVersionDeclaration {
  kind: "tools-version";
  /** The tools version as written, such as `5.9`. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

export interface SwiftPackageDependencyDeclaration {
  kind: "package";
  /** The package URL exactly as written. */
  url: string;
  /** How the version is constrained. */
  requirement: "from" | "exact";
  /** The literal version string, exactly as written. */
  value: string;
  /** The 1-based source line of the `.package` call. */
  line: number;
}

export type PackageSwiftDeclaration = SwiftToolsVersionDeclaration | SwiftPackageDependencyDeclaration;

const TOOLS_VERSION = /^\s*\/\/\s*swift-tools-version:\s*([0-9]+(?:\.[0-9]+)*)\s*$/;
const QUOTED = /"(?:[^"\\]|\\.)*"/;
const PACKAGE_CALL = /\.package\s*\(/;
const URL_FIELD = new RegExp(String.raw`\burl\s*:\s*(${QUOTED.source})`);
const FROM_FIELD = new RegExp(String.raw`\bfrom\s*:\s*(${QUOTED.source})`);
const EXACT_FIELD = new RegExp(String.raw`\bexact\s*:\s*(${QUOTED.source})`);
const DYNAMIC_BODY = /[`]|\\\(|Version\s*\(/;
const PATH_LIKE = /\b(?:path|branch|revision)\s*:/;
const RANGE_LIKE = /\.\.\<?|\.(?:upToNextMajor|upToNextMinor)\s*\(/;

/** Blank `from..to` to spaces, keeping CR/LF so line numbers and offsets stay stable. */
function blankPreservingNewlines(contents: string, from: number, to: number): string {
  const parts: string[] = [];
  let index = from;
  while (index < to) {
    const char = contents[index]!;
    if (char === "\n" || char === "\r") {
      parts.push(char);
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < to && contents[end] !== "\n" && contents[end] !== "\r") end += 1;
    parts.push(" ".repeat(end - index));
    index = end;
  }
  return parts.join("");
}

/**
 * Blank block comments (newlines kept) so line numbers stay stable. Single linear scan, in order:
 * `//` line comments (block openers inside them are ignored; text kept for later stripping),
 * nestable block comments, multi-line `"""` strings, and ordinary one-line strings (string state
 * resets at a newline). Result is built from chunks joined once.
 */
function stripBlockComments(contents: string): string {
  const chunks: string[] = [];
  let keepStart = 0;
  let index = 0;
  let depth = 0;
  type Mode = "code" | "lineComment" | "block" | "lineString" | "multiString";
  let mode: Mode = "code";

  const flushKeep = (until: number) => {
    if (until > keepStart) chunks.push(contents.slice(keepStart, until));
    keepStart = until;
  };

  while (index < contents.length) {
    const char = contents[index]!;
    const next = contents[index + 1];
    const next2 = contents[index + 2];

    if (mode === "lineComment") {
      if (char === "\n" || char === "\r") {
        mode = "code";
        index += 1;
        continue;
      }
      index += 1;
      continue;
    }

    if (mode === "block") {
      if (char === "/" && next === "*") {
        chunks.push(blankPreservingNewlines(contents, keepStart, index));
        chunks.push("  ");
        keepStart = index + 2;
        depth += 1;
        index += 2;
        continue;
      }
      if (char === "*" && next === "/") {
        chunks.push(blankPreservingNewlines(contents, keepStart, index));
        chunks.push("  ");
        keepStart = index + 2;
        depth -= 1;
        index += 2;
        if (depth === 0) mode = "code";
        continue;
      }
      index += 1;
      continue;
    }

    if (mode === "lineString") {
      if (char === "\\") {
        index += next !== undefined ? 2 : 1;
        continue;
      }
      if (char === '"') {
        mode = "code";
        index += 1;
        continue;
      }
      if (char === "\n" || char === "\r") {
        // One-line strings cannot span lines; reset so a later block comment is still stripped.
        mode = "code";
        index += 1;
        continue;
      }
      index += 1;
      continue;
    }

    if (mode === "multiString") {
      if (char === "\\") {
        index += next !== undefined ? 2 : 1;
        continue;
      }
      if (char === '"' && next === '"' && next2 === '"') {
        mode = "code";
        index += 3;
        continue;
      }
      index += 1;
      continue;
    }

    // mode === "code"
    if (char === "/" && next === "/") {
      mode = "lineComment";
      index += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      flushKeep(index);
      chunks.push("  ");
      keepStart = index + 2;
      mode = "block";
      depth = 1;
      index += 2;
      continue;
    }
    if (char === '"' && next === '"' && next2 === '"') {
      mode = "multiString";
      index += 3;
      continue;
    }
    if (char === '"') {
      mode = "lineString";
      index += 1;
      continue;
    }
    index += 1;
  }

  if (mode === "block") {
    chunks.push(blankPreservingNewlines(contents, keepStart, contents.length));
  } else {
    flushKeep(contents.length);
  }
  return chunks.join("");
}

/**
 * Blank string interiors and `//` line comments to spaces (offsets unchanged) so `.package` text
 * inside literals is not found. Understands `"""`, one-line strings (reset at newline), and `//`.
 */
function blankStringsAndLineComments(contents: string): string {
  const chunks: string[] = [];
  let keepStart = 0;
  let index = 0;
  type Mode = "code" | "lineComment" | "lineString" | "multiString";
  let mode: Mode = "code";

  const flushKeep = (until: number) => {
    if (until > keepStart) chunks.push(contents.slice(keepStart, until));
    keepStart = until;
  };

  while (index < contents.length) {
    const char = contents[index]!;
    const next = contents[index + 1];
    const next2 = contents[index + 2];

    if (mode === "lineComment") {
      if (char === "\n" || char === "\r") {
        chunks.push(blankPreservingNewlines(contents, keepStart, index));
        keepStart = index;
        mode = "code";
        index += 1;
        continue;
      }
      index += 1;
      continue;
    }

    if (mode === "lineString") {
      if (char === "\\") {
        index += next !== undefined ? 2 : 1;
        continue;
      }
      if (char === '"') {
        chunks.push(blankPreservingNewlines(contents, keepStart, index));
        keepStart = index;
        mode = "code";
        index += 1;
        continue;
      }
      if (char === "\n" || char === "\r") {
        chunks.push(blankPreservingNewlines(contents, keepStart, index));
        keepStart = index;
        mode = "code";
        index += 1;
        continue;
      }
      index += 1;
      continue;
    }

    if (mode === "multiString") {
      if (char === "\\") {
        index += next !== undefined ? 2 : 1;
        continue;
      }
      if (char === '"' && next === '"' && next2 === '"') {
        chunks.push(blankPreservingNewlines(contents, keepStart, index));
        keepStart = index;
        mode = "code";
        index += 3;
        continue;
      }
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      flushKeep(index);
      keepStart = index;
      mode = "lineComment";
      index += 2;
      continue;
    }
    if (char === '"' && next === '"' && next2 === '"') {
      flushKeep(index + 3);
      keepStart = index + 3;
      mode = "multiString";
      index += 3;
      continue;
    }
    if (char === '"') {
      flushKeep(index + 1);
      keepStart = index + 1;
      mode = "lineString";
      index += 1;
      continue;
    }
    index += 1;
  }

  if (mode === "lineComment" || mode === "lineString" || mode === "multiString") {
    chunks.push(blankPreservingNewlines(contents, keepStart, contents.length));
  } else {
    flushKeep(contents.length);
  }
  return chunks.join("");
}

/** Unquote a Swift string literal, or undefined when it is empty, interpolated, or not a plain string. */
function stringLiteral(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.length < 2 || raw[0] !== '"' || raw[raw.length - 1] !== '"') return undefined;
  const body = raw.slice(1, -1);
  if (body === "" || body.includes("\\(") || body.includes("${")) return undefined;
  let value = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (char === "\\") {
      const next = body[index + 1];
      if (next === undefined) return undefined;
      value += next;
      index += 1;
      continue;
    }
    value += char;
  }
  return value === "" ? undefined : value;
}

/** Parse one `.package(...)` argument list, or undefined when incomplete or unsupported. */
function packageFromCall(code: string, open: number, line: number): { declaration?: SwiftPackageDependencyDeclaration; end: number } | undefined {
  let depth = 0;
  let end = -1;
  for (let index = open; index < code.length; index += 1) {
    const char = code[index]!;
    if (char === '"') {
      index += 1;
      while (index < code.length) {
        if (code[index] === "\\") {
          index += 2;
          continue;
        }
        if (code[index] === '"') break;
        index += 1;
      }
      if (index >= code.length) return undefined;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  if (end < 0) return undefined;

  const body = code.slice(open + 1, end);
  if (DYNAMIC_BODY.test(body) || PATH_LIKE.test(body) || RANGE_LIKE.test(body)) return { end };

  const urlMatch = body.match(URL_FIELD);
  const fromMatch = body.match(FROM_FIELD);
  const exactMatch = body.match(EXACT_FIELD);
  if (!urlMatch || (fromMatch && exactMatch) || (!fromMatch && !exactMatch)) return { end };

  const url = stringLiteral(urlMatch[1]);
  const requirement = fromMatch ? "from" : "exact";
  const value = stringLiteral(fromMatch?.[1] ?? exactMatch?.[1]);
  if (!url || !value) return { end };
  return { declaration: { kind: "package", url, requirement, value, line }, end };
}

/**
 * Read every one-line `.package(...)` call on the line. `masked` has string interiors and line
 * comments blanked (same offsets as `code`) so matches inside literals are skipped; values are
 * read from `code`.
 */
function packagesOnLine(code: string, masked: string, line: number): SwiftPackageDependencyDeclaration[] {
  const declarations: SwiftPackageDependencyDeclaration[] = [];
  let searchFrom = 0;
  while (searchFrom < masked.length) {
    const relative = masked.slice(searchFrom).search(PACKAGE_CALL);
    if (relative < 0) break;
    const start = searchFrom + relative;
    const open = masked.indexOf("(", start);
    if (open < 0) break;
    const parsed = packageFromCall(code, open, line);
    if (!parsed) break;
    if (parsed.declaration) declarations.push(parsed.declaration);
    searchFrom = parsed.end + 1;
  }
  return declarations;
}

/** Parse supported Package.swift declarations without file, network, or process I/O. */
export function parsePackageSwift(contents: string): PackageSwiftDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const withoutBom = contents.startsWith("\uFEFF") ? contents.slice(1) : contents;
  const withoutBlocks = stripBlockComments(withoutBom);
  const masked = blankStringsAndLineComments(withoutBlocks);
  const declarations: PackageSwiftDeclaration[] = [];
  const codeLines = withoutBlocks.split(/\r?\n/);
  const maskLines = masked.split(/\r?\n/);

  for (const [index, rawLine] of codeLines.entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const line = index + 1;
    const maskLine = maskLines[index] ?? "";

    if (line === 1) {
      const tools = TOOLS_VERSION.exec(rawLine);
      if (tools?.[1]) declarations.push({ kind: "tools-version", value: tools[1], line: 1 });
    }

    if (!PACKAGE_CALL.test(maskLine)) continue;
    declarations.push(...packagesOnLine(rawLine, maskLine, line));
  }
  return declarations;
}

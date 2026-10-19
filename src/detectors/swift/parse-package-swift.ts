/**
 * Pure, bounded parser for the declarations Evergreen reads from Package.swift.
 *
 * It returns `swift-tools-version` (only on line 1, optionally after a UTF-8 BOM) and direct
 * `.package` dependencies that pin a literal `from:` or `exact:` version string. Block comments
 * (slash-star through star-slash, including nested and multi-line forms) and line comments are
 * stripped before `.package` calls are read; a tools-version directive inside a block comment does
 * not count.
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

/**
 * Replace block comments with spaces (newlines kept) so line numbers stay stable. Tracks nest depth
 * across the whole file; `/*` inside a string literal does not open a comment.
 */
function stripBlockComments(contents: string): string {
  let result = "";
  let depth = 0;
  let inString = false;
  for (let index = 0; index < contents.length; index += 1) {
    const char = contents[index]!;
    const next = contents[index + 1];

    if (depth > 0) {
      if (char === "/" && next === "*") {
        depth += 1;
        result += "  ";
        index += 1;
        continue;
      }
      if (char === "*" && next === "/") {
        depth -= 1;
        result += "  ";
        index += 1;
        continue;
      }
      result += char === "\n" || char === "\r" ? char : " ";
      continue;
    }

    if (inString) {
      result += char;
      if (char === "\\") {
        if (next !== undefined) {
          result += next;
          index += 1;
        }
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === "/" && next === "*") {
      depth = 1;
      result += "  ";
      index += 1;
      continue;
    }

    result += char;
  }
  return result;
}

/** Drop a trailing `//` comment that is outside string literals. */
function stripLineComment(line: string): string {
  let inString = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (inString) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "/" && line[index + 1] === "/") return line.slice(0, index);
  }
  return line;
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

/** Read every one-line `.package(...)` call on the line. */
function packagesOnLine(code: string, line: number): SwiftPackageDependencyDeclaration[] {
  const declarations: SwiftPackageDependencyDeclaration[] = [];
  let searchFrom = 0;
  while (searchFrom < code.length) {
    const relative = code.slice(searchFrom).search(PACKAGE_CALL);
    if (relative < 0) break;
    const start = searchFrom + relative;
    const open = code.indexOf("(", start);
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
  const declarations: PackageSwiftDeclaration[] = [];

  for (const [index, rawLine] of withoutBlocks.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const line = index + 1;

    if (line === 1) {
      const tools = TOOLS_VERSION.exec(rawLine);
      if (tools?.[1]) declarations.push({ kind: "tools-version", value: tools[1], line: 1 });
    }

    const code = stripLineComment(rawLine).trim();
    if (code === "" || !PACKAGE_CALL.test(code)) continue;
    declarations.push(...packagesOnLine(code, line));
  }
  return declarations;
}

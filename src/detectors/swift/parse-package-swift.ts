/**
 * Pure, bounded parser for the declarations Evergreen reads from Package.swift.
 *
 * It returns `swift-tools-version` and direct `.package` dependencies that pin a literal `from:` or
 * `exact:` version string. Unsupported forms return nothing: platform minimums (`.macOS(.v13)` and
 * friends), `path:` / `branch:` / `revision:` packages, range and `.upToNextMajor` requirements,
 * dynamic values (`Version(...)`, string interpolation), multi-line `.package` calls, tools-version
 * text inside other comments or strings, and malformed or unterminated lines. The parser never
 * evaluates contents or runs SwiftPM.
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

/** Drop a trailing `//` comment that is outside string literals. */
function codeWithoutComment(line: string): string {
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

/** Read a `.package(...)` call that fits on one line, or undefined when the call is incomplete or unsupported. */
function packageOnLine(code: string, line: number): SwiftPackageDependencyDeclaration | undefined {
  const start = code.search(PACKAGE_CALL);
  if (start < 0) return undefined;
  const open = code.indexOf("(", start);
  if (open < 0) return undefined;
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
  if (/[`]|\\\(|Version\s*\(/.test(body)) return undefined;
  if (/\b(?:path|branch|revision)\s*:/.test(body)) return undefined;
  // Range and wrapper requirements are not a plain `from:` / `exact:` pin.
  if (/\.\.\<?|\.(?:upToNextMajor|upToNextMinor)\s*\(/.test(body)) return undefined;

  const urlMatch = body.match(new RegExp(`\\burl\\s*:\\s*(${QUOTED.source})`));
  const fromMatch = body.match(new RegExp(`\\bfrom\\s*:\\s*(${QUOTED.source})`));
  const exactMatch = body.match(new RegExp(`\\bexact\\s*:\\s*(${QUOTED.source})`));
  if (!urlMatch || (fromMatch && exactMatch) || (!fromMatch && !exactMatch)) return undefined;

  const url = stringLiteral(urlMatch[1]);
  const requirement = fromMatch ? "from" : "exact";
  const value = stringLiteral(fromMatch?.[1] ?? exactMatch?.[1]);
  if (!url || !value) return undefined;
  return { kind: "package", url, requirement, value, line };
}

/** Parse supported Package.swift declarations without file, network, or process I/O. */
export function parsePackageSwift(contents: string): PackageSwiftDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: PackageSwiftDeclaration[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const line = index + 1;

    const tools = TOOLS_VERSION.exec(rawLine);
    if (tools?.[1]) {
      declarations.push({ kind: "tools-version", value: tools[1], line });
      continue;
    }

    const code = codeWithoutComment(rawLine).trim();
    if (code === "" || !PACKAGE_CALL.test(code)) continue;
    const parsed = packageOnLine(code, line);
    if (parsed) declarations.push(parsed);
  }
  return declarations;
}

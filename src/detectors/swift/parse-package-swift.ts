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
    const char = contents.charAt(index);
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

type StripMode = "code" | "lineComment" | "block" | "lineString" | "multiString";

/** The cursor and output of one `stripBlockComments` scan. `keepStart` marks text not yet copied to `chunks`. */
interface StripState {
  contents: string;
  index: number;
  keepStart: number;
  depth: number;
  mode: StripMode;
  chunks: string[];
}

/**
 * Blank block comments (newlines kept) so line numbers stay stable. Single linear scan, in order:
 * `//` line comments (block openers inside them are ignored; text kept for later stripping),
 * nestable block comments, multi-line `"""` strings, and ordinary one-line strings (string state
 * resets at a newline). Result is built from chunks joined once.
 */
export function stripBlockComments(contents: string): string {
  const state: StripState = { contents, index: 0, keepStart: 0, depth: 0, mode: "code", chunks: [] };
  while (state.index < contents.length) STRIP_STEPS[state.mode](state);
  if (state.mode === "block") state.chunks.push(blankPreservingNewlines(contents, state.keepStart, contents.length));
  else flushKeep(state, contents.length);
  return state.chunks.join("");
}

const STRIP_STEPS: Record<StripMode, (state: StripState) => void> = {
  code: stripCode,
  lineComment: stripLineComment,
  block: stripBlock,
  lineString: stripLineString,
  multiString: stripMultiString,
};

/** Copy the raw text up to `until` and start a new pending run there. */
function flushKeep(state: StripState, until: number): void {
  if (until > state.keepStart) state.chunks.push(state.contents.slice(state.keepStart, until));
  state.keepStart = until;
}

function stripCode(state: StripState): void {
  const { contents, index } = state;
  const char = contents.charAt(index);
  const next = contents[index + 1];
  const next2 = contents[index + 2];
  if (char === "/" && next === "/") {
    state.mode = "lineComment";
    state.index += 2;
  } else if (char === "/" && next === "*") {
    flushKeep(state, index);
    state.chunks.push("  ");
    state.keepStart = index + 2;
    state.mode = "block";
    state.depth = 1;
    state.index += 2;
  } else if (char === '"' && next === '"' && next2 === '"') {
    state.mode = "multiString";
    state.index += 3;
  } else if (char === '"') {
    state.mode = "lineString";
    state.index += 1;
  } else {
    state.index += 1;
  }
}

function stripLineComment(state: StripState): void {
  const char = state.contents.charAt(state.index);
  if (char === "\n" || char === "\r") state.mode = "code";
  state.index += 1;
}

function stripBlock(state: StripState): void {
  const { contents, index } = state;
  const char = contents.charAt(index);
  const next = contents[index + 1];
  if (char === "/" && next === "*") {
    state.chunks.push(blankPreservingNewlines(contents, state.keepStart, index), "  ");
    state.keepStart = index + 2;
    state.depth += 1;
    state.index += 2;
  } else if (char === "*" && next === "/") {
    state.chunks.push(blankPreservingNewlines(contents, state.keepStart, index), "  ");
    state.keepStart = index + 2;
    state.depth -= 1;
    state.index += 2;
    if (state.depth === 0) state.mode = "code";
  } else {
    state.index += 1;
  }
}

function stripLineString(state: StripState): void {
  const { contents, index } = state;
  const char = contents.charAt(index);
  if (char === "\\") {
    state.index += contents[index + 1] !== undefined ? 2 : 1;
    return;
  }
  // One-line strings cannot span lines; a newline resets so a later block comment is still stripped.
  if (char === '"' || char === "\n" || char === "\r") state.mode = "code";
  state.index += 1;
}

function stripMultiString(state: StripState): void {
  const { contents, index } = state;
  const char = contents.charAt(index);
  if (char === "\\") {
    state.index += contents[index + 1] !== undefined ? 2 : 1;
  } else if (char === '"' && contents[index + 1] === '"' && contents[index + 2] === '"') {
    state.mode = "code";
    state.index += 3;
  } else {
    state.index += 1;
  }
}

type MaskMode = "code" | "lineComment" | "lineString" | "multiString";

/** The cursor and output of one `blankStringsAndLineComments` scan; `keepStart` marks text not yet copied to `chunks`. */
interface MaskState {
  contents: string;
  index: number;
  keepStart: number;
  mode: MaskMode;
  chunks: string[];
}

/**
 * Blank string interiors and `//` line comments to spaces (offsets unchanged) so `.package` text
 * inside literals is not found. Understands `"""`, one-line strings (reset at newline), and `//`.
 */
export function blankStringsAndLineComments(contents: string): string {
  const state: MaskState = { contents, index: 0, keepStart: 0, mode: "code", chunks: [] };
  while (state.index < contents.length) MASK_STEPS[state.mode](state);
  if (state.mode === "code") flushMaskKeep(state, contents.length);
  else state.chunks.push(blankPreservingNewlines(contents, state.keepStart, contents.length));
  return state.chunks.join("");
}

const MASK_STEPS: Record<MaskMode, (state: MaskState) => void> = {
  code: maskCode,
  lineComment: maskLineComment,
  lineString: maskLineString,
  multiString: maskMultiString,
};

/** Copy the raw text up to `until` and start a new pending run there. */
function flushMaskKeep(state: MaskState, until: number): void {
  if (until > state.keepStart) state.chunks.push(state.contents.slice(state.keepStart, until));
  state.keepStart = until;
}

/** Blank the pending run up to `until` (newlines kept), then start a new run there. */
function blankPending(state: MaskState, until: number): void {
  state.chunks.push(blankPreservingNewlines(state.contents, state.keepStart, until));
  state.keepStart = until;
}

function maskCode(state: MaskState): void {
  const { contents, index } = state;
  const char = contents.charAt(index);
  const next = contents[index + 1];
  const next2 = contents[index + 2];
  if (char === "/" && next === "/") {
    flushMaskKeep(state, index);
    state.mode = "lineComment";
    state.index += 2;
  } else if (char === '"' && next === '"' && next2 === '"') {
    flushMaskKeep(state, index + 3);
    state.mode = "multiString";
    state.index += 3;
  } else if (char === '"') {
    flushMaskKeep(state, index + 1);
    state.mode = "lineString";
    state.index += 1;
  } else {
    state.index += 1;
  }
}

function maskLineComment(state: MaskState): void {
  const char = state.contents.charAt(state.index);
  if (char === "\n" || char === "\r") {
    blankPending(state, state.index);
    state.mode = "code";
  }
  state.index += 1;
}

function maskLineString(state: MaskState): void {
  const { contents, index } = state;
  const char = contents.charAt(index);
  if (char === "\\") {
    state.index += contents[index + 1] !== undefined ? 2 : 1;
    return;
  }
  if (char === '"' || char === "\n" || char === "\r") {
    blankPending(state, index);
    state.mode = "code";
  }
  state.index += 1;
}

function maskMultiString(state: MaskState): void {
  const { contents, index } = state;
  const char = contents.charAt(index);
  if (char === "\\") {
    state.index += contents[index + 1] !== undefined ? 2 : 1;
  } else if (char === '"' && contents[index + 1] === '"' && contents[index + 2] === '"') {
    blankPending(state, index);
    state.mode = "code";
    state.index += 3;
  } else {
    state.index += 1;
  }
}

/** Unquote a Swift string literal, or undefined when it is empty, interpolated, or not a plain string. */
function stringLiteral(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.length < 2 || raw[0] !== '"' || raw[raw.length - 1] !== '"') return undefined;
  const body = raw.slice(1, -1);
  if (body === "" || body.includes("\\(") || body.includes("${")) return undefined;
  let value = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body.charAt(index);
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

/** The index of the quote that closes the string opened at `open`, or -1 when it is never closed. */
function closingQuote(code: string, open: number): number {
  let index = open + 1;
  while (index < code.length) {
    if (code[index] === "\\") {
      index += 2;
      continue;
    }
    if (code[index] === '"') return index;
    index += 1;
  }
  return -1;
}

/** The index of the `)` that closes the call opened at `open`, or -1 when the call or one of its strings is never closed. */
function closingParenthesis(code: string, open: number): number {
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    const char = code.charAt(index);
    if (char === '"') {
      index = closingQuote(code, index);
      if (index < 0) return -1;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Parse one `.package(...)` argument list, or undefined when incomplete or unsupported. */
export function packageFromCall(
  code: string,
  open: number,
  line: number,
): { declaration?: SwiftPackageDependencyDeclaration; end: number } | undefined {
  const end = closingParenthesis(code, open);
  if (end < 0) return undefined;
  const body = code.slice(open + 1, end);
  if (DYNAMIC_BODY.test(body) || PATH_LIKE.test(body) || RANGE_LIKE.test(body)) return { end };
  const declaration = packageDeclaration(body, line);
  return declaration ? { declaration, end } : { end };
}

/** The `url:` and exactly one of `from:` or `exact:` literal of a call body, or undefined. */
function packageDeclaration(body: string, line: number): SwiftPackageDependencyDeclaration | undefined {
  const urlMatch = body.match(URL_FIELD);
  const fromMatch = body.match(FROM_FIELD);
  const exactMatch = body.match(EXACT_FIELD);
  if (!urlMatch || Boolean(fromMatch) === Boolean(exactMatch)) return undefined;
  const url = stringLiteral(urlMatch[1]);
  const value = stringLiteral(fromMatch?.[1] ?? exactMatch?.[1]);
  if (!url || !value) return undefined;
  return { kind: "package", url, requirement: fromMatch ? "from" : "exact", value, line };
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

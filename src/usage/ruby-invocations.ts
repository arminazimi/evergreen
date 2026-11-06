/** Scans Ruby `require`, `load`, `gem`, and `autoload` calls. Split out of source-usage.ts so usage/ modules do not import it. */

interface RubyLiteral {
  value: string;
  end: number;
  column: number;
  interpolated: boolean;
}

const RUBY_PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", "<": ">" };

/** The closing delimiter for a percent-literal opener, or undefined when the character cannot delimit one. */
function rubyCloser(delimiter: string): string | undefined {
  return RUBY_PAIRS[delimiter] ?? (/[^A-Za-z0-9_\s]/.test(delimiter) ? delimiter : undefined);
}

/** A quoted string starting at `start`, which holds the opening quote. */
function readQuotedRubyLiteral(line: string, start: number, quoted: string): RubyLiteral | undefined {
  let value = "";
  let escaped = false;
  for (let index = start + 1; index < line.length; index += 1) {
    const character = line.charAt(index);
    if (escaped) {
      value += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quoted === '"' && character === "#" && line[index + 1] === "{") {
      return { value, end: line.length, column: start + 2, interpolated: true };
    }
    if (character === quoted) return { value, end: index + 1, column: start + 2, interpolated: false };
    value += character;
  }
  return undefined;
}

/** The body of a percent literal whose opening delimiter is at `cursor`. */
function scanRubyPercentBody(
  line: string,
  cursor: number,
  delimiter: string,
  closer: string,
  interpolating: boolean,
): RubyLiteral | undefined {
  const paired = closer !== delimiter;
  let depth = 1;
  let value = "";
  for (let index = cursor + 1; index < line.length; index += 1) {
    const character = line.charAt(index);
    if (character === "\\" && index + 1 < line.length) {
      value += line[index + 1];
      index += 1;
      continue;
    }
    if (interpolating && character === "#" && line[index + 1] === "{") {
      return { value, end: line.length, column: cursor + 2, interpolated: true };
    }
    if (paired && character === delimiter) {
      depth += 1;
      value += character;
      continue;
    }
    if (character === closer) {
      depth -= 1;
      if (depth === 0) return { value, end: index + 1, column: cursor + 2, interpolated: false };
    }
    value += character;
  }
  return undefined;
}

/** A single-line string literal starting at `start`, or undefined when the text is not a quoted or percent string. */
function readRubyLiteral(line: string, start: number): RubyLiteral | undefined {
  const quoted = line[start];
  if (quoted === "'" || quoted === '"') return readQuotedRubyLiteral(line, start, quoted);
  if (quoted !== "%") return undefined;
  let cursor = start + 1;
  const marker = line[cursor];
  let type = "";
  if (marker && /[qQwWrsxiI]/.test(marker)) {
    type = marker;
    cursor += 1;
  }
  const delimiter = line[cursor];
  if (!delimiter) return undefined;
  const closer = rubyCloser(delimiter);
  if (!closer || !["", "q", "Q", "s"].includes(type)) return undefined;
  return scanRubyPercentBody(line, cursor, delimiter, closer, type === "" || type === "Q");
}

const RUBY_KINDS = ["require", "load", "gem", "autoload", "require_relative"] as const;

function isRubyKind(value: string): value is RubyInvocation["kind"] {
  return (RUBY_KINDS as readonly string[]).includes(value);
}

export interface RubyInvocation {
  kind: "require" | "load" | "gem" | "autoload" | "require_relative";
  line: number;
  keywordColumn: number;
  reference: string;
  argument: { kind: "literal"; value: string; column: number } | { kind: "dynamic" };
}

export const RUBY_MAX_LINE = 4096;
const RUBY_MAX_INVOCATIONS = 10_000;
const RUBY_MAX_REFERENCE = 200;
const RUBY_DEF_LOOKBEHIND = 32;

const RUBY_NOT_ARGUMENT_START = new Set([".", ",", "}", ")", ";"]);

/** True when `next`, the first character after the keyword and blanks, can begin an argument. */
function rubyArgumentStarts(line: string, cursor: number, next: string | undefined): boolean {
  if (next === undefined || RUBY_NOT_ARGUMENT_START.has(next)) return false;
  // Assignment (`gem = …`), but not `==`.
  if (next === "=" && line[cursor + 1] !== "=") return false;
  return /[A-Za-z_$@'"%/(]/.test(next);
}

/**
 * True when the keyword at `index` is a real call site, not a hash key, method receiver, or bare assignment.
 * Argument-start checks use the original `line` because string literals are blanked in `masked`.
 */
function rubyKeywordIsCall(line: string, masked: string, index: number, keywordLength: number): boolean {
  const before = index > 0 ? masked[index - 1] : "";
  if (before === ":" || before === "@" || before === "$") return false;
  const hadSpace = line[index + keywordLength] === " " || line[index + keywordLength] === "\t";
  const cursor = skipBlanks(line, index + keywordLength);
  const next = line[cursor];
  // Hash key `load:` has no space before `:`; `autoload :Foo` has whitespace then a symbol.
  if (next === ":") return hadSpace;
  return rubyArgumentStarts(line, cursor, next);
}

/** True when `def` appears immediately before the match within a short look-behind window. */
function rubyKeywordIsMethodDefinition(masked: string, index: number): boolean {
  const start = Math.max(0, index - RUBY_DEF_LOOKBEHIND);
  const window = masked.slice(start, index);
  return /(?:^|\s)def\s+(?:self\s*\.\s*|(?:::)?Kernel\s*\.\s*)?$/.test(window);
}

interface RubyScanSkip {
  line: number;
  column: number;
  reference: string;
  reason: string;
}

interface RubyInvocationScan {
  invocations: RubyInvocation[];
  skips: RubyScanSkip[];
}

const RUBY_INVOCATION_HINT = /(?:^|[^\w.:])(?:(?:::)?Kernel\s*\.\s*)?(?:require_relative|require|load|gem|autoload)\b/;

function skipBlanks(line: string, from: number): number {
  let cursor = from;
  while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
  return cursor;
}

function longLineSkip(line: string, lineNumber: number): RubyScanSkip {
  return {
    line: lineNumber,
    column: 1,
    reference: line.slice(0, RUBY_MAX_REFERENCE).trim(),
    reason: `line longer than ${RUBY_MAX_LINE} characters`,
  };
}

/** The argument that follows a keyword ending at `from`: a plain string literal, or dynamic. */
function rubyArgument(line: string, kind: RubyInvocation["kind"], from: number): RubyInvocation["argument"] {
  let cursor = skipBlanks(line, from);
  if (line[cursor] === "(") cursor = skipBlanks(line, cursor + 1);
  if (kind === "autoload") {
    const symbol = /^:([A-Za-z_]\w*)/.exec(line.slice(cursor));
    if (!symbol) return { kind: "dynamic" };
    cursor = skipBlanks(line, cursor + symbol[0].length);
    if (line[cursor] !== ",") return { kind: "dynamic" };
    cursor = skipBlanks(line, cursor + 1);
  }
  const literal = readRubyLiteral(line, cursor);
  const after = skipBlanks(line, literal?.end ?? cursor);
  const transformed =
    literal !== undefined &&
    (literal.interpolated || line[after] === "+" || line[after] === "\\" || line[after] === ".");
  return literal && !transformed
    ? { kind: "literal", value: literal.value, column: literal.column }
    : { kind: "dynamic" };
}

const RUBY_KEYWORD = /(?<![\w.:])(?:(?:::)?Kernel\s*\.\s*)?(require_relative|require|load|gem|autoload)\b/g;

interface RubyScanState extends RubyInvocationScan {
  capReached: boolean;
}

function scanRubyLine(line: string, masked: string, lineNumber: number, state: RubyScanState): void {
  if (line.length > RUBY_MAX_LINE || masked.length > RUBY_MAX_LINE) {
    if (RUBY_INVOCATION_HINT.test(line)) state.skips.push(longLineSkip(line, lineNumber));
    return;
  }
  RUBY_KEYWORD.lastIndex = 0;
  for (const match of masked.matchAll(RUBY_KEYWORD)) {
    const kind = match[1];
    if (match.index === undefined || !kind || !isRubyKind(kind)) continue;
    const keywordLength = match[0].length;
    if (rubyKeywordIsMethodDefinition(masked, match.index)) continue;
    if (!rubyKeywordIsCall(line, masked, match.index, keywordLength)) continue;
    const reference = line.slice(match.index, match.index + RUBY_MAX_REFERENCE).trim();
    const column = match.index + 1;
    if (state.capReached || state.invocations.length >= RUBY_MAX_INVOCATIONS) {
      state.capReached = true;
      state.skips.push({
        line: lineNumber,
        column,
        reference,
        reason: `more than ${RUBY_MAX_INVOCATIONS} invocations in this repository`,
      });
      continue;
    }
    const argument = rubyArgument(line, kind, match.index + keywordLength);
    state.invocations.push({ kind, line: lineNumber, keywordColumn: column, reference, argument });
  }
}

/**
 * `require`, `load`, `gem`, `autoload`, and `require_relative` on one line. A string literal is a path; a
 * variable, interpolation, concatenation, or method call on the string is dynamic. `JSON.load` and
 * `require_relative` are not `load` or `require`. Lines over 4,096 characters and matches past
 * {@link RUBY_MAX_INVOCATIONS} are not scanned; each is reported in `skips` instead of being dropped.
 */
export function rubyInvocations(lines: readonly string[], maskedLines: readonly string[]): RubyInvocationScan {
  const state: RubyScanState = { invocations: [], skips: [], capReached: false };
  for (const [index, masked] of maskedLines.entries()) {
    scanRubyLine(lines[index] ?? "", masked, index + 1, state);
  }
  return { invocations: state.invocations, skips: state.skips };
}

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

/** A single-line string literal starting at `start`, or undefined when the text is not a quoted or percent string. */
function readRubyLiteral(line: string, start: number): RubyLiteral | undefined {
  const quoted = line[start];
  if (quoted === "'" || quoted === '"') {
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
  if (!closer || (type !== "" && type !== "q" && type !== "Q" && type !== "s")) return undefined;
  const interpolating = type === "" || type === "Q";
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

/**
 * True when the keyword at `index` is a real call site, not a hash key, method receiver, or bare assignment.
 * Argument-start checks use the original `line` because string literals are blanked in `masked`.
 */
function rubyKeywordIsCall(line: string, masked: string, index: number, keywordLength: number): boolean {
  const before = index > 0 ? masked[index - 1] : "";
  if (before === ":" || before === "@" || before === "$") return false;
  let cursor = index + keywordLength;
  const hadSpace = line[cursor] === " " || line[cursor] === "\t";
  while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
  const next = line[cursor];
  // Hash key `load:` has no space before `:`; `autoload :Foo` has whitespace then a symbol.
  if (next === ":") return hadSpace;
  if (next === undefined || next === "." || next === "," || next === "}" || next === ")" || next === ";") return false;
  // Assignment (`gem = …`), but not `==`.
  if (next === "=" && line[cursor + 1] !== "=") return false;
  if (next === "(") return true;
  return next === "'" || next === '"' || next === "%" || next === "/" || /[A-Za-z_$@]/.test(next);
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

/**
 * `require`, `load`, `gem`, `autoload`, and `require_relative` on one line. A string literal is a path; a
 * variable, interpolation, concatenation, or method call on the string is dynamic. `JSON.load` and
 * `require_relative` are not `load` or `require`. Lines over 4,096 characters and matches past
 * {@link RUBY_MAX_INVOCATIONS} are not scanned; each is reported in `skips` instead of being dropped.
 */
function skipBlanks(line: string, from: number): number {
  let cursor = from;
  while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
  return cursor;
}

function dynamicInvocation(
  kind: RubyInvocation["kind"],
  line: number,
  keywordColumn: number,
  reference: string,
): RubyInvocation {
  return { kind, line, keywordColumn, reference, argument: { kind: "dynamic" } };
}

function longLineSkip(line: string, lineNumber: number): RubyScanSkip {
  return {
    line: lineNumber,
    column: 1,
    reference: line.slice(0, RUBY_MAX_REFERENCE).trim(),
    reason: `line longer than ${RUBY_MAX_LINE} characters`,
  };
}

export function rubyInvocations(lines: readonly string[], maskedLines: readonly string[]): RubyInvocationScan {
  const keyword = /(?<![\w.:])(?:(?:::)?Kernel\s*\.\s*)?(require_relative|require|load|gem|autoload)\b/g;
  const invocations: RubyInvocation[] = [];
  const skips: RubyScanSkip[] = [];
  let invocationCapReached = false;
  for (const [index, masked] of maskedLines.entries()) {
    const line = lines[index] ?? "";
    if (line.length > RUBY_MAX_LINE || masked.length > RUBY_MAX_LINE) {
      if (RUBY_INVOCATION_HINT.test(line)) skips.push(longLineSkip(line, index + 1));
      continue;
    }
    keyword.lastIndex = 0;
    for (const match of masked.matchAll(keyword)) {
      if (match.index === undefined || !match[1]) continue;
      const kind = match[1];
      if (!isRubyKind(kind)) continue;
      const keywordLength = match[0].length;
      if (rubyKeywordIsMethodDefinition(masked, match.index)) continue;
      if (!rubyKeywordIsCall(line, masked, match.index, keywordLength)) continue;
      const reference = line.slice(match.index, match.index + RUBY_MAX_REFERENCE).trim();
      if (invocationCapReached || invocations.length >= RUBY_MAX_INVOCATIONS) {
        invocationCapReached = true;
        skips.push({
          line: index + 1,
          column: match.index + 1,
          reference,
          reason: `more than ${RUBY_MAX_INVOCATIONS} invocations in this repository`,
        });
        continue;
      }
      let cursor = match.index + keywordLength;
      cursor = skipBlanks(line, cursor);
      if (line[cursor] === "(") {
        cursor += 1;
        cursor = skipBlanks(line, cursor);
      }
      if (kind === "autoload") {
        const symbol = /^:([A-Za-z_]\w*)/.exec(line.slice(cursor));
        if (!symbol) {
          invocations.push(dynamicInvocation(kind, index + 1, match.index + 1, reference));
          continue;
        }
        cursor += symbol[0].length;
        cursor = skipBlanks(line, cursor);
        if (line[cursor] !== ",") {
          invocations.push(dynamicInvocation(kind, index + 1, match.index + 1, reference));
          continue;
        }
        cursor += 1;
        cursor = skipBlanks(line, cursor);
      }
      const literal = readRubyLiteral(line, cursor);
      let after = literal?.end ?? cursor;
      after = skipBlanks(line, after);
      const transformed =
        literal !== undefined &&
        (literal.interpolated || line[after] === "+" || line[after] === "\\" || line[after] === ".");
      invocations.push({
        kind,
        line: index + 1,
        keywordColumn: match.index + 1,
        reference,
        argument:
          literal && !transformed
            ? { kind: "literal", value: literal.value, column: literal.column }
            : { kind: "dynamic" },
      });
    }
  }
  return { invocations, skips };
}

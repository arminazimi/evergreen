import { type SourceLanguage } from "../domain.js";

export interface RubyPercentState {
  kind: "percent";
  delimiter: string;
  closer: string;
  paired: boolean;
  depth: number;
}

export interface RubyQuoteState {
  kind: "quote";
  quote: string;
  escaped: boolean;
}

export type RubyOpenString = RubyPercentState | RubyQuoteState;

export interface MaskState {
  blockComment: boolean;
  /** Swift permits nested block comments; the boolean alone cannot preserve their depth. */
  swiftBlockCommentDepth?: number;
  rubyBlock?: boolean;
  heredoc?: string;
  /** Set when a line that is exactly `__END__` has been seen; the rest of the file is data. */
  afterEnd?: boolean;
  /** Unclosed single-quoted, double-quoted, or percent string carried across lines. */
  openString?: RubyOpenString;
  /** Swift multiline string literal opened by three double quotes. */
  swiftMultilineString?: boolean;
  /** C# verbatim string (`@"…"`) left open at the end of a line; it may span lines. */
  csharpVerbatim?: boolean;
}

/** Open a Ruby percent literal at `index`, or undefined when the text is not one. */
export function rubyPercentOpen(line: string, index: number): RubyPercentState | undefined {
  if (line[index] !== "%") return undefined;
  let cursor = index + 1;
  const marker = line[cursor];
  if (marker && /[qQwWrsxiI]/.test(marker)) cursor += 1;
  const delimiter = line[cursor];
  if (!delimiter) return undefined;
  const closer =
    delimiter === "("
      ? ")"
      : delimiter === "["
        ? "]"
        : delimiter === "{"
          ? "}"
          : delimiter === "<"
            ? ">"
            : /[^A-Za-z0-9_\s]/.test(delimiter)
              ? delimiter
              : undefined;
  if (!closer) return undefined;
  return { kind: "percent", delimiter, closer, paired: closer !== delimiter, depth: 1 };
}

/**
 * Advance through a percent literal body starting at `from`. Returns the index of the closer when it
 * closes on this line, or undefined when it stays open (caller should keep `state` for the next line).
 */
export function rubyPercentClose(line: string, from: number, state: RubyPercentState): number | undefined {
  for (let position = from; position < line.length; position += 1) {
    const character = line.charAt(position);
    if (character === "\\" && position + 1 < line.length) {
      position += 1;
      continue;
    }
    if (state.paired && character === state.delimiter) state.depth += 1;
    else if (character === state.closer) {
      state.depth -= 1;
      if (state.depth === 0) return position;
    }
  }
  return undefined;
}

/** True when `/` at `index` can start a regexp rather than division. */
export function rubyRegexMayStart(line: string, index: number): boolean {
  let prev = index - 1;
  while (prev >= 0 && (line[prev] === " " || line[prev] === "\t")) prev -= 1;
  if (prev < 0) return true;
  const character = line.charAt(prev);
  if (/[\w$)\]]/.test(character)) return false;
  return true;
}

/** End index of a `/.../` regexp starting at `start`, including trailing flags; undefined if unclosed. */
export function rubyRegexEnd(line: string, start: number): number | undefined {
  let escaped = false;
  for (let index = start + 1; index < line.length; index += 1) {
    const character = line.charAt(index);
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "/") {
      let end = index;
      while (end + 1 < line.length && /[a-z]/.test(line.charAt(end + 1))) end += 1;
      return end;
    }
  }
  return undefined;
}

/**
 * Index of the quote that closes a C# verbatim string whose body starts at `from`, or undefined if it stays open.
 * A verbatim string has no backslash escapes; a doubled quote (`""`) is a literal quote.
 */
export function csharpVerbatimEnd(line: string, from: number): number | undefined {
  for (let index = from; index < line.length; index += 1) {
    if (line[index] !== '"') continue;
    if (line[index + 1] === '"') {
      index += 1;
      continue;
    }
    return index;
  }
  return undefined;
}

/** The characters that make a Ruby line worth scanning; a line without one of them is kept as written. */
const RUBY_MASK_TRIGGERS = /[#"'%`</?]/;

/** A bare, `<<-`/`<<~` indented, or quoted Ruby heredoc opener. */
const RUBY_HEREDOC = /^<<[-~]?(?:'([^'\n]+)'|"([^"\n]+)"|([A-Za-z_]\w*))/;

/** A quoted or bare `<<<` PHP heredoc opener. */
const PHP_HEREDOC = /^<<<(?:'([A-Za-z_][A-Za-z0-9_]*)'|"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*))/;

/** What one character decided: keep scanning, stop at this line, or carry an open literal past it. */
type MaskOutcome = "continue" | "stop" | "finish";

/** The position in a line being masked: `output` carries the mask, `line` the text as written. */
interface MaskCursor {
  readonly line: string;
  readonly output: string[];
  index: number;
  /** The quote character of the open string literal, or undefined at top level. */
  quote: string | undefined;
  /** True when the character before `index` escaped the one before that inside `quote`. */
  escaped: boolean;
  /** The Ruby percent literal carried from the previous line; its depth advances as its body is masked. */
  percent: RubyPercentState | undefined;
}

/** The masking decision for one character, or undefined when the character is plain code. */
type MaskStep = (cursor: MaskCursor, language: SourceLanguage, state: MaskState) => MaskOutcome | undefined;

/** The character the cursor is on, as the mask has it so far. */
function characterAt(cursor: MaskCursor): string {
  return cursor.output[cursor.index] ?? "";
}

/** The character after the cursor, as the mask has it so far; undefined at the end of the line. */
function nextAt(cursor: MaskCursor): string | undefined {
  return cursor.output[cursor.index + 1];
}

/** Spaces over the output positions from `from` through `to`, both inclusive. */
function blankRange(cursor: MaskCursor, from: number, to: number): void {
  for (let index = from; index <= to; index += 1) cursor.output[index] = " ";
}

/** Spaces over the rest of the line, from the cursor to its end. */
function blankRest(cursor: MaskCursor): void {
  blankRange(cursor, cursor.index, cursor.output.length - 1);
}

/** The masked line: every kept character in place, every masked one a space. */
function maskedText(cursor: MaskCursor): string {
  return cursor.output.join("");
}

/** The heredoc or percent label a `<<` opener captured, quoted or bare. */
function heredocTerminator(match: RegExpExecArray | null): string | undefined {
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

/** Inside a block comment everything is masked; Swift nests, so its `/*` opens another level. */
function maskBlockComment(cursor: MaskCursor, language: SourceLanguage, state: MaskState): MaskOutcome | undefined {
  if (!state.blockComment) return undefined;
  const character = characterAt(cursor);
  cursor.output[cursor.index] = " ";
  if (language === "swift" && character === "/" && nextAt(cursor) === "*") {
    cursor.output[cursor.index + 1] = " ";
    state.swiftBlockCommentDepth = (state.swiftBlockCommentDepth ?? 1) + 1;
    cursor.index += 1;
    return "continue";
  }
  if (character === "*" && nextAt(cursor) === "/") closeBlockComment(cursor, language, state);
  return "continue";
}

/** Closes one level of block comment; only the outermost one ends it. */
function closeBlockComment(cursor: MaskCursor, language: SourceLanguage, state: MaskState): void {
  cursor.output[cursor.index + 1] = " ";
  const depth = state.swiftBlockCommentDepth ?? 1;
  if (language === "swift" && depth > 1) {
    state.swiftBlockCommentDepth = depth - 1;
  } else {
    state.blockComment = false;
    delete state.swiftBlockCommentDepth;
  }
  cursor.index += 1;
}

/** Inside a quoted literal everything is masked until its closing quote, and a backslash escapes. */
function maskOpenQuote(cursor: MaskCursor): MaskOutcome | undefined {
  if (cursor.quote === undefined) return undefined;
  const character = characterAt(cursor);
  cursor.output[cursor.index] = " ";
  if (!cursor.escaped && character === cursor.quote) cursor.quote = undefined;
  cursor.escaped = character === "\\" && !cursor.escaped;
  return "continue";
}

/** A Swift `"""` string, closed on this line or carried to the next one. */
function maskSwiftMultiline(cursor: MaskCursor, language: SourceLanguage, state: MaskState): MaskOutcome | undefined {
  if (language !== "swift" || cursor.line.slice(cursor.index, cursor.index + 3) !== '"""') return undefined;
  const end = cursor.line.indexOf('"""', cursor.index + 3);
  if (end === -1) {
    blankRest(cursor);
    state.swiftMultilineString = true;
    return "finish";
  }
  blankRange(cursor, cursor.index, end + 2);
  cursor.index = end + 2;
  return "continue";
}

/** A Ruby character literal (`?a`, `?\n`) — two or three characters, and never the start of a string. */
function maskRubyCharacter(cursor: MaskCursor, language: SourceLanguage): MaskOutcome | undefined {
  if (language !== "ruby" || characterAt(cursor) !== "?") return undefined;
  const next = nextAt(cursor);
  if (next === undefined || next === " " || next === "\t") return undefined;
  const through = next === "\\" && cursor.index + 2 < cursor.output.length ? cursor.index + 2 : cursor.index + 1;
  blankRange(cursor, cursor.index, through);
  cursor.index = through;
  return "continue";
}

/** A Ruby `/…/` regexp where one can start; an unclosed one masks the rest of the line. */
function maskRubyRegexp(cursor: MaskCursor, language: SourceLanguage): MaskOutcome | undefined {
  if (language !== "ruby" || characterAt(cursor) !== "/") return undefined;
  if (nextAt(cursor) === "=" || !rubyRegexMayStart(cursor.line, cursor.index)) return undefined;
  const end = rubyRegexEnd(cursor.line, cursor.index);
  if (end === undefined) {
    blankRest(cursor);
    return "stop";
  }
  blankRange(cursor, cursor.index, end);
  cursor.index = end;
  return "continue";
}

/** A Ruby `%w[]`, `%q{}`, `%…` literal, closed on this line or carried to the next one. */
function maskRubyPercent(cursor: MaskCursor, language: SourceLanguage, state: MaskState): MaskOutcome | undefined {
  if (language !== "ruby" || characterAt(cursor) !== "%") return undefined;
  const opened = rubyPercentOpen(cursor.line, cursor.index);
  if (opened === undefined) return undefined;
  const bodyStart = /[qQwWrsxiI]/.test(cursor.line.charAt(cursor.index + 1)) ? cursor.index + 3 : cursor.index + 2;
  const closed = rubyPercentClose(cursor.line, bodyStart, opened);
  const through = closed ?? cursor.line.length - 1;
  blankRange(cursor, cursor.index, through);
  if (closed === undefined) {
    state.openString = opened;
    return "finish";
  }
  cursor.index = through;
  return "continue";
}

/** A PHP `<<<LABEL` heredoc: its opener masks the rest of the line and the body comes on later lines. */
function maskPhpHeredoc(cursor: MaskCursor, language: SourceLanguage, state: MaskState): MaskOutcome | undefined {
  if (language !== "php") return undefined;
  if (characterAt(cursor) !== "<" || nextAt(cursor) !== "<" || cursor.line[cursor.index + 2] !== "<") return undefined;
  const terminator = heredocTerminator(PHP_HEREDOC.exec(cursor.line.slice(cursor.index)));
  if (terminator === undefined) return undefined;
  state.heredoc = terminator;
  blankRest(cursor);
  return "finish";
}

/** A Ruby `<<LABEL` heredoc: only its opener is masked here, so the rest of the line stays scannable. */
function maskRubyHeredoc(cursor: MaskCursor, language: SourceLanguage, state: MaskState): MaskOutcome | undefined {
  if (language !== "ruby" || characterAt(cursor) !== "<" || nextAt(cursor) !== "<") return undefined;
  if (cursor.index > 0 && /[\w)\]]/.test(cursor.line.charAt(cursor.index - 1))) return undefined;
  const match = RUBY_HEREDOC.exec(cursor.line.slice(cursor.index));
  const terminator = heredocTerminator(match);
  if (match === null || terminator === undefined) return undefined;
  state.heredoc = terminator;
  const through = cursor.index + match[0].length - 1;
  blankRange(cursor, cursor.index, through);
  cursor.index = through;
  return "continue";
}

/** A C# `@"…"` verbatim string: no backslash escapes, and `""` is a literal quote. */
function maskCsharpVerbatim(cursor: MaskCursor, language: SourceLanguage, state: MaskState): MaskOutcome | undefined {
  if (language !== "csharp" || characterAt(cursor) !== "@" || nextAt(cursor) !== '"') return undefined;
  const end = csharpVerbatimEnd(cursor.line, cursor.index + 2);
  if (end === undefined) {
    blankRest(cursor);
    state.csharpVerbatim = true;
    return "finish";
  }
  blankRange(cursor, cursor.index, end);
  cursor.index = end;
  return "continue";
}

/** A string literal opening. Rust has no quoted char literals to mistake for one, Python and Rust no backtick strings. */
function maskQuoteOpen(cursor: MaskCursor, language: SourceLanguage): MaskOutcome | undefined {
  const character = characterAt(cursor);
  const opens =
    character === '"' ||
    (character === "'" && language !== "rust") ||
    (character === "`" && language !== "python" && language !== "rust");
  if (!opens) return undefined;
  cursor.quote = character;
  cursor.output[cursor.index] = " ";
  cursor.escaped = false;
  return "continue";
}

/** A C-style block comment opening; Python and Ruby never use one. */
function maskBlockCommentOpen(cursor: MaskCursor, language: SourceLanguage, state: MaskState): MaskOutcome | undefined {
  if (language === "python" || language === "ruby") return undefined;
  if (characterAt(cursor) !== "/" || nextAt(cursor) !== "*") return undefined;
  blankRange(cursor, cursor.index, cursor.index + 1);
  state.blockComment = true;
  if (language === "swift") state.swiftBlockCommentDepth = 1;
  cursor.index += 1;
  return "continue";
}

/** A `#` or `//` comment, and a PHP `#[` attribute that is not one. */
function isLineCommentStart(cursor: MaskCursor, language: SourceLanguage): boolean {
  const character = characterAt(cursor);
  if (character === "#") {
    return language === "python" || language === "ruby" || (language === "php" && nextAt(cursor) !== "[");
  }
  if (character === "/" && nextAt(cursor) === "/") return language !== "python" && language !== "ruby";
  return false;
}

/** The rest of a line comment. */
function maskLineComment(cursor: MaskCursor, language: SourceLanguage): MaskOutcome | undefined {
  if (!isLineCommentStart(cursor, language)) return undefined;
  blankRest(cursor);
  return "stop";
}

/** The decisions the scanner tries at each character, in the order the languages' syntaxes must be read. */
const MASK_STEPS: readonly MaskStep[] = [
  maskBlockComment,
  maskOpenQuote,
  maskSwiftMultiline,
  maskRubyCharacter,
  maskRubyRegexp,
  maskRubyPercent,
  maskPhpHeredoc,
  maskRubyHeredoc,
  maskCsharpVerbatim,
  maskQuoteOpen,
  maskBlockCommentOpen,
  maskLineComment,
];

/** Scans one line from the cursor. `stop` ends it in code, `finish` leaves an open literal unrecorded. */
function scanMaskedLine(cursor: MaskCursor, language: SourceLanguage, state: MaskState): MaskOutcome {
  for (; cursor.index < cursor.output.length; cursor.index += 1) {
    for (const step of MASK_STEPS) {
      const outcome = step(cursor, language, state);
      if (outcome === undefined) continue;
      if (outcome !== "continue") return outcome;
      break;
    }
  }
  return "stop";
}

/** The whole of a Ruby line inside a `__END__` block, a heredoc body, or a `=begin` comment. */
function maskRubyWholeLine(line: string, state: MaskState): string | undefined {
  const blanked = " ".repeat(line.length);
  if (state.afterEnd) return blanked;
  if (line === "__END__") {
    state.afterEnd = true;
    return blanked;
  }
  if (state.heredoc) {
    if (line.trim() === state.heredoc) delete state.heredoc;
    return blanked;
  }
  if (state.rubyBlock) {
    if (/^=end\b/.test(line)) state.rubyBlock = false;
    return blanked;
  }
  if (/^=begin\b/.test(line)) {
    state.rubyBlock = true;
    return blanked;
  }
  return undefined;
}

/** The whole of a PHP heredoc body line, until its terminator, with or without a semicolon. */
function maskPhpWholeLine(line: string, state: MaskState): string | undefined {
  if (state.heredoc === undefined) return undefined;
  const trimmed = line.trim();
  if (trimmed === state.heredoc || trimmed === `${state.heredoc};`) delete state.heredoc;
  return " ".repeat(line.length);
}

/** A line the language has already put inside a comment, heredoc, or data block. */
function maskWholeLine(line: string, language: SourceLanguage, state: MaskState): string | undefined {
  if (language === "ruby") return maskRubyWholeLine(line, state);
  if (language === "php") return maskPhpWholeLine(line, state);
  return undefined;
}

/** The cursor for a new line, or undefined when a Ruby line holds nothing a mask could change. */
function openMaskCursor(line: string, language: SourceLanguage, state: MaskState): MaskCursor | undefined {
  if (language === "ruby" && !state.blockComment && !state.openString && !RUBY_MASK_TRIGGERS.test(line))
    return undefined;
  const open = state.openString;
  const cursor: MaskCursor = {
    line,
    output: [...line],
    index: 0,
    quote: open?.kind === "quote" ? open.quote : undefined,
    escaped: open?.kind === "quote" ? open.escaped : false,
    percent: open?.kind === "percent" ? { ...open } : undefined,
  };
  delete state.openString;
  return cursor;
}

/**
 * Reads the literal carried from the previous line, moving the cursor past it. Its text when the literal still
 * has no end, so the whole line belongs to it; undefined when the line is ordinary code from here on.
 */
function resumeCarriedLiteral(cursor: MaskCursor, language: SourceLanguage, state: MaskState): string | undefined {
  if (language === "swift" && state.swiftMultilineString) {
    const end = cursor.line.indexOf('"""');
    if (end === -1) return " ".repeat(cursor.line.length);
    blankRange(cursor, 0, end + 2);
    state.swiftMultilineString = false;
    cursor.index = end + 3;
  }
  if (language === "csharp" && state.csharpVerbatim) {
    const end = csharpVerbatimEnd(cursor.line, 0);
    if (end === undefined) return " ".repeat(cursor.line.length);
    blankRange(cursor, 0, end);
    state.csharpVerbatim = false;
    cursor.index = end + 1;
  }
  const percent = cursor.percent;
  if (percent === undefined) return undefined;
  const closed = rubyPercentClose(cursor.line, 0, percent);
  blankRange(cursor, 0, closed ?? cursor.line.length - 1);
  if (closed === undefined) {
    state.openString = percent;
    return maskedText(cursor);
  }
  cursor.index = closed + 1;
  return undefined;
}

/** Ruby and PHP let a quote span lines; an unclosed one at the end of a line is carried to the next. */
function commitCarriedQuote(cursor: MaskCursor, language: SourceLanguage, state: MaskState): void {
  const isCarryingLanguage = language === "ruby" || language === "php";
  if (!isCarryingLanguage || cursor.quote === undefined) return;
  state.openString = { kind: "quote", quote: cursor.quote, escaped: cursor.escaped };
}

/**
 * Blanks the strings, comments, and literals of one source line so a keyword search cannot match inside them.
 * Positions are kept: the result has the same length as `line`, with every masked character a space.
 * `state` carries what an unclosed literal leaves for the next line.
 */
export function maskCodeLine(line: string, language: SourceLanguage, state: MaskState): string {
  const whole = maskWholeLine(line, language, state);
  if (whole !== undefined) return whole;
  const cursor = openMaskCursor(line, language, state);
  if (cursor === undefined) return line;
  const carried = resumeCarriedLiteral(cursor, language, state);
  if (carried !== undefined) return carried;
  if (scanMaskedLine(cursor, language, state) === "stop") commitCarriedQuote(cursor, language, state);
  return maskedText(cursor);
}

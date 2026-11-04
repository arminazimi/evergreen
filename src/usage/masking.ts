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

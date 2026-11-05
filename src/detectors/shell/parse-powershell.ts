/**
 * Bounded, literal-only PowerShell declaration reader. Never evaluates scripts.
 * Reads standalone #Requires -Version directives and top-level PowerShellVersion
 * keys in a root manifest hashtable. Dynamic expressions, nested keys, computed
 * keys, here-string values, and directives with additional options are ignored.
 * Unclosed strings, comments, or delimiters invalidate the whole input. This is
 * a lexical reader, not a PowerShell syntax validator. No module lifecycle
 * claim is inferred from a version declaration.
 */

import { required } from "../../required.js";

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface PowerShellVersionDeclaration {
  kind: "powershell-version";
  value: string;
  line: number;
}

interface Token {
  text: string;
  line: number;
  string?: boolean;
}

/** The state of the lexer while it reads one input from start to end. */
interface LexState {
  source: string;
  lines: string[];
  tokens: Token[];
  directives: PowerShellVersionDeclaration[];
  stack: string[];
  index: number;
  line: number;
  /** The line a backtick continuation last started, so a comment on it is never a directive. */
  continuedLine: number;
}

const VERSION = /^\d+\.\d+(?:\.\d+){0,2}$/;
const REQUIRES_VERSION = /^\s*#requires\s+-version\s+(\d+\.\d+(?:\.\d+){0,2})\s*$/i;
const CLOSING_TO_OPENING: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

export function parsePowerShell(contents: string): PowerShellVersionDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];
  const source = contents.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const state: LexState = {
    source,
    lines: source.split("\n"),
    tokens: [],
    directives: [],
    stack: [],
    index: 0,
    line: 1,
    continuedLine: 0,
  };
  while (state.index < source.length) {
    if (!scanToken(state)) return [];
  }
  if (state.stack.length) return [];
  const manifest = manifestVersions(state.tokens, state.lines) ?? [];
  return [...state.directives, ...manifest].sort((a, b) => a.line - b.line);
}

/** Read one token, comment, or whitespace run at the cursor. False when the input is malformed. */
function scanToken(state: LexState): boolean {
  const { source, index } = state;
  const c = source.charAt(index);
  if (c === "\n") {
    state.line++;
    state.index++;
    return true;
  }
  if (/\s/.test(c)) {
    state.index++;
    return true;
  }
  if (source.startsWith("<#", index)) return skipBlockComment(state);
  if (c === "#") {
    readComment(state);
    return true;
  }
  if (c === "@" && (source[index + 1] === "'" || source[index + 1] === '"') && source[index + 2] === "\n") {
    return readHereString(state);
  }
  if (c === "'" || c === '"') return readQuoted(state);
  if (c === "`") {
    readBacktick(state);
    return true;
  }
  return readPunctuationOrWord(state);
}

/** Skip a nestable `<# ... #>` block comment. False when it is never closed. */
function skipBlockComment(state: LexState): boolean {
  const { source } = state;
  let depth = 1;
  state.index += 2;
  while (state.index < source.length && depth > 0) {
    if (source.startsWith("<#", state.index)) {
      depth++;
      state.index += 2;
    } else if (source.startsWith("#>", state.index)) {
      depth--;
      state.index += 2;
    } else {
      if (source[state.index] === "\n") state.line++;
      state.index++;
    }
  }
  return depth === 0;
}

/** A `#` comment runs to the end of its line; it is a directive only when it is a whole, standalone `#Requires -Version` line. */
function readComment(state: LexState): void {
  const { source, index, line } = state;
  const end = source.indexOf("\n", index);
  const stop = end < 0 ? source.length : end;
  const text = source.slice(index, stop);
  const whole = required(state.lines[line - 1], "the current line");
  const match = REQUIRES_VERSION.exec(whole);
  if (line !== state.continuedLine && whole.length <= MAXIMUM_LINE_LENGTH && match && whole.trimStart() === text) {
    state.directives.push({ kind: "powershell-version", value: required(match[1], "#Requires version"), line });
  }
  state.index = stop;
}

/** A `@'` or `@"` here-string is one opaque token. False when it is never closed. */
function readHereString(state: LexState): boolean {
  const { source } = state;
  const close = source.charAt(state.index + 1) + "@";
  const startLine = state.line;
  state.index += 3;
  state.line++;
  while (state.index < source.length) {
    if (source.startsWith(close, state.index) && source[state.index - 1] === "\n") {
      state.index += 2;
      state.tokens.push({ text: "<here-string>", line: startLine });
      return true;
    }
    if (source[state.index] === "\n") state.line++;
    state.index++;
  }
  return false;
}

/**
 * Read a `'…'` or `"…"` string. A double-quoted string with a backtick or `$` is
 * dynamic and reads as `<dynamic>`. False when it is never closed.
 */
function readQuoted(state: LexState): boolean {
  const { source } = state;
  const quote = source.charAt(state.index);
  const startLine = state.line;
  let text = "";
  let literal = true;
  state.index++;
  while (state.index < source.length) {
    const next = source.charAt(state.index);
    if (next === quote) {
      if (source[state.index + 1] === quote) {
        text += quote;
        state.index += 2;
        continue;
      }
      state.index++;
      state.tokens.push({ text: literal ? text : "<dynamic>", line: startLine, string: true });
      return true;
    }
    if (quote === '"' && next === "`") {
      literal = false;
      if (source[state.index + 1] === "\n") state.line++;
      state.index += 2;
      continue;
    }
    if (quote === '"' && next === "$") literal = false;
    if (next === "\n") state.line++;
    text += next;
    state.index++;
  }
  return false;
}

/** A backtick escapes the next character, or continues the line when it ends one. */
function readBacktick(state: LexState): void {
  if (state.source[state.index + 1] === "\n") {
    state.line++;
    state.continuedLine = state.line;
    state.index += 2;
    return;
  }
  state.tokens.push({ text: "<escaped>", line: state.line });
  state.index += 2;
}

/** A bracket must match the innermost open bracket. A word is a run of word characters; anything else is one character. */
function readPunctuationOrWord(state: LexState): boolean {
  const { source, index, line } = state;
  const c = source.charAt(index);
  if ("([{".includes(c)) state.stack.push(c);
  if (")]}".includes(c) && state.stack.pop() !== CLOSING_TO_OPENING[c]) return false;
  const word = /^[\w.$-]+/.exec(source.slice(index));
  if (word) {
    state.tokens.push({ text: word[0], line });
    state.index += word[0].length;
  } else {
    state.tokens.push({ text: c, line });
    state.index++;
  }
  return true;
}

/**
 * The PowerShellVersion values of a root manifest hashtable, or undefined when the tokens are not
 * one (a script, or a value that is not a hashtable). A manifest that closes before its last token
 * is not a single hashtable either, so nothing is read from it.
 */
function manifestVersions(tokens: Token[], lines: string[]): PowerShellVersionDeclaration[] | undefined {
  if (tokens[0]?.text !== "@" || tokens[1]?.text !== "{" || tokens.at(-1)?.text !== "}") return undefined;
  const results: PowerShellVersionDeclaration[] = [];
  let depth = 0;
  for (let n = 1; n < tokens.length; n++) {
    const token = required(tokens[n], "the manifest token");
    if (!token.string && "([{".includes(token.text)) depth++;
    if (!token.string && ")]}".includes(token.text)) depth--;
    if (depth === 0 && n !== tokens.length - 1) return undefined;
    if (depth !== 1 || token.text.toLowerCase() !== "powershellversion") continue;
    const declaration = manifestVersionAt(tokens, lines, n);
    if (declaration) results.push(declaration);
  }
  return results;
}

/** The version a `PowerShellVersion = '…'` entry at token `n` sets, when it is a whole top-level entry with a literal version. */
function manifestVersionAt(tokens: Token[], lines: string[], n: number): PowerShellVersionDeclaration | undefined {
  const token = required(tokens[n], "the manifest key");
  const previous = required(tokens[n - 1], "the token before the key");
  if (previous.line === token.line && previous.text !== "{" && previous.text !== ";") return undefined;
  const value = tokens[n + 2];
  const after = tokens[n + 3];
  if (tokens[n + 1]?.text !== "=" || !value?.string || !VERSION.test(value.text)) return undefined;
  if (after && after.line === value.line && after.text !== ";" && after.text !== "}") return undefined;
  if (required(lines[value.line - 1], "the value line").length > MAXIMUM_LINE_LENGTH) return undefined;
  return { kind: "powershell-version", value: value.text, line: value.line };
}

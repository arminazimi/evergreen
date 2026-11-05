/**
 * A small, bounded reader for the line structure of TOML files, enough to know which table a line is in and to
 * read single-line `key = value` pairs with their line numbers. It never builds a tree and never evaluates anything.
 * Values that span lines, and anything it cannot read, yield nothing.
 */

import { required } from "../../required.js";

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface TomlLine {
  /** The 1-based source line. */
  line: number;
  /** The table path of the nearest header above, such as `dependencies` or `target.'cfg(unix)'.dependencies`; "" before any header. */
  table: string;
  /** True for a `[[array.of.tables]]` header line. */
  arrayTable: boolean;
  /** The text of a header line, with the brackets removed; set only on header lines. */
  header?: string;
  /** For a `key = value` line: the key as written (a dotted key keeps its dots). */
  key?: string;
  /** For a `key = value` line: the raw value text, comment removed; absent when the value spans several lines. */
  value?: string;
}

/** Removes a trailing `#` comment that is not inside a string. */
export function stripComment(text: string): string {
  let quote: string | undefined;
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (quote) {
      if (character === "\\" && quote === '"') index += 1;
      else if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "#") {
      return text.slice(0, index);
    }
  }
  return text;
}

/** How many `[`/`{` are still open at the end of `text`, ignoring brackets inside strings. */
function openBrackets(text: string): number {
  let depth = 0;
  let quote: string | undefined;
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (quote) {
      if (character === "\\" && quote === '"') index += 1;
      else if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === "[" || character === "{") depth += 1;
    else if (character === "]" || character === "}") depth -= 1;
  }
  return depth;
}

/** The contents of a single-line basic or literal string value, or undefined when the value is anything else. */
export function stringValue(value: string | undefined): string | undefined {
  const match = value === undefined ? null : /^(?:"((?:[^"\\]|\\.)*)"|'([^']*)')$/.exec(value.trim());
  if (!match) return undefined;
  return match[1] !== undefined ? match[1].replace(/\\(["\\])/g, "$1") : match[2];
}

/** What the reader carries from one line to the next. */
interface Reader {
  lines: TomlLine[];
  table: string;
  /** The closing delimiter of a multi-line string that is still open. */
  multiline: string | undefined;
  /** Brackets still open from a multi-line array or inline table. */
  open: number;
}

/** A line that opens a multi-line string keeps the reader inside it until the closing delimiter. */
function openMultiline(reader: Reader, value: string): void {
  if (/^"""/.test(value) && !/^""".*"""$/.test(value)) reader.multiline = '"""';
  else if (/^'''/.test(value) && !/^'''.*'''$/.test(value)) reader.multiline = "'''";
}

/** A table header line. Returns false when the header is not closed. */
function readHeader(reader: Reader, text: string, number: number): boolean {
  const array = text.startsWith("[[");
  const match = array ? /^\[\[(.+)\]\]$/.exec(text) : /^\[(.+)\]$/.exec(text);
  if (!match) return false;
  reader.table = required(match[1], "table header").trim();
  reader.lines.push({
    line: number,
    table: reader.table,
    arrayTable: array,
    header: reader.table,
  });
  return true;
}

/** A `key = value` line. Returns false when it has no key or an unbalanced quote. */
function readKeyValue(reader: Reader, text: string, number: number): boolean {
  const equals = text.indexOf("=");
  if (equals === -1) return false;
  const key = text.slice(0, equals).trim();
  const value = text.slice(equals + 1).trim();
  const unbalancedQuote = (value.match(/(?<!\\)"/g)?.length ?? 0) % 2 === 1 && !/^"""|^'''/.test(value);
  if (key === "" || unbalancedQuote) return false;
  openMultiline(reader, value);
  // A value that opens a bracket it does not close continues on the next lines.
  const depth = openBrackets(value);
  if (depth < 0) return false;
  if (depth > 0) reader.open = depth;
  reader.lines.push(
    depth > 0
      ? { line: number, table: reader.table, arrayTable: false, key }
      : { line: number, table: reader.table, arrayTable: false, key, value },
  );
  return true;
}

/** Reads one raw line. Returns false when the line makes the rest of the document unreliable. */
function readLine(reader: Reader, raw: string, number: number): boolean {
  if (raw.length > MAXIMUM_LINE_LENGTH) return false;
  // Skip the inside of multi-line strings.
  if (reader.multiline) {
    if (raw.includes(reader.multiline)) reader.multiline = undefined;
    return true;
  }
  const text = stripComment(raw).trim();
  if (text === "") return true;
  if (reader.open > 0) {
    reader.open += openBrackets(text);
    return reader.open >= 0;
  }
  return text.startsWith("[") ? readHeader(reader, text, number) : readKeyValue(reader, text, number);
}

/**
 * Reads the lines of a TOML document. Returns undefined when it is malformed in a way that makes the rest
 * unreliable (a table header that is not closed, or a line with an unbalanced quote), so a caller returns
 * nothing instead of a partial result.
 */
export function readTomlLines(contents: string): TomlLine[] | undefined {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return undefined;
  const reader: Reader = {
    lines: [],
    table: "",
    multiline: undefined,
    open: 0,
  };
  for (const [index, raw] of contents.split(/\r?\n/).entries()) {
    if (!readLine(reader, raw, index + 1)) return undefined;
  }
  return reader.lines;
}

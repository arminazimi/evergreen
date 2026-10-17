/**
 * A small, bounded reader for the line structure of TOML files, enough to know which table a line is in and to
 * read single-line `key = value` pairs with their line numbers. It never builds a tree and never evaluates anything.
 * Values that span lines, and anything it cannot read, yield nothing.
 */

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
    const character = text[index]!;
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
    const character = text[index]!;
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

/**
 * Reads the lines of a TOML document. Returns undefined when it is malformed in a way that makes the rest
 * unreliable (a table header that is not closed, or a line with an unbalanced quote), so a caller returns
 * nothing instead of a partial result.
 */
export function readTomlLines(contents: string): TomlLine[] | undefined {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return undefined;
  const lines: TomlLine[] = [];
  let table = "";
  let multiline: string | undefined;
  // Lines still inside a multi-line array or inline table (their values are skipped, not read).
  let open = 0;
  for (const [index, raw] of contents.split(/\r?\n/).entries()) {
    const number = index + 1;
    if (raw.length > MAXIMUM_LINE_LENGTH) return undefined;
    // Skip the inside of multi-line strings.
    if (multiline) {
      if (raw.includes(multiline)) multiline = undefined;
      continue;
    }
    const text = stripComment(raw).trim();
    if (text === "") continue;
    if (open > 0) {
      open += openBrackets(text);
      if (open < 0) return undefined;
      continue;
    }
    if (text.startsWith("[")) {
      const array = text.startsWith("[[");
      const match = array ? /^\[\[(.+)\]\]$/.exec(text) : /^\[(.+)\]$/.exec(text);
      if (!match) return undefined;
      table = match[1]!.trim();
      lines.push({ line: number, table, arrayTable: array, header: table });
      continue;
    }
    const equals = text.indexOf("=");
    if (equals === -1) return undefined;
    const key = text.slice(0, equals).trim();
    const value = text.slice(equals + 1).trim();
    if (key === "" || (value.match(/(?<!\\)"/g)?.length ?? 0) % 2 === 1 && !/^"""|^'''/.test(value)) return undefined;
    if (/^"""/.test(value) && !/^""".*"""$/.test(value)) multiline = '"""';
    else if (/^'''/.test(value) && !/^'''.*'''$/.test(value)) multiline = "'''";
    // A value that opens a bracket it does not close continues on the next lines.
    const depth = openBrackets(value);
    if (depth < 0) return undefined;
    if (depth > 0) open = depth;
    lines.push(depth > 0 ? { line: number, table, arrayTable: false, key } : { line: number, table, arrayTable: false, key, value });
  }
  return lines;
}

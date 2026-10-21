/**
 * Small, bounded HCL scanning helpers shared by the Terraform parsers.
 *
 * Nothing here evaluates HCL. Comments and string contents are blanked so
 * structure can be scanned with plain offsets; the original text is read back
 * only for literal strings that contain no escape or interpolation.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;
export const MAXIMUM_DECLARATIONS = 5000;

export interface HclSource {
  /** The original text, with overlong lines blanked. */
  source: string;
  /** Same length as `source`; comments and string contents are spaces. */
  masked: string;
}

export interface HclBlock {
  name: string;
  /** Source text between the name and the opening brace (labels and `=`). */
  header: string;
  /** Offset just after the opening brace. */
  bodyStart: number;
  /** Offset of the closing brace. */
  bodyEnd: number;
}

function blank(text: string): string {
  return text.replace(/[^\n]/g, " ");
}

/**
 * Blank comments, string contents, and heredocs. Returns undefined when a
 * comment, string, or heredoc never terminates.
 */
function maskHcl(source: string): string | undefined {
  const chunks: string[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index]!;
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) return undefined;
      chunks.push(blank(source.slice(index, end + 2)));
      index = end + 2;
    } else if (character === "#" || source.startsWith("//", index)) {
      const end = source.indexOf("\n", index);
      const stop = end < 0 ? source.length : end;
      chunks.push(blank(source.slice(index, stop)));
      index = stop;
    } else if (source.startsWith("<<", index) && /^<<-?[A-Za-z_]/.test(source.slice(index, index + 4))) {
      const marker = /^<<-?([A-Za-z_][A-Za-z0-9_]*)/.exec(source.slice(index))![1]!;
      const rest = source.slice(index);
      const closer = new RegExp(`\\n[\\t ]*${marker}[\\t ]*(?:\\r?\\n|$)`).exec(rest);
      if (!closer) return undefined;
      const end = index + closer.index + closer[0].length;
      chunks.push(blank(source.slice(index, end)));
      index = end;
    } else if (character === '"') {
      let position = index + 1;
      for (;;) {
        if (position >= source.length || source[position] === "\n") return undefined;
        if (source[position] === "\\") position += 2;
        else if (source[position] === '"') break;
        else position++;
      }
      chunks.push(`"${blank(source.slice(index + 1, position))}"`);
      index = position + 1;
    } else {
      chunks.push(character);
      index++;
    }
  }
  return chunks.join("");
}

/** Bound and mask a file. Returns undefined for oversized or unterminated input. */
export function prepareHcl(contents: string): HclSource | undefined {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return undefined;
  const text = contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents;
  const source = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (line.length > MAXIMUM_LINE_LENGTH ? " ".repeat(line.length) : line))
    .join("\n");
  const masked = maskHcl(source);
  return masked === undefined ? undefined : { source, masked };
}

export function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < text.length; index++) {
    if (text.charCodeAt(index) === 0x0a) line++;
  }
  return line;
}

/** Offset of the matching `}` for the `{` at `openBrace`, or undefined when it never closes. */
export function closingBrace(masked: string, openBrace: number): number | undefined {
  let depth = 1;
  for (let index = openBrace + 1; index < masked.length; index++) {
    if (masked[index] === "{") depth++;
    else if (masked[index] === "}" && --depth === 0) return index;
  }
  return undefined;
}

/** True when only whitespace, or the `{` that opens the span, precedes `index` on its line. */
function atLineStart(masked: string, index: number, start: number): boolean {
  for (let position = index - 1; position >= start; position--) {
    const character = masked[position]!;
    if (character === "\n" || character === "{") return true;
    if (character !== " " && character !== "\t") return false;
  }
  return true;
}

/** Offsets of the `{ [ (` nesting depth are tracked so only direct children are returned. */
function directChildren<T>(
  masked: string,
  start: number,
  end: number,
  match: (index: number) => { value: T; next: number } | undefined,
): T[] {
  const found: T[] = [];
  let depth = 0;
  let index = start;
  while (index < end) {
    const character = masked[index]!;
    if (character === "{" || character === "[" || character === "(") {
      depth++;
    } else if (character === "}" || character === "]" || character === ")") {
      depth--;
    } else if (depth === 0 && /[A-Za-z_]/.test(character) && atLineStart(masked, index, start)) {
      const result = match(index);
      if (result) {
        found.push(result.value);
        index = result.next;
        continue;
      }
    }
    index++;
  }
  return found;
}

/**
 * Blocks and object attributes opened at depth 0 of `[start, end)`:
 * `name {`, `name "label" {`, and `name = {`. A block that never closes is skipped.
 */
export function directBlocks(hcl: HclSource, start: number, end: number): HclBlock[] {
  const opener = /^([A-Za-z_][A-Za-z0-9_-]*)([^\S\n]*(?:"[^"\n]*"[^\S\n]*)*(?:=[^\S\n]*)?)\{/;
  return directChildren(hcl.masked, start, end, (index) => {
    const match = opener.exec(hcl.masked.slice(index, index + MAXIMUM_LINE_LENGTH));
    if (!match) return undefined;
    const openBrace = index + match[0].length - 1;
    if (openBrace >= end) return undefined;
    const close = closingBrace(hcl.masked, openBrace);
    if (close === undefined || close > end) return undefined;
    const name = match[1]!;
    const header = hcl.source.slice(index + name.length, openBrace);
    return { value: { name, header, bodyStart: openBrace + 1, bodyEnd: close }, next: close + 1 };
  });
}

/**
 * Plain `name = "literal"` attributes at depth 0 of `[start, end)`. A value that
 * is not a single literal string (a reference, a call, an interpolation, an
 * escape, or an empty string) is skipped.
 */
export function stringAttributes(
  hcl: HclSource,
  start: number,
  end: number,
): Array<{ name: string; value: string; line: number }> {
  const attribute = /^([A-Za-z_][A-Za-z0-9_-]*)[^\S\n]*=[^\S\n]*"/;
  return directChildren(hcl.masked, start, end, (index) => {
    const match = attribute.exec(hcl.masked.slice(index, index + MAXIMUM_LINE_LENGTH));
    if (!match) return undefined;
    const open = index + match[0].length - 1;
    const close = hcl.masked.indexOf('"', open + 1);
    if (close < 0 || close >= end) return undefined;
    const rest = hcl.masked.slice(close + 1, hcl.masked.indexOf("\n", close) < 0 ? undefined : hcl.masked.indexOf("\n", close));
    if (rest.trim() !== "" && !rest.trim().startsWith("}")) return undefined;
    const value = hcl.source.slice(open + 1, close);
    if (value === "" || /[\\$%]\{|\\/.test(value) || value !== value.trim()) return undefined;
    return {
      value: { name: match[1]!, value, line: lineAt(hcl.source, open + 1) },
      next: close + 1,
    };
  });
}

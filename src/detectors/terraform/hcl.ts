/**
 * Small, bounded HCL scanning helpers shared by the Terraform parsers.
 *
 * Nothing here evaluates HCL. Comments and string contents are blanked so
 * structure can be scanned with plain offsets; the original text is read back
 * only for literal strings that contain no escape or interpolation.
 */

import { required } from "../../required.js";

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;
export const MAXIMUM_DECLARATIONS = 5000;

/** A heredoc opener, read with `matchAll` so the marker needs no assertion. */
const HEREDOC = /^<<-?([A-Za-z_][A-Za-z0-9_]*)/g;
const HEREDOC_START = /^<<-?[A-Za-z_]/;
const ATTRIBUTE_START = /^([A-Za-z_][A-Za-z0-9_-]*)[^\S\n]*=/;

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

/** True when a heredoc opener (`<<MARKER` or `<<-MARKER`) starts at `index`. */
export function isHeredocStart(text: string, index: number): boolean {
  return HEREDOC_START.test(text.slice(index, index + 4));
}

/**
 * Offset just after the closing line of the heredoc whose opener starts at `index`,
 * or undefined when it never closes. Only call it when `isHeredocStart` is true.
 */
export function heredocEnd(text: string, index: number): number | undefined {
  const opener = required(text.slice(index).matchAll(HEREDOC).next().value, "heredoc opener");
  const marker = required(opener[1], "heredoc marker");
  const closer = new RegExp(`\\n[\\t ]*${marker}[\\t ]*(?:\\r?\\n|$)`).exec(text.slice(index));
  return closer ? index + closer.index + closer[0].length : undefined;
}

/** The masked text of one token and the offset where scanning resumes. */
interface MaskStep {
  text: string;
  next: number;
}

/** A block comment is blanked whole; undefined when it never closes. */
function maskBlockComment(source: string, index: number): MaskStep | undefined {
  const end = source.indexOf("*/", index + 2);
  if (end < 0) return undefined;
  return { text: blank(source.slice(index, end + 2)), next: end + 2 };
}

/** A line comment runs to the end of its line, or to the end of the file. */
function maskLineComment(source: string, index: number): MaskStep {
  const end = source.indexOf("\n", index);
  const stop = end < 0 ? source.length : end;
  return { text: blank(source.slice(index, stop)), next: stop };
}

function maskHeredoc(source: string, index: number): MaskStep | undefined {
  const end = heredocEnd(source, index);
  return end === undefined ? undefined : { text: blank(source.slice(index, end)), next: end };
}

/** Keeps the quotes and blanks the contents; undefined for a string that never closes on its line. */
function maskString(source: string, index: number): MaskStep | undefined {
  let position = index + 1;
  for (;;) {
    if (position >= source.length || source[position] === "\n") return undefined;
    if (source[position] === "\\") position += 2;
    else if (source[position] === '"') break;
    else position++;
  }
  return { text: `"${blank(source.slice(index + 1, position))}"`, next: position + 1 };
}

/** The masked token that starts at `index`; an ordinary character is its own step. */
function maskStep(source: string, index: number): MaskStep | undefined {
  const character = source.charAt(index);
  if (source.startsWith("/*", index)) return maskBlockComment(source, index);
  if (character === "#" || source.startsWith("//", index)) return maskLineComment(source, index);
  if (isHeredocStart(source, index)) return maskHeredoc(source, index);
  if (character === '"') return maskString(source, index);
  return { text: character, next: index + 1 };
}

/**
 * Blank comments, string contents, and heredocs. Returns undefined when a
 * comment, string, or heredoc never terminates.
 */
function maskHcl(source: string): string | undefined {
  const chunks: string[] = [];
  let index = 0;
  while (index < source.length) {
    const step = maskStep(source, index);
    if (step === undefined) return undefined;
    chunks.push(step.text);
    index = step.next;
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
    const character = masked.charAt(position);
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
    const character = masked.charAt(index);
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
    const name = required(match[1], "block name");
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
    const rest = hcl.masked.slice(
      close + 1,
      hcl.masked.indexOf("\n", close) < 0 ? undefined : hcl.masked.indexOf("\n", close),
    );
    if (rest.trim() !== "" && !rest.trim().startsWith("}")) return undefined;
    const value = hcl.source.slice(open + 1, close);
    if (value === "" || /[\\$%]\{|\\/.test(value) || value !== value.trim()) return undefined;
    return {
      value: { name: required(match[1], "attribute name"), value, line: lineAt(hcl.source, open + 1) },
      next: close + 1,
    };
  });
}

export interface HclAttributeValue {
  name: string;
  /** The literal's contents, or the expression as written when the value is not a plain string. */
  value: string;
  /** True when the value is one plain quoted string with no escape or interpolation. */
  literal: boolean;
  line: number;
}

/** A quoted string with no escape, no interpolation or directive, and no padding; `""` is not one. */
function isPlainLiteral(value: string): boolean {
  return value !== "" && value === value.trim() && !/[\\$%]\{/.test(value) && !value.includes("\\");
}

/** The quoted value of an attribute that starts with `"`, or undefined when the quotes do not close before `stop`. */
function quotedAttribute(
  hcl: HclSource,
  name: string,
  equals: number,
  stop: number,
): { value: HclAttributeValue; next: number } | undefined {
  const open = hcl.masked.indexOf('"', equals);
  const close = open < 0 ? -1 : hcl.masked.indexOf('"', open + 1);
  const rest = close < 0 ? "" : hcl.masked.slice(close + 1, stop).trim();
  if (open < 0 || close < 0 || close >= stop || (rest !== "" && !rest.startsWith("}"))) return undefined;
  const value = hcl.source.slice(open + 1, close);
  const literal = isPlainLiteral(value);
  return {
    value: {
      name,
      value: literal ? value : hcl.source.slice(open, close + 1),
      literal,
      line: lineAt(hcl.source, open + 1),
    },
    next: close + 1,
  };
}

/** The attribute that starts at `index`, if any; its value runs to the end of its line or `end`. */
function attributeAt(
  hcl: HclSource,
  index: number,
  end: number,
): { value: HclAttributeValue; next: number } | undefined {
  const match = ATTRIBUTE_START.exec(hcl.masked.slice(index, index + MAXIMUM_LINE_LENGTH));
  if (!match) return undefined;
  const name = required(match[1], "attribute name");
  const equals = index + match[0].length - 1;
  const lineEnd = hcl.masked.indexOf("\n", equals);
  const stop = lineEnd < 0 || lineEnd > end ? end : lineEnd;
  const masked = hcl.masked.slice(equals + 1, stop).trim();
  if (masked === "") return undefined;
  if (masked.startsWith('"')) return quotedAttribute(hcl, name, equals, stop);
  return {
    value: { name, value: masked, literal: false, line: lineAt(hcl.source, equals + 1) },
    next: equals + 1,
  };
}

/**
 * Every `name = <value>` attribute at depth 0 of `[start, end)`, whether or not
 * its value is a literal string. A literal is returned without its quotes; any
 * other value is returned as written so a caller can report it as unclassified.
 * A value that is empty is skipped.
 */
export function attributeValues(hcl: HclSource, start: number, end: number): HclAttributeValue[] {
  return directChildren(hcl.masked, start, end, (index) => attributeAt(hcl, index, end));
}

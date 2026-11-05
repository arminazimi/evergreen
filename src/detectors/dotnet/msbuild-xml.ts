import { required } from "../../required.js";

/**
 * A small, bounded XML reader for MSBuild files. It keeps the 1-based line of every element and attribute,
 * skips comments, processing instructions, and DOCTYPE, treats CDATA as text, and returns `undefined` for
 * anything that is not well formed (an unclosed tag or comment, a mismatched end tag, an attribute without a
 * quoted value, more than one root). Entities other than the five predefined ones are left as written. Nothing
 * is evaluated, no `<Import>` is followed, and no property is expanded.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
const MAXIMUM_DEPTH = 64;
const MAXIMUM_ELEMENTS = 20_000;

export interface XmlAttribute {
  value: string;
  line: number;
}

export interface XmlElement {
  name: string;
  line: number;
  /** Lower-cased attribute name to its value and line. */
  attributes: Map<string, XmlAttribute>;
  /** Concatenated, trimmed text directly inside the element. */
  text: string;
  children: XmlElement[];
  parent: XmlElement | undefined;
}

class Malformed extends Error {}

/** The five XML predefined entities; the pattern in `decode` can only capture one of these names. */
const predefinedEntities = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** The text of a capture group the patterns above always fill. */
function groupText(match: RegExpExecArray, index: number): string {
  return required(match[index], "matched group");
}

/** The length of the leading-whitespace run at `start` inside the same 4096-character window the scan uses. */
function leadingWhitespace(text: string, start: number): number {
  const view = text.slice(start, start + 4096);
  return view.length - view.trimStart().length;
}

function decode(text: string): string {
  return text.replace(
    /&(lt|gt|amp|quot|apos);/g,
    (_all, name: keyof typeof predefinedEntities) => predefinedEntities[name],
  );
}

/** Parser state shared by the readers below: the input, the cursor, and the element being read. */
interface Cursor {
  readonly text: string;
  position: number;
  line: number;
  count: number;
  root: XmlElement | undefined;
  current: XmlElement | undefined;
}

// Annotating the const (not just the return) as `() => never` lets tsc narrow guarded values after `if (...) fail();`.
const fail: () => never = () => {
  throw new Malformed();
};

function advanceTo(cursor: Cursor, to: number): void {
  for (let index = cursor.position; index < to; index += 1) if (cursor.text[index] === "\n") cursor.line += 1;
  cursor.position = to;
}

function closingEnd(cursor: Cursor, marker: string): number {
  const end = cursor.text.indexOf(marker, cursor.position);
  if (end === -1) return fail();
  return end + marker.length;
}

function addText(cursor: Cursor, value: string): void {
  const { current } = cursor;
  if (!current) {
    if (value.trim() !== "") fail();
    return;
  }
  current.text = `${current.text}${decode(value)}`.trim();
}

/** Skips a comment, processing instruction, or DOCTYPE; false when the markup at the cursor is none of these. */
function skipSpecialMarkup(cursor: Cursor): boolean {
  const { text, position } = cursor;
  if (text.startsWith("<!--", position)) advanceTo(cursor, closingEnd(cursor, "-->"));
  else if (text.startsWith("<?", position)) advanceTo(cursor, closingEnd(cursor, "?>"));
  else if (text.startsWith("<!", position)) advanceTo(cursor, closingEnd(cursor, ">"));
  else return false;
  return true;
}

/** CDATA is text inside the current element; it must be checked before the DOCTYPE branch of `skipSpecialMarkup`. */
function readCdata(cursor: Cursor): void {
  const { text, position, current } = cursor;
  const end = text.indexOf("]]>", position);
  if (end === -1) fail();
  if (!current) fail();
  current.text = `${current.text}${text.slice(position + 9, end)}`.trim();
  advanceTo(cursor, end + 3);
}

function readEndTag(cursor: Cursor): void {
  const { position, current } = cursor;
  const match = /^<\/([^\s>/]+)\s*>/.exec(cursor.text.slice(position, position + 512));
  if (!match || !current || current.name !== match[1]) fail();
  cursor.current = current.parent;
  advanceTo(cursor, position + match[0].length);
}

function readAttribute(cursor: Cursor, element: XmlElement): void {
  const { text, position } = cursor;
  const attribute = /^([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(text.slice(position, position + 4096));
  if (!attribute) fail();
  const valueLine =
    cursor.line +
    [...text.slice(position, position + attribute[0].indexOf("="))].filter((char) => char === "\n").length;
  const key = groupText(attribute, 1).toLowerCase();
  if (element.attributes.has(key)) fail();
  element.attributes.set(key, { value: decode(attribute[2] ?? attribute[3] ?? ""), line: valueLine });
  advanceTo(cursor, position + attribute[0].length);
}

/** Reads attributes up to the end of the start tag; true when the tag is self-closing. */
function readAttributes(cursor: Cursor, element: XmlElement): boolean {
  for (;;) {
    advanceTo(cursor, cursor.position + leadingWhitespace(cursor.text, cursor.position));
    const { text, position } = cursor;
    if (text.startsWith("/>", position)) {
      advanceTo(cursor, position + 2);
      return true;
    }
    if (text[position] === ">") {
      advanceTo(cursor, position + 1);
      return false;
    }
    readAttribute(cursor, element);
  }
}

function attach(cursor: Cursor, element: XmlElement): void {
  const { current } = cursor;
  if (current) current.children.push(element);
  else if (cursor.root) fail();
  else cursor.root = element;
}

function readStartTag(cursor: Cursor): void {
  const name = /^<([A-Za-z_][^\s=/>]*)/.exec(cursor.text.slice(cursor.position, cursor.position + 512));
  if (!name) fail();
  cursor.count += 1;
  if (cursor.count > MAXIMUM_ELEMENTS) fail();
  const element: XmlElement = {
    name: groupText(name, 1),
    line: cursor.line,
    attributes: new Map(),
    text: "",
    children: [],
    parent: cursor.current,
  };
  advanceTo(cursor, cursor.position + name[0].length);
  const selfClosing = readAttributes(cursor, element);
  attach(cursor, element);
  if (selfClosing) return;

  cursor.current = element;
  let depth = 0;
  for (let walker: XmlElement | undefined = element; walker; walker = walker.parent) depth += 1;
  if (depth > MAXIMUM_DEPTH) fail();
}

/** Reads the next token: text, then one piece of markup. */
function readNext(cursor: Cursor): void {
  const open = cursor.text.indexOf("<", cursor.position);
  if (open === -1) {
    addText(cursor, cursor.text.slice(cursor.position));
    advanceTo(cursor, cursor.text.length);
    return;
  }
  addText(cursor, cursor.text.slice(cursor.position, open));
  advanceTo(cursor, open);

  if (cursor.text.startsWith("<![CDATA[", cursor.position)) readCdata(cursor);
  else if (skipSpecialMarkup(cursor)) return;
  else if (cursor.text.startsWith("</", cursor.position)) readEndTag(cursor);
  else readStartTag(cursor);
}

export function readXml(contents: string): XmlElement | undefined {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return undefined;
  const cursor: Cursor = {
    text: contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents,
    position: 0,
    line: 1,
    count: 0,
    root: undefined,
    current: undefined,
  };
  try {
    while (cursor.position < cursor.text.length) readNext(cursor);
    if (cursor.current || !cursor.root) return undefined;
    return cursor.root;
  } catch (error) {
    if (error instanceof Malformed) return undefined;
    throw error;
  }
}

export function* walk(element: XmlElement): Generator<XmlElement> {
  yield element;
  for (const child of element.children) yield* walk(child);
}

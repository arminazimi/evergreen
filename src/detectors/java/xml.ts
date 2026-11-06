/**
 * A small, bounded XML reader for `pom.xml`.
 *
 * It builds an element tree with the one-based line of each element's text. It reads no external
 * entities and expands none: a `DOCTYPE`, an entity declaration, or an entity reference in text makes the
 * document unreadable, so the caller gets `undefined` rather than a guess. A document that is not
 * well formed (a tag that is not closed or does not match) is also `undefined`.
 */

import { required } from "../../required.js";

export const MAXIMUM_DEPTH = 64;
export const MAXIMUM_ELEMENTS = 50_000;

export interface XmlElement {
  name: string;
  /** Concatenated direct text, trimmed; empty when the element has only children. */
  text: string;
  /** One-based line where the text starts (or the element, when it has no text). */
  line: number;
  children: XmlElement[];
}

const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/;

interface XmlState {
  text: string;
  index: number;
  line: number;
  elements: number;
  stack: XmlElement[];
  textStart: WeakMap<XmlElement, number>;
}

function advance(state: XmlState, to: number): void {
  for (let position = state.index; position < to; position++) {
    if (state.text.charCodeAt(position) === 10) state.line++;
  }
  state.index = to;
}

/** Add the text before the next tag to the open element; false when the document is unreadable. */
function readText(state: XmlState, open: number): boolean {
  const current = required(state.stack.at(-1), "the open element");
  const chunk = state.text.slice(state.index, open < 0 ? state.text.length : open);
  if (chunk.includes("&") || chunk.includes("\0")) return false;
  if (chunk.trim() === "") return true;
  if (state.stack.length === 1) return false;
  if (!state.textStart.has(current)) {
    state.textStart.set(current, state.line + countNewlines(chunk.slice(0, chunk.length - chunk.trimStart().length)));
  }
  current.text += chunk;
  return true;
}

function readComment(state: XmlState): boolean {
  const end = state.text.indexOf("-->", state.index + 4);
  if (end < 0) return false;
  advance(state, end + 3);
  return true;
}

function readCdata(state: XmlState): boolean {
  const end = state.text.indexOf("]]>", state.index + 9);
  if (end < 0) return false;
  const data = state.text.slice(state.index + 9, end);
  if (data.trim() !== "") {
    const current = required(state.stack.at(-1), "the open element");
    if (state.stack.length === 1) return false;
    if (!state.textStart.has(current)) state.textStart.set(current, state.line);
    current.text += data;
  }
  advance(state, end + 3);
  return true;
}

function readProcessingInstruction(state: XmlState): boolean {
  const end = state.text.indexOf("?>", state.index + 2);
  if (end < 0) return false;
  advance(state, end + 2);
  return true;
}

function readCloseTag(state: XmlState): boolean {
  const end = state.text.indexOf(">", state.index);
  if (end < 0) return false;
  const name = state.text.slice(state.index + 2, end).trim();
  const closing = required(state.stack.pop(), "the element to close");
  if (state.stack.length === 0 || closing.name !== name) return false;
  closing.text = closing.text.trim();
  closing.line = state.textStart.get(closing) ?? closing.line;
  advance(state, end + 1);
  return true;
}

function readStartTag(state: XmlState): boolean {
  const end = tagEnd(state.text, state.index + 1);
  if (end < 0) return false;
  const body = state.text.slice(state.index + 1, end);
  const name = NAME.exec(body)?.[0];
  if (!name) return false;
  const selfClosing = body.endsWith("/");
  if (++state.elements > MAXIMUM_ELEMENTS || state.stack.length > MAXIMUM_DEPTH) return false;
  const element: XmlElement = { name, text: "", line: state.line, children: [] };
  required(state.stack.at(-1), "the open element").children.push(element);
  if (!selfClosing) state.stack.push(element);
  advance(state, end + 1);
  return true;
}

/** Read the markup that starts at the current index; false when the document is unreadable. */
function readMarkup(state: XmlState): boolean {
  if (state.text.startsWith("<!--", state.index)) return readComment(state);
  if (state.text.startsWith("<![CDATA[", state.index)) return readCdata(state);
  if (state.text.startsWith("<?", state.index)) return readProcessingInstruction(state);
  if (state.text.startsWith("<!", state.index)) return false;
  if (state.text.startsWith("</", state.index)) return readCloseTag(state);
  return readStartTag(state);
}

export function parseXml(contents: string): XmlElement | undefined {
  const root: XmlElement = { name: "#document", text: "", line: 1, children: [] };
  const state: XmlState = {
    text: contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents,
    index: 0,
    line: 1,
    elements: 0,
    stack: [root],
    textStart: new WeakMap(),
  };

  while (state.index < state.text.length) {
    const open = state.text.indexOf("<", state.index);
    if (!readText(state, open)) return undefined;
    if (open < 0) break;
    advance(state, open);
    if (!readMarkup(state)) return undefined;
  }
  return state.stack.length === 1 && root.children.length === 1 ? root.children[0] : undefined;
}

/** Index of the `>` that closes a start tag, skipping quoted attribute values. */
function tagEnd(text: string, from: number): number {
  let quote = "";
  for (let position = from; position < text.length; position++) {
    const character = text.charAt(position);
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return position;
    } else if (character === "<") {
      return -1;
    }
  }
  return -1;
}

function countNewlines(value: string): number {
  let count = 0;
  for (let index = value.indexOf("\n"); index >= 0; index = value.indexOf("\n", index + 1)) count++;
  return count;
}

/** The first direct child with a name. */
export function child(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((candidate) => candidate.name === name);
}

/** The direct children with a name. */
export function children(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((candidate) => candidate.name === name);
}

/**
 * A small, bounded XML reader for `pom.xml`.
 *
 * It builds an element tree with the one-based line of each element's text. It reads no external
 * entities and expands none: a `DOCTYPE`, an entity declaration, or an entity reference in text makes the
 * document unreadable, so the caller gets `undefined` rather than a guess. A document that is not
 * well formed (a tag that is not closed or does not match) is also `undefined`.
 */

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

export function parseXml(contents: string): XmlElement | undefined {
  const root: XmlElement = { name: "#document", text: "", line: 1, children: [] };
  const stack: XmlElement[] = [root];
  const textStart = new WeakMap<XmlElement, number>();
  let line = 1;
  let elements = 0;
  let index = 0;
  const text = contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents;

  const advance = (to: number): void => {
    for (let position = index; position < to; position++) if (text.charCodeAt(position) === 10) line++;
    index = to;
  };

  while (index < text.length) {
    const open = text.indexOf("<", index);
    const current = stack[stack.length - 1]!;
    const chunk = text.slice(index, open < 0 ? text.length : open);
    if (chunk.includes("&")) return undefined;
    if (chunk.includes("\0")) return undefined;
    if (chunk.trim() !== "") {
      if (stack.length === 1) return undefined;
      if (!textStart.has(current)) textStart.set(current, line + countNewlines(chunk.slice(0, chunk.length - chunk.trimStart().length)));
      current.text += chunk;
    }
    if (open < 0) break;
    advance(open);

    if (text.startsWith("<!--", index)) {
      const end = text.indexOf("-->", index + 4);
      if (end < 0) return undefined;
      advance(end + 3);
    } else if (text.startsWith("<![CDATA[", index)) {
      const end = text.indexOf("]]>", index + 9);
      if (end < 0) return undefined;
      const data = text.slice(index + 9, end);
      if (data.trim() !== "") {
        if (stack.length === 1) return undefined;
        if (!textStart.has(current)) textStart.set(current, line);
        current.text += data;
      }
      advance(end + 3);
    } else if (text.startsWith("<?", index)) {
      const end = text.indexOf("?>", index + 2);
      if (end < 0) return undefined;
      advance(end + 2);
    } else if (text.startsWith("<!", index)) {
      return undefined;
    } else if (text.startsWith("</", index)) {
      const end = text.indexOf(">", index);
      if (end < 0) return undefined;
      const name = text.slice(index + 2, end).trim();
      const closing = stack.pop()!;
      if (stack.length === 0 || closing.name !== name) return undefined;
      closing.text = closing.text.trim();
      closing.line = textStart.get(closing) ?? closing.line;
      advance(end + 1);
    } else {
      const end = tagEnd(text, index + 1);
      if (end < 0) return undefined;
      const body = text.slice(index + 1, end);
      const name = NAME.exec(body)?.[0];
      if (!name) return undefined;
      const selfClosing = body.endsWith("/");
      if (++elements > MAXIMUM_ELEMENTS || stack.length > MAXIMUM_DEPTH) return undefined;
      const element: XmlElement = { name, text: "", line, children: [] };
      current.children.push(element);
      if (!selfClosing) stack.push(element);
      advance(end + 1);
    }
  }
  return stack.length === 1 && root.children.length === 1 ? root.children[0] : undefined;
}

/** Index of the `>` that closes a start tag, skipping quoted attribute values. */
function tagEnd(text: string, from: number): number {
  let quote = "";
  for (let position = from; position < text.length; position++) {
    const character = text[position]!;
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

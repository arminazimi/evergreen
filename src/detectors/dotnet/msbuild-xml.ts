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

function fail(): never {
  throw new Malformed();
}

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

/** The number of newlines before `end` in a matched attribute, so an attribute keeps its own line. */
function leadingNewlines(value: string, end: number): number {
  let count = 0;
  for (const char of value.slice(0, end)) if (char === "\n") count += 1;
  return count;
}

/**
 * A bounded cursor over XML text. Each step of the scan is its own method so the reader stays readable and
 * every branch is separately testable; the state it moves is `position`, `line`, and the open-element stack.
 */
class XmlReader {
  private position = 0;
  private line = 1;
  private count = 0;
  private root: XmlElement | undefined;
  private current: XmlElement | undefined;

  constructor(private readonly text: string) {}

  read(): XmlElement | undefined {
    try {
      this.scan();
      if (this.current || !this.root) return undefined;
      return this.root;
    } catch (error) {
      if (error instanceof Malformed) return undefined;
      throw error;
    }
  }

  private scan(): void {
    while (this.position < this.text.length) {
      const open = this.text.indexOf("<", this.position);
      if (open === -1) {
        this.addText(this.text.slice(this.position));
        this.advance(this.text.length);
        break;
      }
      this.addText(this.text.slice(this.position, open));
      this.advance(open);
      this.readMarkup();
    }
  }

  private readMarkup(): void {
    if (this.text.startsWith("<!--", this.position)) this.advance(this.closing("-->"));
    else if (this.text.startsWith("<![CDATA[", this.position)) this.readCdata();
    else if (this.text.startsWith("<?", this.position)) this.advance(this.closing("?>"));
    else if (this.text.startsWith("<!", this.position)) this.advance(this.closing(">"));
    else if (this.text.startsWith("</", this.position)) this.readEndTag();
    else this.readStartTag();
  }

  private readCdata(): void {
    const end = this.text.indexOf("]]>", this.position);
    if (end === -1) fail();
    const current = this.current ?? fail();
    current.text = `${current.text}${this.text.slice(this.position + 9, end)}`.trim();
    this.advance(end + 3);
  }

  private readEndTag(): void {
    const match = /^<\/([^\s>/]+)\s*>/.exec(this.text.slice(this.position, this.position + 512));
    if (!match) fail();
    const current = this.current;
    if (!current || current.name !== match[1]) fail();
    this.current = current.parent;
    this.advance(this.position + match[0].length);
  }

  private readStartTag(): void {
    const name = /^<([A-Za-z_][^\s=/>]*)/.exec(this.text.slice(this.position, this.position + 512));
    if (!name) fail();
    this.count += 1;
    if (this.count > MAXIMUM_ELEMENTS) fail();
    const element: XmlElement = {
      name: groupText(name, 1),
      line: this.line,
      attributes: new Map(),
      text: "",
      children: [],
      parent: this.current,
    };
    this.advance(this.position + name[0].length);
    this.attach(element, this.readAttributes(element));
  }

  /** Read attributes until `>` or `/>`; true when the element closes itself. */
  private readAttributes(element: XmlElement): boolean {
    for (;;) {
      this.advance(this.position + leadingWhitespace(this.text, this.position));
      if (this.text.startsWith("/>", this.position)) {
        this.advance(this.position + 2);
        return true;
      }
      if (this.text[this.position] === ">") {
        this.advance(this.position + 1);
        return false;
      }
      this.readAttribute(element);
    }
  }

  private readAttribute(element: XmlElement): void {
    const attribute = /^([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(
      this.text.slice(this.position, this.position + 4096),
    );
    if (!attribute) fail();
    const valueLine = this.line + leadingNewlines(this.text.slice(this.position), attribute[0].indexOf("="));
    const key = groupText(attribute, 1).toLowerCase();
    if (element.attributes.has(key)) fail();
    element.attributes.set(key, { value: decode(attribute[2] ?? attribute[3] ?? ""), line: valueLine });
    this.advance(this.position + attribute[0].length);
  }

  private attach(element: XmlElement, selfClosing: boolean): void {
    if (this.current) this.current.children.push(element);
    else if (this.root) fail();
    else this.root = element;

    if (selfClosing) return;
    this.current = element;
    if (this.depth(element) > MAXIMUM_DEPTH) fail();
  }

  private depth(element: XmlElement): number {
    let depth = 0;
    for (let walker: XmlElement | undefined = element; walker; walker = walker.parent) depth += 1;
    return depth;
  }

  private advance(to: number): void {
    for (let index = this.position; index < to; index += 1) if (this.text[index] === "\n") this.line += 1;
    this.position = to;
  }

  private closing(marker: string): number {
    const end = this.text.indexOf(marker, this.position);
    if (end === -1) fail();
    return end + marker.length;
  }

  private addText(value: string): void {
    if (!this.current) {
      if (value.trim() !== "") fail();
      return;
    }
    this.current.text = `${this.current.text}${decode(value)}`.trim();
  }
}

export function readXml(contents: string): XmlElement | undefined {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return undefined;
  const text = contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents;
  return new XmlReader(text).read();
}

export function* walk(element: XmlElement): Generator<XmlElement> {
  yield element;
  for (const child of element.children) yield* walk(child);
}

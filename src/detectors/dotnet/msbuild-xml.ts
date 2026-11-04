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

export function readXml(contents: string): XmlElement | undefined {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return undefined;
  const text = contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents;
  let position = 0;
  let line = 1;
  let count = 0;
  let root: XmlElement | undefined;
  let current: XmlElement | undefined;

  // Annotating the const (not just the return) as `() => never` lets tsc narrow guarded values after `if (...) fail();`.
  const fail: () => never = () => {
    throw new Malformed();
  };
  const advance = (to: number): void => {
    for (let index = position; index < to; index += 1) if (text[index] === "\n") line += 1;
    position = to;
  };
  const closing = (marker: string): number => {
    const end = text.indexOf(marker, position);
    if (end === -1) return fail();
    return end + marker.length;
  };
  const addText = (value: string): void => {
    if (!current) {
      if (value.trim() !== "") fail();
      return;
    }
    current.text = `${current.text}${decode(value)}`.trim();
  };

  try {
    while (position < text.length) {
      const open = text.indexOf("<", position);
      if (open === -1) {
        addText(text.slice(position));
        advance(text.length);
        break;
      }
      addText(text.slice(position, open));
      advance(open);

      if (text.startsWith("<!--", position)) {
        advance(closing("-->"));
      } else if (text.startsWith("<![CDATA[", position)) {
        const end = text.indexOf("]]>", position);
        if (end === -1) fail();
        if (!current) fail();
        current.text = `${current.text}${text.slice(position + 9, end)}`.trim();
        advance(end + 3);
      } else if (text.startsWith("<?", position)) {
        advance(closing("?>"));
      } else if (text.startsWith("<!", position)) {
        advance(closing(">"));
      } else if (text.startsWith("</", position)) {
        const match = /^<\/([^\s>/]+)\s*>/.exec(text.slice(position, position + 512));
        if (!match || !current || current.name !== match[1]) fail();
        current = current.parent;
        advance(position + match[0].length);
      } else {
        const name = /^<([A-Za-z_][^\s=/>]*)/.exec(text.slice(position, position + 512));
        if (!name) fail();
        count += 1;
        if (count > MAXIMUM_ELEMENTS) fail();
        const element: XmlElement = {
          name: groupText(name, 1),
          line,
          attributes: new Map(),
          text: "",
          children: [],
          parent: current,
        };
        advance(position + name[0].length);
        let selfClosing = false;
        for (;;) {
          advance(position + leadingWhitespace(text, position));
          if (text.startsWith("/>", position)) {
            selfClosing = true;
            advance(position + 2);
            break;
          }
          if (text[position] === ">") {
            advance(position + 1);
            break;
          }
          const attribute = /^([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(text.slice(position, position + 4096));
          if (!attribute) fail();
          const valueLine =
            line +
            [...text.slice(position, position + attribute[0].indexOf("="))].filter((char) => char === "\n").length;
          const key = groupText(attribute, 1).toLowerCase();
          if (element.attributes.has(key)) fail();
          element.attributes.set(key, { value: decode(attribute[2] ?? attribute[3] ?? ""), line: valueLine });
          advance(position + attribute[0].length);
        }
        if (current) current.children.push(element);
        else if (root) fail();
        else root = element;
        if (!selfClosing) {
          current = element;
          let depth = 0;
          for (let walker: XmlElement | undefined = current; walker; walker = walker.parent) depth += 1;
          if (depth > MAXIMUM_DEPTH) fail();
        }
      }
    }
    if (current || !root) return undefined;
    return root;
  } catch (error) {
    if (error instanceof Malformed) return undefined;
    throw error;
  }
}

export function* walk(element: XmlElement): Generator<XmlElement> {
  yield element;
  for (const child of element.children) yield* walk(child);
}

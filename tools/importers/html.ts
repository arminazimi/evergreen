// Text extraction for the importers' HTML sources.
//
// This is a small scanner rather than a set of regular expressions: the regex tag filters it replaces
// did not understand closing tags like `</script >`, could stop early on a `>` inside a quoted
// attribute, and decoded entities twice (`&amp;lt;` became `<`). The scanner reads one tag at a time,
// skips quoted attribute values, removes comments and raw-text blocks (script/style) whole, and
// leaves a lone `<` as text.

const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);
const TAG_NAME_START = /[A-Za-z]/;
const TAG_NAME_PART = /[A-Za-z0-9:_-]/;

const NAMED_ENTITIES = new Map<string, string>([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", '"'],
]);

const ENTITY = /&(?:#([0-9]{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{0,31}));/g;

function validCodePoint(value: number): boolean {
  return value >= 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff);
}

/**
 * Decode character references in a single pass, so `&amp;lt;` becomes `&lt;` rather than `<`.
 * Unknown references and code points that are not valid Unicode are left as written.
 */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(ENTITY, (reference, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (decimal !== undefined) {
      const code = Number(decimal);
      return validCodePoint(code) ? String.fromCodePoint(code) : reference;
    }
    if (hex !== undefined) {
      const code = Number.parseInt(hex, 16);
      return validCodePoint(code) ? String.fromCodePoint(code) : reference;
    }
    return NAMED_ENTITIES.get(name!.toLowerCase()) ?? reference;
  });
}

interface Tag {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  /** Index just past the `>`. */
  end: number;
}

/** Read the tag starting at `start`, or return undefined when that `<` is literal text. */
function readTag(html: string, start: number): Tag | undefined {
  let at = start + 1;
  const marker = html.charAt(at);
  if (marker === "!") {
    if (html.startsWith("!--", at)) {
      const close = html.indexOf("-->", at + 3);
      return close === -1 ? undefined : { name: "!", closing: false, selfClosing: true, end: close + 3 };
    }
    const close = html.indexOf(">", at);
    return close === -1 ? undefined : { name: "!", closing: false, selfClosing: true, end: close + 1 };
  }
  if (marker === "?") {
    const close = html.indexOf(">", at);
    return close === -1 ? undefined : { name: "?", closing: false, selfClosing: true, end: close + 1 };
  }
  const closing = marker === "/";
  if (closing) at++;
  if (!TAG_NAME_START.test(html.charAt(at))) return undefined;
  const nameStart = at;
  at++;
  while (TAG_NAME_PART.test(html.charAt(at))) at++;
  const name = html.slice(nameStart, at).toLowerCase();
  let quote = "";
  while (at < html.length) {
    const character = html.charAt(at);
    at++;
    if (quote !== "") {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === ">") return { name, closing, selfClosing: html.charAt(at - 2) === "/", end: at };
    // A new tag cannot start before this one ends; stop so the outer loop can read the next one.
    else if (character === "<") return undefined;
  }
  return undefined;
}

/** Skip a raw-text element (script/style) body up to its closing tag, which may have whitespace before `>`. */
function skipRawText(html: string, from: number, name: string): number {
  let at = from;
  while (at < html.length) {
    const close = html.indexOf("</", at);
    if (close === -1) return html.length;
    const nameEnd = close + 2 + name.length;
    if (html.slice(close + 2, nameEnd).toLowerCase() === name) {
      const boundary = html.charAt(nameEnd);
      if (boundary === "" || boundary === ">" || boundary === "/" || /\s/.test(boundary)) {
        const tag = readTag(html, close);
        return tag ? tag.end : html.length;
      }
    }
    at = close + 2;
  }
  return html.length;
}

/**
 * Remove comments, script/style blocks, and every remaining tag, replacing the removed markup with a
 * space. A `<` that does not start a tag (for example `a < b`) stays as text.
 */
export function stripHtml(html: string): string {
  const parts: string[] = [];
  let at = 0;
  while (at < html.length) {
    const open = html.indexOf("<", at);
    if (open === -1) {
      parts.push(html.slice(at));
      break;
    }
    parts.push(html.slice(at, open));
    const tag = readTag(html, open);
    if (!tag) {
      parts.push("<");
      at = open + 1;
      continue;
    }
    at = tag.end;
    if (!tag.closing && !tag.selfClosing && RAW_TEXT_ELEMENTS.has(tag.name)) at = skipRawText(html, at, tag.name);
    parts.push(" ");
  }
  return parts.join("");
}

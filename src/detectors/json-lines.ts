/**
 * A small, bounded, strict JSON reader that remembers the 1-based line of every key and value, which
 * `JSON.parse` cannot tell us. It accepts a leading byte order mark. Line and block comments are accepted
 * only when `options.comments` is true (for formats such as .NET `global.json` that tolerate them).
 * Callers that parse strict JSON (`vcpkg.json`, `Package.resolved`, `composer.json`) pass
 * `{ comments: false }`. Trailing commas and other non-JSON are always rejected. Nothing is evaluated.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
const MAXIMUM_DEPTH = 64;

export type JsonNode =
  | { kind: "object"; line: number; members: JsonMember[] }
  | { kind: "array"; line: number; items: JsonNode[] }
  | { kind: "string"; line: number; value: string }
  | { kind: "boolean"; line: number; value: boolean }
  | { kind: "other"; line: number };

export interface JsonMember {
  key: string;
  keyLine: number;
  value: JsonNode;
}

class Malformed extends Error {}

export interface ReadJsonLinesOptions {
  /** When true, line and block comments are skipped like whitespace. */
  comments: boolean;
}

const ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};
const LITERAL = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/;

/** One pass over the text with a cursor and a line counter; every method either advances or throws `Malformed`. */
class JsonReader {
  private position = 0;
  private line = 1;

  constructor(
    private readonly text: string,
    private readonly allowComments: boolean,
  ) {}

  readDocument(): JsonNode | undefined {
    const root = this.readValue(0);
    this.skip();
    return this.position === this.text.length ? root : undefined;
  }

  private fail(): never {
    throw new Malformed();
  }

  private skip(): void {
    while (this.skipOne()) {
      // keep consuming whitespace and comments
    }
  }

  /** Consumes one whitespace character or comment; false when the next character starts something else. */
  private skipOne(): boolean {
    const char = this.text[this.position];
    if (char === "\n") {
      this.line += 1;
      this.position += 1;
      return true;
    }
    if (char === " " || char === "\t" || char === "\r") {
      this.position += 1;
      return true;
    }
    if (!this.allowComments || char !== "/") return false;
    const next = this.text[this.position + 1];
    if (next === "/") return this.skipLineComment();
    if (next === "*") return this.skipBlockComment();
    return false;
  }

  private skipLineComment(): boolean {
    while (this.position < this.text.length && this.text[this.position] !== "\n") this.position += 1;
    return true;
  }

  private skipBlockComment(): boolean {
    const end = this.text.indexOf("*/", this.position + 2);
    if (end === -1) return this.fail();
    for (const part of this.text.slice(this.position, end)) if (part === "\n") this.line += 1;
    this.position = end + 2;
    return true;
  }

  private readString(): string {
    this.position += 1; // opening quote
    let value = "";
    for (;;) {
      const char = this.text[this.position];
      if (char === undefined || char === "\n") return this.fail();
      this.position += 1;
      if (char === '"') return value;
      if (char < " ") this.fail();
      value += char === "\\" ? this.readEscape() : char;
    }
  }

  private readEscape(): string {
    const escaped = this.text[this.position];
    this.position += 1;
    if (escaped === undefined) return this.fail();
    const simple = ESCAPES[escaped];
    if (simple !== undefined) return simple;
    const digits = this.text.slice(this.position, this.position + 4);
    if (escaped !== "u" || !/^[0-9a-fA-F]{4}$/.test(digits)) return this.fail();
    this.position += 4;
    return String.fromCharCode(Number.parseInt(digits, 16));
  }

  private readValue(depth: number): JsonNode {
    if (depth > MAXIMUM_DEPTH) return this.fail();
    this.skip();
    const start = this.line;
    const char = this.text[this.position];
    if (char === '"') return { kind: "string", line: start, value: this.readString() };
    if (char === "{") return this.readObject(start, depth);
    if (char === "[") return this.readArray(start, depth);
    return this.readLiteral(start);
  }

  /** After a member or item: consumes a comma (true) or the closing bracket (false); anything else is malformed. */
  private nextOrClose(close: string): boolean {
    this.skip();
    const char = this.text[this.position];
    if (char !== "," && char !== close) return this.fail();
    this.position += 1;
    return char === ",";
  }

  private readObject(start: number, depth: number): JsonNode {
    this.position += 1;
    const members: JsonMember[] = [];
    this.skip();
    if (this.text[this.position] === "}") {
      this.position += 1;
      return { kind: "object", line: start, members };
    }
    do members.push(this.readMember(depth));
    while (this.nextOrClose("}"));
    return { kind: "object", line: start, members };
  }

  private readMember(depth: number): JsonMember {
    this.skip();
    if (this.text[this.position] !== '"') this.fail();
    const keyLine = this.line;
    const key = this.readString();
    this.skip();
    if (this.text[this.position] !== ":") this.fail();
    this.position += 1;
    return { key, keyLine, value: this.readValue(depth + 1) };
  }

  private readArray(start: number, depth: number): JsonNode {
    this.position += 1;
    const items: JsonNode[] = [];
    this.skip();
    if (this.text[this.position] === "]") {
      this.position += 1;
      return { kind: "array", line: start, items };
    }
    do items.push(this.readValue(depth + 1));
    while (this.nextOrClose("]"));
    return { kind: "array", line: start, items };
  }

  private readLiteral(start: number): JsonNode {
    const literal = LITERAL.exec(this.text.slice(this.position, this.position + 64));
    if (!literal) return this.fail();
    this.position += literal[0].length;
    if (literal[0] === "true") return { kind: "boolean", line: start, value: true };
    if (literal[0] === "false") return { kind: "boolean", line: start, value: false };
    return { kind: "other", line: start };
  }
}

/** Returns the root node, or `undefined` for anything that is not valid, bounded JSON. */
export function readJsonLines(contents: string, options: ReadJsonLinesOptions): JsonNode | undefined {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return undefined;
  const text = contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents;
  try {
    return new JsonReader(text, options.comments).readDocument();
  } catch (error) {
    if (error instanceof Malformed) return undefined;
    throw error;
  }
}

/** The member with this key (the last one wins, as in `JSON.parse`). */
export function member(node: JsonNode | undefined, key: string): JsonMember | undefined {
  if (node?.kind !== "object") return undefined;
  return [...node.members].reverse().find((entry) => entry.key === key);
}

/**
 * A small, bounded, strict JSON reader that remembers the 1-based line of every key and value, which
 * `JSON.parse` cannot tell us. It accepts a leading byte order mark and optional `//` / block comments, and
 * rejects everything else that is not JSON, trailing commas included. Nothing is evaluated.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
const MAXIMUM_DEPTH = 64;

export type JsonNode =
  | { kind: "object"; line: number; members: JsonMember[] }
  | { kind: "array"; line: number; items: JsonNode[] }
  | { kind: "string"; line: number; value: string }
  | { kind: "other"; line: number };

export interface JsonMember {
  key: string;
  keyLine: number;
  value: JsonNode;
}

class Malformed extends Error {}

/** Returns the root node, or `undefined` for anything that is not valid, bounded JSON. */
export function readJsonLines(contents: string): JsonNode | undefined {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return undefined;
  const text = contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents;
  let position = 0;
  let line = 1;

  const fail = (): never => {
    throw new Malformed();
  };
  const skip = (): void => {
    for (;;) {
      const char = text[position];
      if (char === "\n") {
        line += 1;
        position += 1;
      } else if (char === " " || char === "\t" || char === "\r") {
        position += 1;
      } else if (char === "/" && text[position + 1] === "/") {
        while (position < text.length && text[position] !== "\n") position += 1;
      } else if (char === "/" && text[position + 1] === "*") {
        const end = text.indexOf("*/", position + 2);
        if (end === -1) fail();
        for (const part of text.slice(position, end)) if (part === "\n") line += 1;
        position = end + 2;
      } else {
        return;
      }
    }
  };
  const readString = (): string => {
    position += 1; // opening quote
    let value = "";
    for (;;) {
      const char = text[position];
      if (char === undefined || char === "\n") return fail();
      position += 1;
      if (char === '"') return value;
      if (char < " ") fail();
      if (char !== "\\") {
        value += char;
        continue;
      }
      const escaped = text[position];
      position += 1;
      const simple: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
      if (escaped !== undefined && simple[escaped] !== undefined) {
        value += simple[escaped];
      } else if (escaped === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(position, position + 4))) {
        value += String.fromCharCode(Number.parseInt(text.slice(position, position + 4), 16));
        position += 4;
      } else {
        fail();
      }
    }
  };
  const readValue = (depth: number): JsonNode => {
    if (depth > MAXIMUM_DEPTH) return fail();
    skip();
    const start = line;
    const char = text[position];
    if (char === '"') return { kind: "string", line: start, value: readString() };
    if (char === "{") {
      position += 1;
      const members: JsonMember[] = [];
      skip();
      if (text[position] === "}") {
        position += 1;
        return { kind: "object", line: start, members };
      }
      for (;;) {
        skip();
        if (text[position] !== '"') fail();
        const keyLine = line;
        const key = readString();
        skip();
        if (text[position] !== ":") fail();
        position += 1;
        members.push({ key, keyLine, value: readValue(depth + 1) });
        skip();
        if (text[position] === ",") {
          position += 1;
        } else if (text[position] === "}") {
          position += 1;
          return { kind: "object", line: start, members };
        } else {
          fail();
        }
      }
    }
    if (char === "[") {
      position += 1;
      const items: JsonNode[] = [];
      skip();
      if (text[position] === "]") {
        position += 1;
        return { kind: "array", line: start, items };
      }
      for (;;) {
        items.push(readValue(depth + 1));
        skip();
        if (text[position] === ",") {
          position += 1;
        } else if (text[position] === "]") {
          position += 1;
          return { kind: "array", line: start, items };
        } else {
          fail();
        }
      }
    }
    const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(position, position + 64));
    if (!literal) return fail();
    position += literal[0].length;
    return { kind: "other", line: start };
  };

  try {
    const root = readValue(0);
    skip();
    if (position !== text.length) return undefined;
    return root;
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

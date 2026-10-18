import { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH, PINNED_RUBY_VERSION } from "./parse-ruby-runtime.js";

/**
 * Pure, bounded parser for the declarations Evergreen reads from a Gemfile.
 *
 * It returns the `ruby` directive and direct gems with a literal version requirement. Unsupported forms return
 * nothing: dynamic values, a gem without a version, `git` and `path` gems, `eval_gemfile`, `gemspec`, and a
 * `ruby` directive with options. The first literal requirement on a `gem` line is returned; further options and
 * requirement strings are ignored. The parser never evaluates contents or runs Bundler.
 */

export { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH };

export interface GemfileRubyDeclaration {
  kind: "ruby";
  /** The pinned runtime, exactly as written. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

export interface GemfileGemDeclaration {
  kind: "gem";
  /** The direct gem's name, exactly as written. */
  name: string;
  /** The literal version requirement, exactly as written. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

export type GemfileDeclaration = GemfileRubyDeclaration | GemfileGemDeclaration;

interface Token {
  value: string;
  quoted: boolean;
}

/** Read literal and bare tokens from one Gemfile line, or undefined for an unterminated string. */
function tokenize(line: string): Token[] | undefined {
  const tokens: Token[] = [];
  let index = 0;
  while (index < line.length) {
    const char = line[index]!;
    if (char === "#") break;
    if (char === "," || /\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      const quote = char;
      let value = "";
      let closed = false;
      index += 1;
      while (index < line.length) {
        const next = line[index]!;
        if (next === "\\") {
          const escaped = line[index + 1];
          if (escaped === undefined) return undefined;
          value += escaped;
          index += 2;
          continue;
        }
        if (next === quote) {
          index += 1;
          closed = true;
          break;
        }
        value += next;
        index += 1;
      }
      if (!closed) return undefined;
      tokens.push({ value, quoted: true });
      continue;
    }
    const start = index;
    while (index < line.length && !/[\s,]/.test(line[index]!)) index += 1;
    tokens.push({ value: line.slice(start, index), quoted: false });
  }
  return tokens;
}

/** A non-empty quoted literal that does not interpolate a value at runtime. */
function literal(token: Token | undefined): token is Token & { quoted: true } {
  return token !== undefined && token.quoted && token.value !== "" && !token.value.includes("#{") && !token.value.includes("${");
}

/** Parse the supported declarations from a Gemfile without file, network, or process I/O. */
export function parseGemfile(contents: string): GemfileDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: GemfileDeclaration[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const tokens = tokenize(rawLine);
    if (!tokens) return [];
    const [first, second, third] = tokens;
    if (!first || first.quoted) continue;
    const line = index + 1;

    if (first.value === "ruby") {
      if (tokens.length === 2 && literal(second) && PINNED_RUBY_VERSION.test(second.value)) {
        declarations.push({ kind: "ruby", value: second.value, line });
      }
      continue;
    }
    if (first.value === "gem") {
      const source = tokens.slice(3).some((token) => !token.quoted && (token.value === "git:" || token.value === "path:"));
      if (!source && literal(second) && literal(third)) {
        declarations.push({ kind: "gem", name: second.value, value: third.value, line });
      }
    }
  }
  return declarations;
}

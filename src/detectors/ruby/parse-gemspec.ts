import { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH } from "./parse-ruby-runtime.js";

/**
 * Pure, bounded parser for `required_ruby_version` in a *.gemspec.
 *
 * It supports a literal assignment such as `spec.required_ruby_version = ">= 3.1.0"` and the common
 * `Gem::Requirement.new(">= 3.1.0")` wrapper. Dynamic values (`ENV[...]`, constants, interpolation), a
 * commented-out assignment, prose, metadata keys, and other gemspec declarations return nothing. An
 * unterminated literal returns nothing for the whole file rather than a partial result. The parser never
 * evaluates contents or runs Ruby.
 */

export { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH };

export interface GemspecRubyVersionDeclaration {
  /** The requirement, exactly as written inside the literal. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

/**
 * Read one quoted literal from the start of `text`. Returns the value and the text after the closing quote,
 * `undefined` when it does not start with a quote, or "malformed" when the quote is never closed.
 */
function literalAt(text: string): { value: string; rest: string } | "malformed" | undefined {
  const quote = text[0];
  if (quote !== '"' && quote !== "'") return undefined;
  let value = "";
  let index = 1;
  while (index < text.length) {
    const char = text[index]!;
    if (char === "\\") {
      const escaped = text[index + 1];
      if (escaped === undefined) return "malformed";
      value += escaped;
      index += 2;
      continue;
    }
    if (char === quote) return { value, rest: text.slice(index + 1) };
    value += char;
    index += 1;
  }
  return "malformed";
}

const ASSIGNMENT = /^\s*[A-Za-z_]\w*\.required_ruby_version\s*=\s*(.*)$/;
const REQUIREMENT_WRAPPER = "Gem::Requirement.new(";

/** Read a supported required_ruby_version expression, or undefined for an unsupported one. */
function assignmentValue(rhs: string): { value: string } | "malformed" | undefined {
  if (rhs.startsWith(REQUIREMENT_WRAPPER)) {
    const literal = literalAt(rhs.slice(REQUIREMENT_WRAPPER.length).trimStart());
    if (literal === "malformed" || literal === undefined) return literal;
    if (!/^\s*\)\s*(?:#.*)?$/.test(literal.rest) || literal.value === "") return undefined;
    return { value: literal.value };
  }
  const literal = literalAt(rhs);
  if (literal === "malformed" || literal === undefined) return literal;
  if (!/^\s*(?:#.*)?$/.test(literal.rest) || literal.value === "") return undefined;
  return { value: literal.value };
}

/** Parse supported gemspec declarations without file, network, or process I/O. */
export function parseGemspec(contents: string): GemspecRubyVersionDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: GemspecRubyVersionDeclaration[] = [];
  let malformed = false;
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const assignment = ASSIGNMENT.exec(rawLine);
    if (!assignment) continue;
    const declaration = assignmentValue(assignment[1]!.trim());
    if (declaration === "malformed") {
      malformed = true;
      continue;
    }
    if (!declaration) continue;
    if (declaration.value.includes("#{") || declaration.value.includes("${")) continue;
    declarations.push({ value: declaration.value, line: index + 1 });
  }
  return malformed ? [] : declarations;
}

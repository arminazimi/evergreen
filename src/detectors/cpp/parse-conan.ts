/**
 * Pure, bounded parsers for the direct requirements Evergreen reads from Conan 2 manifests.
 *
 * `parseConanfileTxt` reads the entries of the `[requires]` section. `parseConanfilePy` reads the `requires`
 * class attribute and literal `self.requires(...)` calls; Conan files are untrusted Python, so the parser only
 * extracts single-line string literals and never evaluates anything.
 *
 * Each declaration reports the package name and the version exactly as written, with the 1-based line of the
 * string. The `@user/channel` and `#revision` parts of a reference are not versions, so they are ignored.
 *
 * Unsupported forms return nothing rather than a guessed value:
 *
 * - dynamic Python: f-strings, byte strings, variables, computed lists, `self.requires(<expression>)`, calls or
 *   tuples that span lines, and string concatenation;
 * - calls whose first argument is not a literal, even when later keyword arguments are static. Keyword
 *   arguments after a literal reference (`self.requires("zlib/1.2.13", headers=True)`) are ignored, because
 *   they cannot change the reference;
 * - declarations produced by a function, a macro, or a conditional expression;
 * - version ranges (`zlib/[>=1.2 <2]`), constraints, and option suffixes in either file;
 * - triple-quoted literals as requirement values, annotated assignments (`requires: list = ...`), and a
 *   `requires` tuple that continues on the next line;
 * - sections other than `[requires]`, including `[build_requires]`, `[tool_requires]`, and `[options]`;
 * - inline comments in conanfile.txt, which Conan does not support as comments.
 *
 * A malformed Python file (an unterminated string literal, including an unterminated docstring at end of file)
 * returns nothing rather than a partial result. Line comments and docstrings are skipped.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface ConanRequirementDeclaration {
  kind: "conan-requirement";
  /** The package name exactly as written, for example `zlib`. */
  name: string;
  /** The version exactly as written, without `@user/channel` or `#revision`, for example `1.2.13`. */
  value: string;
  /** The 1-based source line of the requirement. */
  line: number;
}

export type ConanDeclaration = ConanRequirementDeclaration;

const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.+-]*$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9_.+-]*$/;
const SECTION = /^\[([^[\]]+)\]$/;
const ASSIGNMENT = /^\s*requires\s*=\s*(.*)$/;
const CALL = /self\.requires\s*\(/g;
const MARKER = /^\u0000(\d+)\u0000$/;
const PREFIXES = /^(?:r|u|b|f|rb|br|rf|fr)$/i;

/** The name and the literal version of one Conan reference, or undefined for an unsupported form. */
function requirement(raw: string): { name: string; value: string } | undefined {
  const reference = raw.trim();
  if (reference === "" || /\s/.test(reference) || /[$}{]/.test(reference)) return undefined;
  const slash = reference.indexOf("/");
  if (slash <= 0) return undefined;
  const name = reference.slice(0, slash);
  if (!NAME.test(name)) return undefined;

  let value = reference.slice(slash + 1);
  const channel = value.indexOf("@");
  if (channel >= 0) value = value.slice(0, channel);
  const revision = value.indexOf("#");
  if (revision >= 0) value = value.slice(0, revision);
  if (!VERSION.test(value)) return undefined;
  return { name, value };
}

function declarationAt(reference: { name: string; value: string }, line: number): ConanRequirementDeclaration {
  return { kind: "conan-requirement", name: reference.name, value: reference.value, line };
}

/**
 * Parse the direct requirements in the `[requires]` section of a conanfile.txt. Later sections end the block;
 * files without a `[requires]` section return nothing. A malformed section header is not a `[requires]` header,
 * so the lines under it are not requirements.
 */
export function parseConanfileTxt(contents: string): ConanDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: ConanDeclaration[] = [];
  let inRequires = false;
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const text = rawLine.trim();
    if (text === "" || text.startsWith("#")) continue;
    if (text.startsWith("[")) {
      const section = SECTION.exec(text);
      inRequires = section !== null && section[1]!.trim() === "requires";
      continue;
    }
    if (!inRequires) continue;
    const declaration = requirement(text);
    if (declaration) declarations.push(declarationAt(declaration, index + 1));
  }
  return declarations;
}

interface PythonState {
  /** The delimiter of a triple-quoted string that started on an earlier line, if any. */
  triple: string | undefined;
}

interface ScannedLine {
  /** The line with every string literal replaced by a `\0<n>\0` marker and comments removed. */
  code: string;
  literals: string[];
  dynamic: boolean[];
}

/**
 * Read one Python line, masking strings so code patterns never match inside them. Returns undefined for an
 * unterminated single-line string, which makes the file malformed.
 */
function scanPythonLine(line: string, state: PythonState): ScannedLine | undefined {
  let code = "";
  const literals: string[] = [];
  const dynamic: boolean[] = [];
  let index = 0;

  while (index < line.length) {
    if (state.triple !== undefined) {
      const end = line.indexOf(state.triple, index);
      if (end < 0) return { code, literals, dynamic };
      index = end + state.triple.length;
      state.triple = undefined;
      continue;
    }

    const character = line[index]!;
    if (character === "#") break;
    if (character !== '"' && character !== "'") {
      code += character;
      index += 1;
      continue;
    }

    const triple = line.startsWith(character.repeat(3), index);
    const quote = triple ? character.repeat(3) : character;
    let prefix = "";
    const tail = /([A-Za-z]{1,2})$/.exec(code);
    if (tail && PREFIXES.test(tail[1]!)) {
      prefix = tail[1]!.toLowerCase();
      code = code.slice(0, -tail[1]!.length);
    }

    if (triple) {
      const end = line.indexOf(quote, index + quote.length);
      if (end < 0) {
        state.triple = quote;
        return { code, literals, dynamic };
      }
      index = end + quote.length;
      continue;
    }

    let value = "";
    let closed = false;
    index += 1;
    while (index < line.length) {
      const next = line[index]!;
      if (next === "\\" && !prefix.includes("r")) {
        const escaped = line[index + 1];
        if (escaped === undefined) break;
        value += escaped;
        index += 2;
        continue;
      }
      if (next === character) {
        index += 1;
        closed = true;
        break;
      }
      value += next;
      index += 1;
    }
    if (!closed) return undefined;

    dynamic.push(prefix.includes("f") || prefix.includes("b"));
    literals.push(value);
    code += `\u0000${literals.length - 1}\u0000`;
  }

  return { code, literals, dynamic };
}

/** The literal indices in a comma-separated sequence of string literals, or undefined for any other expression. */
function literalsIn(expression: string): number[] | undefined {
  let text = expression.trim();
  if (text === "") return [];
  if ((text.startsWith("(") && text.endsWith(")")) || (text.startsWith("[") && text.endsWith("]"))) {
    text = text.slice(1, -1).trim();
  }
  if (text === "") return [];

  const indices: number[] = [];
  for (const part of text.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const marker = MARKER.exec(trimmed);
    if (!marker) return undefined;
    indices.push(Number(marker[1]));
  }
  return indices;
}

/** The first argument of a call, or undefined when the argument list is empty. */
function firstArgument(args: string): string | undefined {
  let depth = 0;
  for (let index = 0; index < args.length; index += 1) {
    const character = args[index];
    if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (character === ")" || character === "]" || character === "}") depth -= 1;
    else if (character === "," && depth === 0) return args.slice(0, index);
  }
  return args.trim() === "" ? undefined : args;
}

/** The index of the parenthesis that closes the one at `open`, or undefined when it is not on this line. */
function closingParenthesis(code: string, open: number): number | undefined {
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === "(") depth += 1;
    else if (code[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

/**
 * Parse the direct requirements from a conanfile.py: the `requires` attribute and literal `self.requires(...)`
 * calls. The contents are treated as untrusted text; nothing is executed or imported.
 */
export function parseConanfilePy(contents: string): ConanDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: ConanDeclaration[] = [];
  const state: PythonState = { triple: undefined };
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const line = index + 1;
    const scanned = scanPythonLine(rawLine, state);
    if (!scanned) return [];

    const assignment = ASSIGNMENT.exec(scanned.code);
    if (assignment) {
      const indices = literalsIn(assignment[1]!);
      if (indices) {
        for (const literal of indices) {
          if (scanned.dynamic[literal]) continue;
          const declaration = requirement(scanned.literals[literal] ?? "");
          if (declaration) declarations.push(declarationAt(declaration, line));
        }
      }
    }

    CALL.lastIndex = 0;
    for (let call = CALL.exec(scanned.code); call !== null; call = CALL.exec(scanned.code)) {
      const open = call.index + call[0].length - 1;
      const close = closingParenthesis(scanned.code, open);
      if (close === undefined) continue;
      CALL.lastIndex = close + 1;
      const argument = firstArgument(scanned.code.slice(open + 1, close));
      if (argument === undefined) continue;
      const marker = MARKER.exec(argument.trim());
      if (!marker) continue;
      const literal = Number(marker[1]);
      if (scanned.dynamic[literal]) continue;
      const declaration = requirement(scanned.literals[literal] ?? "");
      if (declaration) declarations.push(declarationAt(declaration, line));
    }
  }

  return state.triple === undefined ? declarations : [];
}

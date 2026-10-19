/**
 * Pure, bounded parser for the declarations Evergreen reads from CMakeLists.txt.
 *
 * It returns the minimum CMake version, the C and C++ language standards, and compiler version checks, each with
 * the 1-based line of its value. Unsupported forms return nothing rather than a partial result:
 *
 * - values built at configure time (`${VAR}`, `$ENV{...}`, `$CACHE{...}`, and generator expressions `$<...>`);
 * - `cmake_minimum_required` without `VERSION` or with the policy range form (`3.16...3.27`);
 * - `set` calls with anything other than the two-argument `set(CMAKE_CXX_STANDARD <integer>)` form, including
 *   `CACHE`, `PARENT_SCOPE`, and `FORCE` options;
 * - compiler checks that do not name both `CMAKE_<LANG>_COMPILER_ID` with `STREQUAL` and
 *   `CMAKE_<LANG>_COMPILER_VERSION` with a `VERSION_*` comparison in the same `if`, or that combine the
 *   conditions with `OR`, `NOT`, `MATCHES`, or a reversed `STREQUAL`;
 * - bracket arguments (`[[...]]`), unquoted arguments that contain spaces, and macros that generate declarations.
 *
 * Line comments and bracket comments (`#[[...]]`, `#[=[...]=]`) are skipped.
 *
 * Commands and quoted arguments may span lines; the reported line is the line the value appears on. Command names
 * are matched case-insensitively, as CMake does, while variable names stay case-sensitive. The parser never
 * evaluates contents or runs CMake.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface CmakeMinimumVersionDeclaration {
  kind: "cmake-minimum-required";
  /** The version exactly as written, for example `3.16`. */
  value: string;
  /** The 1-based source line of the version. */
  line: number;
}

export interface CmakeLanguageStandardDeclaration {
  kind: "language-standard";
  language: "c" | "cxx";
  /** The standard exactly as written, for example `17`. */
  value: string;
  /** The 1-based source line of the standard. */
  line: number;
}

export type CmakeCompilerComparison =
  | "VERSION_LESS"
  | "VERSION_LESS_EQUAL"
  | "VERSION_EQUAL"
  | "VERSION_GREATER_EQUAL"
  | "VERSION_GREATER";

export interface CmakeCompilerCheckDeclaration {
  kind: "compiler-check";
  language: "c" | "cxx";
  /** The compiler id exactly as written, for example `GNU`. */
  compiler: string;
  /** How the compiler version is compared, for example `VERSION_LESS`. */
  comparison: CmakeCompilerComparison;
  /** The compiler version exactly as written, for example `9.3`. */
  value: string;
  /** The 1-based source line of the version. */
  line: number;
}

export type CmakeDeclaration =
  | CmakeMinimumVersionDeclaration
  | CmakeLanguageStandardDeclaration
  | CmakeCompilerCheckDeclaration;

interface Token {
  value: string;
  quoted: boolean;
  line: number;
}

const VERSION = /^[0-9]+(?:\.[0-9]+)*$/;
const LANGUAGE_STANDARD = /^[0-9]+$/;
const COMPILER_ID = /^[A-Za-z][A-Za-z0-9_.+-]*$/;
const COMPARISONS = new Set<string>([
  "VERSION_LESS",
  "VERSION_LESS_EQUAL",
  "VERSION_EQUAL",
  "VERSION_GREATER_EQUAL",
  "VERSION_GREATER",
]);
const STANDARDS: Record<string, "c" | "cxx"> = {
  CMAKE_C_STANDARD: "c",
  CMAKE_CXX_STANDARD: "cxx",
};
const COMPILERS = {
  c: { id: "CMAKE_C_COMPILER_ID", version: "CMAKE_C_COMPILER_VERSION" },
  cxx: { id: "CMAKE_CXX_COMPILER_ID", version: "CMAKE_CXX_COMPILER_VERSION" },
} as const;

/** A value the parser can report: a literal that is not built at configure time. */
function literal(token: Token | undefined): token is Token {
  return token !== undefined && token.value !== "" && !token.value.includes("$");
}

/** The body of a bracket comment starting just after its `#`, or undefined for a line comment. */
function bracketComment(text: string, start: number): { equals: number; body: number } | undefined {
  if (text[start] !== "[") return undefined;
  let index = start + 1;
  let equals = 0;
  while (text[index] === "=") {
    equals += 1;
    index += 1;
  }
  return text[index] === "[" ? { equals, body: index + 1 } : undefined;
}

/**
 * Split CMake source into commands. Returns undefined when the source is malformed: an unterminated quoted
 * argument, an unterminated command, or a closing parenthesis outside a command.
 */
function readCommands(contents: string): Token[][] | undefined {
  const lines = contents.split(/\r?\n/);
  // A single overlong line cannot be read safely; keep its line number but drop its contents.
  const text = lines.map((line) => (line.length > MAXIMUM_LINE_LENGTH ? "" : line)).join("\n");

  const commands: Token[][] = [];
  let tokens: Token[] | undefined;
  // A token read before the opening parenthesis: the command name.
  let pending: Token | undefined;
  let depth = 0;
  let line = 1;
  let index = 0;

  while (index < text.length) {
    const character = text[index]!;
    if (character === "\n") {
      line += 1;
      index += 1;
      continue;
    }
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "#") {
      const bracket = bracketComment(text, index + 1);
      if (bracket) {
        const close = `]${"=".repeat(bracket.equals)}]`;
        const end = text.indexOf(close, bracket.body);
        if (end < 0) return undefined;
        for (let cursor = index; cursor < end + close.length; cursor += 1) {
          if (text[cursor] === "\n") line += 1;
        }
        index = end + close.length;
        continue;
      }
      while (index < text.length && text[index] !== "\n") index += 1;
      continue;
    }
    if (character === "(") {
      if (tokens === undefined) {
        tokens = pending === undefined ? [] : [pending];
        pending = undefined;
        depth = 0;
      } else {
        depth += 1;
      }
      index += 1;
      continue;
    }
    if (character === ")") {
      if (tokens === undefined) return undefined;
      if (depth > 0) {
        depth -= 1;
        index += 1;
        continue;
      }
      commands.push(tokens);
      tokens = undefined;
      index += 1;
      continue;
    }
    if (character === '"') {
      const tokenLine = line;
      let value = "";
      let closed = false;
      index += 1;
      while (index < text.length) {
        const next = text[index]!;
        if (next === "\\") {
          const escaped = text[index + 1];
          if (escaped === undefined) break;
          if (escaped === "\n") line += 1;
          else value += escaped;
          index += 2;
          continue;
        }
        if (next === '"') {
          index += 1;
          closed = true;
          break;
        }
        if (next === "\n") line += 1;
        value += next;
        index += 1;
      }
      if (!closed) return undefined;
      const token: Token = { value, quoted: true, line: tokenLine };
      if (tokens) tokens.push(token);
      else pending = token;
      continue;
    }
    const start = index;
    const tokenLine = line;
    while (index < text.length && !/[\s()"#]/.test(text[index]!)) index += 1;
    if (index === start) {
      // An unexpected character (for example a bracket argument) is not a token we can interpret.
      index += 1;
      continue;
    }
    const token: Token = { value: text.slice(start, index), quoted: false, line: tokenLine };
    if (tokens) tokens.push(token);
    else pending = token;
  }

  return tokens === undefined ? commands : undefined;
}

function cmakeMinimumRequired(args: readonly Token[]): CmakeMinimumVersionDeclaration | undefined {
  const index = args.findIndex((token) => !token.quoted && token.value.toUpperCase() === "VERSION");
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!literal(value) || !VERSION.test(value.value)) return undefined;
  return { kind: "cmake-minimum-required", value: value.value, line: value.line };
}

function languageStandard(args: readonly Token[]): CmakeLanguageStandardDeclaration | undefined {
  if (args.length !== 2) return undefined;
  const [variable, value] = args;
  if (!variable || variable.quoted) return undefined;
  const language = STANDARDS[variable.value];
  if (!language || !literal(value) || !LANGUAGE_STANDARD.test(value.value)) return undefined;
  return { kind: "language-standard", language, value: value.value, line: value.line };
}

function compilerCheck(args: readonly Token[]): CmakeCompilerCheckDeclaration | undefined {
  const words = args.map((token) => (token.quoted ? "" : token.value));
  if (words.includes("OR") || words.includes("NOT") || !words.includes("AND")) return undefined;

  for (const language of ["c", "cxx"] as const) {
    const variables = COMPILERS[language];
    const idIndex = words.indexOf(variables.id);
    if (idIndex < 0) continue;
    const idOperator = words[idIndex + 1];
    const compiler = args[idIndex + 2];
    if (idOperator !== "STREQUAL" || !literal(compiler) || !compiler.quoted || !COMPILER_ID.test(compiler.value)) continue;

    const versionIndex = words.indexOf(variables.version);
    if (versionIndex < 0) continue;
    const comparison = words[versionIndex + 1];
    const value = args[versionIndex + 2];
    if (!comparison || !COMPARISONS.has(comparison) || !literal(value) || !VERSION.test(value.value)) continue;

    return {
      kind: "compiler-check",
      language,
      compiler: compiler.value,
      comparison: comparison as CmakeCompilerComparison,
      value: value.value,
      line: value.line,
    };
  }
  return undefined;
}

/** Parse the supported declarations from CMakeLists.txt without file, network, or process I/O. */
export function parseCmakeLists(contents: string): CmakeDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const commands = readCommands(contents);
  if (!commands) return [];

  const declarations: CmakeDeclaration[] = [];
  for (const tokens of commands) {
    const [head, ...args] = tokens;
    if (!head || head.quoted) continue;
    const name = head.value.toLowerCase();

    if (name === "cmake_minimum_required") {
      const declaration = cmakeMinimumRequired(args);
      if (declaration) declarations.push(declaration);
      continue;
    }
    if (name === "set") {
      const declaration = languageStandard(args);
      if (declaration) declarations.push(declaration);
      continue;
    }
    if (name === "if") {
      const declaration = compilerCheck(args);
      if (declaration) declarations.push(declaration);
    }
  }
  return declarations;
}

import {
  directBlocks,
  MAXIMUM_DECLARATIONS,
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  prepareHcl,
  stringAttributes,
} from "./hcl.js";

/**
 * Pure, bounded parsers for `*.tf` files.
 *
 * `parseTerraformFile` reads, inside a top-level `terraform` block only:
 * - `required_version = "<literal>"`
 * - `<name> = { source = "<literal>", version = "<literal>" }` inside
 *   `required_providers`
 *
 * A value that is a reference (`var.x`, `local.x`), a call, an interpolation,
 * or an empty string returns nothing for that site. Comments, strings that
 * mention a key, and `version` attributes on modules, resources, and variables
 * are not declarations. An unterminated string, comment, or heredoc makes the
 * whole file return nothing, and a block that never closes is skipped.
 *
 * `parseTerraformLegacy` reads two removed or deprecated language forms:
 * interpolation-only strings such as `"${var.name}"` and value calls to the
 * `list()` and `map()` functions removed in Terraform 0.15. Both are read with
 * exact locations; heredocs, comments, and arbitrary string contents are not
 * searched. A `list()` or `map()` type constraint (`type = list(string)`) is a
 * type constructor that still exists and is not a removed function.
 *
 * Neither parser evaluates HCL or runs Terraform.
 */

export { MAXIMUM_INPUT_BYTES } from "./hcl.js";

export interface TerraformRequiredVersionDeclaration {
  kind: "required_version";
  /** The constraint exactly as written, for example `~> 1.9.0`. */
  value: string;
  /** The 1-based line of the constraint string. */
  line: number;
}

export interface TerraformProviderVersionDeclaration {
  kind: "provider_version";
  /** The local name in `required_providers`, for example `aws`. */
  provider: string;
  /** The `source` literal when the provider declares one, for example `hashicorp/aws`. */
  source?: string;
  /** The constraint exactly as written, for example `~> 5.0`. */
  value: string;
  /** The 1-based line of the constraint string. */
  line: number;
}

export type TerraformDeclaration = TerraformRequiredVersionDeclaration | TerraformProviderVersionDeclaration;

/** Parse `required_version` and `required_providers` constraints from a `*.tf` file. */
export function parseTerraformFile(contents: string): TerraformDeclaration[] {
  const hcl = prepareHcl(contents);
  if (!hcl) return [];

  const declarations: TerraformDeclaration[] = [];
  for (const block of directBlocks(hcl, 0, hcl.masked.length)) {
    if (block.name !== "terraform" || block.header.trim() !== "") continue;

    for (const attribute of stringAttributes(hcl, block.bodyStart, block.bodyEnd)) {
      if (attribute.name === "required_version") {
        declarations.push({ kind: "required_version", value: attribute.value, line: attribute.line });
      }
    }

    for (const providers of directBlocks(hcl, block.bodyStart, block.bodyEnd)) {
      if (providers.name !== "required_providers" || providers.header.trim() !== "") continue;
      for (const provider of directBlocks(hcl, providers.bodyStart, providers.bodyEnd)) {
        if (provider.header.trim() !== "=") continue;
        const attributes = stringAttributes(hcl, provider.bodyStart, provider.bodyEnd);
        const source = attributes.find((attribute) => attribute.name === "source")?.value;
        const version = attributes.find((attribute) => attribute.name === "version");
        if (!version) continue;
        declarations.push({
          kind: "provider_version",
          provider: provider.name,
          ...(source === undefined ? {} : { source }),
          value: version.value,
          line: version.line,
        });
      }
    }
    if (declarations.length > MAXIMUM_DECLARATIONS) return declarations.slice(0, MAXIMUM_DECLARATIONS);
  }
  return declarations;
}

export interface TerraformInterpolationOnlyDeclaration {
  kind: "interpolation_only";
  /** Where the string is used; only `value` can lose its quotes without another change. */
  context: "value" | "key" | "label";
  /** The expression inside the single interpolation, trimmed. */
  expression: string;
  /** The whole string literal, quotes included, exactly as written. */
  value: string;
  start: number;
  end: number;
  /** The 1-based line of the opening quote. */
  line: number;
  /** The 1-based column of the opening quote. */
  column: number;
}

export interface TerraformLegacyFunctionDeclaration {
  kind: "legacy_function";
  name: "list" | "map";
  /** The top-level arguments, trimmed, exactly as written. */
  arguments: string[];
  /** True when the call starts and ends on one line. */
  oneLine: boolean;
  start: number;
  end: number;
  /** The 1-based line of the function name. */
  line: number;
  /** The 1-based column of the function name. */
  column: number;
}

export type TerraformLegacyDeclaration = TerraformInterpolationOnlyDeclaration | TerraformLegacyFunctionDeclaration;

interface LineStarts {
  starts: number[];
}

function lineStartsOf(text: string): LineStarts {
  const starts = [0];
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 0x0a) starts.push(index + 1);
  }
  return { starts };
}

/** The 1-based line and column of an offset; `starts` must come from the same text. */
function positionAt(starts: LineStarts, offset: number): { line: number; column: number } {
  let low = 0;
  let high = starts.starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts.starts[middle]! <= offset) low = middle;
    else high = middle - 1;
  }
  return { line: low + 1, column: offset - starts.starts[low]! + 1 };
}

function isIdentifierStart(character: string): boolean {
  return /[A-Za-z_]/.test(character);
}

function isIdentifierPart(character: string): boolean {
  return /[A-Za-z0-9_-]/.test(character);
}

/** Whether the identifier at `index` begins an expression rather than a member or namespace name. */
function isCallStart(masked: string, index: number): boolean {
  return index === 0 || !/[A-Za-z0-9_.:-]/.test(masked[index - 1]!);
}

/** Offset of the `"` that closes the string opened at `open`, including a template's nested quotes. */
function stringEnd(text: string, open: number): number | undefined {
  let index = open + 1;
  while (index < text.length) {
    const character = text[index]!;
    if (character === "\n") return undefined;
    if (character === "\\") {
      index += 2;
      continue;
    }
    if (character === '"') return index;
    if (
      (character === "$" || character === "%") &&
      text[index + 1] === "{" &&
      !(index > open && text[index - 1] === character)
    ) {
      const close = closingBrace(text, index + 1);
      if (close === undefined) return undefined;
      index = close + 1;
      continue;
    }
    index++;
  }
  return undefined;
}

/** Offset of the `}` that closes the `{` at `open`, skipping quoted strings and nested braces. */
function closingBrace(text: string, open: number): number | undefined {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    const character = text[index]!;
    if (character === '"') {
      let end = index + 1;
      while (end < text.length && text[end] !== '"') {
        if (text[end] === "\\") end++;
        end++;
      }
      if (end >= text.length) return undefined;
      index = end;
    } else if (character === "{") {
      depth++;
    } else if (character === "}" && --depth === 0) {
      return index;
    }
  }
  return undefined;
}

interface CallScan {
  /** Offset of the closing `)`. */
  close: number;
  /** Offsets of the commas between the call's top-level arguments. */
  commas: number[];
}

/** Read the call opened at `open`, skipping strings and comments inside its arguments. */
function scanCall(text: string, open: number): CallScan | undefined {
  let depth = 0;
  const commas: number[] = [];
  for (let index = open; index < text.length; index++) {
    const character = text[index]!;
    if (character === '"') {
      const end = stringEnd(text, index);
      if (end === undefined) return undefined;
      index = end;
    } else if (character === "#" || (character === "/" && text[index + 1] === "/")) {
      const end = text.indexOf("\n", index);
      if (end < 0) return undefined;
      index = end;
    } else if (character === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      if (end < 0) return undefined;
      index = end + 1;
    } else if (character === "(") {
      depth++;
    } else if (character === ")" && --depth === 0) {
      return { close: index, commas };
    } else if (character === "," && depth === 1) {
      commas.push(index);
    }
  }
  return undefined;
}

/** True for `list(string)`, `map(object({ ... }))`, and the other type constructors Terraform still reads. */
function isTypeConstraint(_name: "list" | "map", args: readonly string[]): boolean {
  if (args.length !== 1) return false;
  const argument = args[0]!.trim();
  return /^(?:any|bool|number|string)$/.test(argument) || /^(?:list|map|set|object|tuple)\s*\(/.test(argument);
}

/**
 * The expression of a string that is exactly one `${...}` interpolation with no
 * escape and no `%{` directive, or undefined for every other string.
 */
function interpolationExpression(contents: string): string | undefined {
  if (contents.includes("%{") || contents.includes("\\")) return undefined;
  if (!contents.startsWith("${")) return undefined;
  const close = closingBrace(contents, 1);
  if (close !== contents.length - 1) return undefined;
  const expression = contents.slice(2, close).trim();
  return expression === "" ? undefined : expression;
}

/** How a quoted string is used, which decides whether dropping its quotes keeps the file valid. */
function stringContext(text: string, open: number, close: number): "value" | "key" | "label" {
  let after = close + 1;
  while (after < text.length && (text[after] === " " || text[after] === "\t")) after++;
  if (text[after] === "=" && text[after + 1] !== "=") return "key";
  let before = open - 1;
  while (before >= 0 && (text[before] === " " || text[before] === "\t")) before--;
  if (before >= 0 && (isIdentifierPart(text[before]!) || text[before] === '"')) {
    let next = close + 1;
    while (next < text.length && (text[next] === " " || text[next] === "\t")) next++;
    if (text[next] === "{" || text[next] === '"') return "label";
  }
  return "value";
}

/** Add the interpolation-only string opened at `open` when it is exactly one interpolation. */
function readString(
  text: string,
  open: number,
  close: number,
  starts: LineStarts,
  found: TerraformLegacyDeclaration[],
): void {
  const contents = text.slice(open + 1, close);
  const expression = interpolationExpression(contents);
  if (expression !== undefined) {
    const position = positionAt(starts, open);
    found.push({
      kind: "interpolation_only",
      context: stringContext(text, open, close),
      expression,
      value: text.slice(open, close + 1),
      start: open,
      end: close + 1,
      line: position.line,
      column: position.column,
    });
  }
}

/** Add the call whose name begins at `nameStart` and whose `(` is at `open`. */
function readCall(
  text: string,
  open: number,
  nameStart: number,
  name: "list" | "map",
  base: number,
  starts: LineStarts,
  found: TerraformLegacyDeclaration[],
): void {
  const call = scanCall(text, open);
  if (!call) return;
  const args: string[] = [];
  let from = open + 1;
  for (const comma of call.commas) {
    args.push(text.slice(from, comma).trim());
    from = comma + 1;
  }
  args.push(text.slice(from, call.close).trim());
  if (args[args.length - 1] === "") args.pop();
  if (args.some((argument) => argument === "")) return;
  if (isTypeConstraint(name, args)) return;
  const position = positionAt(starts, base + nameStart);
  found.push({
    kind: "legacy_function",
    name,
    arguments: args,
    oneLine: !text.slice(nameStart, call.close + 1).includes("\n"),
    start: base + nameStart,
    end: base + call.close + 1,
    line: position.line,
    column: position.column,
  });
}

/** Find `${...}` and `%{...}` sequences in a quoted template and read the expressions inside them. */
function readTemplate(contents: string, base: number, starts: LineStarts, found: TerraformLegacyDeclaration[]): void {
  let index = 0;
  while (index < contents.length - 1 && found.length < MAXIMUM_DECLARATIONS) {
    const character = contents[index]!;
    if ((character === "$" || character === "%") && contents[index + 1] === "{") {
      if (index > 0 && contents[index - 1] === character) {
        index += 2;
        continue;
      }
      const close = closingBrace(contents, index + 1);
      if (close === undefined) return;
      readExpression(contents.slice(index + 2, close), base + index + 2, starts, found);
      index = close + 1;
    } else {
      index++;
    }
  }
}

/** Read `list()` and `map()` calls inside one expression, skipping its nested quoted strings. */
function readExpression(
  expression: string,
  base: number,
  starts: LineStarts,
  found: TerraformLegacyDeclaration[],
): void {
  let index = 0;
  while (index < expression.length && found.length < MAXIMUM_DECLARATIONS) {
    const character = expression[index]!;
    if (character === '"') {
      const close = stringEnd(expression, index);
      if (close === undefined) return;
      readTemplate(expression.slice(index + 1, close), base + index + 1, starts, found);
      index = close + 1;
    } else if (isIdentifierStart(character)) {
      let nameEnd = index + 1;
      while (nameEnd < expression.length && isIdentifierPart(expression[nameEnd]!)) nameEnd++;
      const name = expression.slice(index, nameEnd);
      if ((name === "list" || name === "map") && expression[nameEnd] === "(" && isCallStart(expression, index)) {
        readCall(expression, nameEnd, index, name as "list" | "map", base, starts, found);
      }
      index = nameEnd;
    } else {
      index++;
    }
  }
}

/** Read one `*.tf` source in order, skipping comments, heredocs, and quoted string contents. */
function readCode(text: string, base: number, starts: LineStarts, found: TerraformLegacyDeclaration[]): void {
  let index = 0;
  while (index < text.length && found.length < MAXIMUM_DECLARATIONS) {
    const character = text[index]!;
    if (character === '"') {
      const close = stringEnd(text, index);
      if (close === undefined) return;
      readString(text, index, close, starts, found);
      readTemplate(text.slice(index + 1, close), base + index + 1, starts, found);
      index = close + 1;
    } else if (character === "#" || (character === "/" && text[index + 1] === "/")) {
      const end = text.indexOf("\n", index);
      if (end < 0) return;
      index = end + 1;
    } else if (character === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      if (end < 0) return;
      index = end + 2;
    } else if (text.startsWith("<<", index) && /^<<-?[A-Za-z_]/.test(text.slice(index, index + 4))) {
      const marker = /^<<-?([A-Za-z_][A-Za-z0-9_]*)/.exec(text.slice(index))![1]!;
      const closer = new RegExp(`\\n[\\t ]*${marker}[\\t ]*(?:\\r?\\n|$)`).exec(text.slice(index));
      if (!closer) return;
      index += closer.index + closer[0].length;
    } else if (isIdentifierStart(character)) {
      let nameEnd = index + 1;
      while (nameEnd < text.length && isIdentifierPart(text[nameEnd]!)) nameEnd++;
      const name = text.slice(index, nameEnd);
      if ((name === "list" || name === "map") && text[nameEnd] === "(" && isCallStart(text, index)) {
        readCall(text, nameEnd, index, name as "list" | "map", base, starts, found);
      }
      index = nameEnd;
    } else {
      index++;
    }
  }
}

/** Bound and normalize a file the same way `prepareHcl` does, without relying on its string scanner. */
function prepareLegacy(contents: string): string | undefined {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return undefined;
  const text = contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents;
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (line.length > MAXIMUM_LINE_LENGTH ? " ".repeat(line.length) : line))
    .join("\n");
}

/** Parse interpolation-only strings and removed `list()` / `map()` calls from a `*.tf` file. */
export function parseTerraformLegacy(contents: string): TerraformLegacyDeclaration[] {
  const text = prepareLegacy(contents);
  if (text === undefined) return [];
  const starts = lineStartsOf(text);
  const found: TerraformLegacyDeclaration[] = [];
  readCode(text, 0, starts, found);
  return found.slice(0, MAXIMUM_DECLARATIONS);
}

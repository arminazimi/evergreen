/**
 * Pure, bounded parser for serverless runtime declarations in Terraform `*.tf` files.
 *
 * Reads literal string assignments on:
 * - `aws_lambda_function.runtime` (direct resource attribute only)
 * - `google_cloudfunctions_function.runtime` (direct resource attribute only)
 * - `google_cloudfunctions2_function.build_config.runtime` (direct attribute of a
 *   top-level `build_config` block)
 * - `azurerm_linux_function_app` / `azurerm_windows_function_app`: version fields on
 *   `application_stack` that sits directly inside `site_config`
 *   (`node_version`, `python_version`, `java_version`, `powershell_core_version`,
 *   `dotnet_version`)
 *
 * Quotes are not part of the value. Nested map keys (`environment.variables`, `tags`,
 * and similar), comments, `data` sources, unrelated resources, `var` / `local` /
 * interpolation values, legacy `azurerm_function_app` `linux_fx_version`, image
 * functions without `runtime`, and heredocs return nothing for that site. An
 * unterminated double-quoted string or comment makes the whole file yield nothing.
 * The parser never evaluates HCL or executes Terraform.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;
export const MAXIMUM_DECLARATIONS = 5000;

const RESOURCE_TYPES = new Set([
  "aws_lambda_function",
  "azurerm_linux_function_app",
  "azurerm_windows_function_app",
  "google_cloudfunctions_function",
  "google_cloudfunctions2_function",
]);

const STACK_KEYS = new Set([
  "node_version",
  "python_version",
  "java_version",
  "powershell_core_version",
  "dotnet_version",
]);

const RESOURCE_KEYWORD = /\bresource\b/g;

export interface RuntimeDeclaration {
  /** The runtime identifier as written, for example `nodejs14.x`. */
  value: string;
  /** One-based line of the attribute value. */
  line: number;
  /** The cloud whose runtime ids apply, when the declaration says so: AWS and Cloud Functions share some ids. */
  platform?: "aws" | "gcp";
}

function blankNonNewlines(text: string): string {
  return text.replace(/[^\n]/g, " ");
}

/**
 * Comments and double-quoted string/heredoc text become spaces; newlines and offsets
 * stay aligned with the source. HCL strings use `"`, so an apostrophe is left alone.
 * Returns undefined when a comment, string, or heredoc is unterminated.
 */
function maskHcl(source: string): string | undefined {
  const chunks: string[] = [];
  let index = 0;

  while (index < source.length) {
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) return undefined;
      chunks.push(blankNonNewlines(source.slice(index, end + 2)));
      index = end + 2;
      continue;
    }
    if (source.startsWith("//", index) || source[index] === "#") {
      const end = source.indexOf("\n", index);
      const stop = end < 0 ? source.length : end;
      chunks.push(blankNonNewlines(source.slice(index, stop)));
      index = stop;
      continue;
    }

    const heredoc = /^<<-?([A-Za-z_][A-Za-z0-9_]*)/.exec(source.slice(index));
    if (heredoc) {
      const marker = heredoc[1]!;
      const start = index;
      index += heredoc[0].length;
      const closer = new RegExp(`\\n[\\t ]*${marker}\\b`);
      const rest = source.slice(index);
      const match = closer.exec(rest);
      if (!match) return undefined;
      const end = index + match.index! + match[0].length;
      chunks.push(blankNonNewlines(source.slice(start, end)));
      index = end;
      continue;
    }

    if (source[index] === '"') {
      let position = index + 1;
      while (position < source.length) {
        const code = source.charCodeAt(position);
        if (code === 0x5c) {
          position += 2;
          continue;
        }
        if (source[position] === '"') {
          chunks.push(blankNonNewlines(source.slice(index, position + 1)));
          index = position + 1;
          break;
        }
        position++;
      }
      if (position >= source.length) return undefined;
      continue;
    }

    const plainStart = index;
    while (index < source.length) {
      const character = source[index]!;
      if (character === "#" || character === '"') break;
      if (character === "/" && (source[index + 1] === "/" || source[index + 1] === "*")) break;
      if (character === "<" && source.startsWith("<<", index)) break;
      index++;
    }
    if (index > plainStart) {
      chunks.push(source.slice(plainStart, index));
    } else {
      // `<<` that the heredoc pattern rejected (for example `<<1`) would otherwise stall here forever.
      index++;
    }
  }

  return chunks.join("");
}

function blankOverlongLines(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > MAXIMUM_LINE_LENGTH ? " ".repeat(line.length) : line))
    .join("\n");
}

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < text.length; index++) {
    if (text.charCodeAt(index) === 0x0a) line++;
  }
  return line;
}

function isWordChar(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_]/.test(character);
}

/** Half-open body span after the opening `{`, or undefined when braces do not close. */
function blockBody(masked: string, openBrace: number): [number, number] | undefined {
  let depth = 1;
  for (let index = openBrace + 1; index < masked.length; index++) {
    const character = masked[index];
    if (character === "{") depth++;
    else if (character === "}" && --depth === 0) return [openBrace + 1, index];
  }
  return undefined;
}

/**
 * Bodies of `name { ... }` blocks that open at relative brace depth 0 inside `[start, end)`.
 * Nested blocks of the same name are skipped.
 */
function directBlocks(masked: string, start: number, end: number, name: string): Array<[number, number]> {
  const blocks: Array<[number, number]> = [];
  const opener = new RegExp(`^${name}\\s*\\{`);
  let depth = 0;
  let index = start;
  while (index < end) {
    const character = masked[index]!;
    if (character === "{") {
      depth++;
      index++;
      continue;
    }
    if (character === "}") {
      depth--;
      index++;
      continue;
    }
    if (depth === 0 && !isWordChar(masked[index - 1]) && opener.test(masked.slice(index))) {
      const match = opener.exec(masked.slice(index))!;
      const openBrace = index + match[0].length - 1;
      if (openBrace >= end) break;
      const body = blockBody(masked, openBrace);
      if (!body || body[1] > end) {
        index++;
        continue;
      }
      blocks.push(body);
      index = body[1] + 1;
      continue;
    }
    index++;
  }
  return blocks;
}

function skipSpaces(source: string, index: number): number {
  while (index < source.length) {
    const code = source.charCodeAt(index);
    if (code === 0x20 || code === 0x09 || code === 0x0d || code === 0x0a) index++;
    else break;
  }
  return index;
}

/** Read a double-quoted string starting at `index`. */
function readQuoted(source: string, index: number): { value: string; end: number; start: number } | undefined {
  if (source[index] !== '"') return undefined;
  let position = index + 1;
  let value = "";
  while (position < source.length) {
    const character = source[position]!;
    if (character === "\n") return undefined;
    if (character === "\\") {
      if (position + 1 >= source.length) return undefined;
      value += source[position + 1]!;
      position += 2;
      continue;
    }
    if (character === '"') return { value, end: position + 1, start: index };
    value += character;
    position++;
  }
  return undefined;
}

/** After a `resource` keyword, read `"type" "name" {` from the original source. */
function resourceHeader(
  source: string,
  afterKeyword: number,
): { type: string; openBrace: number } | undefined {
  let index = skipSpaces(source, afterKeyword);
  const type = readQuoted(source, index);
  if (!type || type.value.length === 0) return undefined;
  index = skipSpaces(source, type.end);
  const name = readQuoted(source, index);
  if (!name) return undefined;
  index = skipSpaces(source, name.end);
  if (source[index] !== "{") return undefined;
  return { type: type.value, openBrace: index };
}

/** Read a quoted string after `=` at `equalsOffset`, or undefined for dynamic / non-string forms. */
function readLiteral(source: string, equalsOffset: number): RuntimeDeclaration | undefined {
  const index = skipSpaces(source, equalsOffset + 1);
  const quoted = readQuoted(source, index);
  if (!quoted) return undefined;
  if (quoted.value.length === 0 || quoted.value.length > MAXIMUM_LINE_LENGTH) return undefined;
  if (quoted.value.includes("${") || quoted.value.includes("%{") || quoted.value.includes("$")) return undefined;
  return { value: quoted.value, line: lineAt(source, quoted.start) };
}

/**
 * Collect `key = "..."` assignments that sit at relative brace depth 0 inside the span.
 * Map values (`= { ... }`) and nested blocks raise the depth, so their keys are ignored.
 */
function collectDirectAttributes(
  source: string,
  masked: string,
  start: number,
  end: number,
  keys: ReadonlySet<string>,
  declarations: RuntimeDeclaration[],
): void {
  const keyList = [...keys];
  let depth = 0;
  let index = start;
  while (index < end) {
    const character = masked[index]!;
    if (character === "{") {
      depth++;
      index++;
      continue;
    }
    if (character === "}") {
      depth--;
      index++;
      continue;
    }
    if (depth !== 0 || isWordChar(masked[index - 1])) {
      index++;
      continue;
    }

    let matched = false;
    for (const key of keyList) {
      const pattern = new RegExp(`^${key}\\s*=`);
      const match = pattern.exec(masked.slice(index));
      if (!match) continue;
      if (declarations.length >= MAXIMUM_DECLARATIONS) return;
      const equals = index + match[0].length - 1;
      if (equals >= end) return;
      const declaration = readLiteral(source, equals);
      if (declaration) declarations.push(declaration);
      index += match[0].length;
      matched = true;
      break;
    }
    if (!matched) index++;
  }
}

/** Parse Terraform serverless runtime declarations without file, network, or process I/O. */
export function parseTf(contents: string): RuntimeDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const maskedRaw = maskHcl(contents);
    if (maskedRaw === undefined) return [];
    const masked = blankOverlongLines(maskedRaw);
    const declarations: RuntimeDeclaration[] = [];

    RESOURCE_KEYWORD.lastIndex = 0;
    for (let match = RESOURCE_KEYWORD.exec(masked); match; match = RESOURCE_KEYWORD.exec(masked)) {
      const header = resourceHeader(contents, match.index + match[0].length);
      if (!header || !RESOURCE_TYPES.has(header.type)) continue;
      const body = blockBody(masked, header.openBrace);
      if (!body) return [];
      const [start, end] = body;
      const firstOfResource = declarations.length;

      if (header.type === "aws_lambda_function" || header.type === "google_cloudfunctions_function") {
        collectDirectAttributes(contents, masked, start, end, new Set(["runtime"]), declarations);
      } else if (header.type === "google_cloudfunctions2_function") {
        for (const block of directBlocks(masked, start, end, "build_config")) {
          collectDirectAttributes(contents, masked, block[0], block[1], new Set(["runtime"]), declarations);
        }
      } else {
        for (const siteConfig of directBlocks(masked, start, end, "site_config")) {
          for (const stack of directBlocks(masked, siteConfig[0], siteConfig[1], "application_stack")) {
            collectDirectAttributes(contents, masked, stack[0], stack[1], STACK_KEYS, declarations);
          }
        }
      }
      const platform = header.type === "aws_lambda_function" ? "aws" : header.type.startsWith("google_") ? "gcp" : undefined;
      if (platform) for (const declaration of declarations.slice(firstOfResource)) declaration.platform = platform;
      if (declarations.length >= MAXIMUM_DECLARATIONS) break;
    }

    return declarations;
  } catch {
    return [];
  }
}

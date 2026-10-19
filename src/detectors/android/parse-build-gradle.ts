/**
 * Pure, bounded parser for Android SDK settings in `build.gradle` and `build.gradle.kts`.
 *
 * Reads only literal assignments inside an `android { ... }` block (including nested
 * `defaultConfig`):
 *
 * - `compileSdk`, `minSdk`, `targetSdk` as a bare or quoted integer (`34`, `"34"`, `= 34`);
 * - `buildToolsVersion` as a quoted version string (`"34.0.0"`).
 *
 * Unsupported / skipped (returns nothing for that site, not an error):
 * - values outside an `android` block;
 * - property references, version-catalog calls, string interpolation (`$`), method calls;
 * - lookalike text inside string literals or comments;
 * - Groovy/Kotlin forms that are not a single literal on one line.
 *
 * An unterminated comment or string makes the file unreadable: the parser returns `[]`.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;
export const MAXIMUM_DECLARATIONS = 5000;

export type AndroidSdkKind = "compileSdk" | "minSdk" | "targetSdk" | "buildToolsVersion";

export interface AndroidSdkDeclaration {
  kind: AndroidSdkKind;
  value: string;
  line: number;
}

interface Scanned {
  /** Source with comments replaced by spaces; line structure unchanged. */
  code: string;
  /** Half-open ranges of string literals in `code`. */
  strings: Array<[number, number]>;
}

/** Blank comments and record string literals; undefined when a comment or string is unterminated. */
function scan(source: string): Scanned | undefined {
  const strings: Array<[number, number]> = [];
  let code = "";
  let index = 0;
  const blank = (text: string) => text.replace(/[^\n]/g, " ");

  while (index < source.length) {
    const rest = source.slice(index, index + 3);
    if (rest.startsWith("//")) {
      const end = source.indexOf("\n", index);
      const stop = end < 0 ? source.length : end;
      code += blank(source.slice(index, stop));
      index = stop;
    } else if (rest.startsWith("/*")) {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) return undefined;
      code += blank(source.slice(index, end + 2));
      index = end + 2;
    } else if (rest === '"""' || rest === "'''") {
      const end = source.indexOf(rest, index + 3);
      if (end < 0) return undefined;
      strings.push([index, end + 3]);
      code += source.slice(index, end + 3);
      index = end + 3;
    } else if (source[index] === '"' || source[index] === "'") {
      const quote = source[index]!;
      let position = index + 1;
      while (position < source.length && source[position] !== quote && source[position] !== "\n") {
        position += source[position] === "\\" ? 2 : 1;
      }
      if (source[position] !== quote) return undefined;
      strings.push([index, position + 1]);
      code += source.slice(index, position + 1);
      index = position + 1;
    } else {
      code += source[index];
      index++;
    }
  }
  return { code, strings };
}

/** Half-open `[start, end)` spans of each `android { ... }` block body (braces inclusive of outer pair). */
function androidBlocks(code: string, insideString: (offset: number) => boolean): Array<[number, number]> {
  const blocks: Array<[number, number]> = [];
  const opener = /\bandroid\b\s*\{/g;
  for (const match of code.matchAll(opener)) {
    if (insideString(match.index!)) continue;
    const openBrace = match.index! + match[0].length - 1;
    let depth = 1;
    let index = openBrace + 1;
    for (; index < code.length && depth > 0; index++) {
      if (insideString(index)) continue;
      if (code[index] === "{") depth++;
      else if (code[index] === "}" && --depth === 0) {
        blocks.push([openBrace, index + 1]);
        break;
      }
    }
  }
  return blocks;
}

function unquote(text: string): string {
  return text.replace(/^["']|["']$/g, "");
}

/** Literal API level (`34`, `"34"`) or undefined when the RHS is dynamic. */
function apiLevelLiteral(raw: string): string | undefined {
  const value = raw.trim().replace(/;+\s*$/, "");
  const match = /^["']?(\d+)["']?$/.exec(value);
  return match?.[1];
}

/** Literal `buildToolsVersion` string or undefined when the RHS is dynamic. */
function buildToolsLiteral(raw: string): string | undefined {
  const value = raw.trim().replace(/;+\s*$/, "");
  const match = /^["'](\d+(?:\.\d+)*)["']$/.exec(value);
  return match?.[1];
}

const ASSIGNMENT =
  /\b(compileSdk|minSdk|targetSdk|buildToolsVersion)\b\s*(?:=\s*)?([^\n;{]+)/g;

/** Parse an Android Gradle build script without file, network, or process I/O. */
export function parseAndroidBuildGradle(contents: string): AndroidSdkDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES || contents.includes("\0")) return [];

  try {
    const scanned = scan(contents);
    if (!scanned) return [];

    const code = scanned.code
      .split("\n")
      .map((line) => (line.length > MAXIMUM_LINE_LENGTH ? " ".repeat(line.length) : line))
      .join("\n");
    const lineStarts = [0];
    for (let index = code.indexOf("\n"); index >= 0; index = code.indexOf("\n", index + 1)) lineStarts.push(index + 1);
    const lineAt = (offset: number): number => {
      let low = 0;
      let high = lineStarts.length - 1;
      while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (lineStarts[mid]! <= offset) low = mid;
        else high = mid - 1;
      }
      return low + 1;
    };
    const insideString = (offset: number) => scanned.strings.some(([start, end]) => offset > start && offset < end);

    const found: AndroidSdkDeclaration[] = [];
    const add = (declaration: AndroidSdkDeclaration | undefined) => {
      if (declaration && found.length < MAXIMUM_DECLARATIONS) found.push(declaration);
    };

    for (const [blockStart, blockEnd] of androidBlocks(code, insideString)) {
      const block = code.slice(blockStart, blockEnd);
      for (const match of block.matchAll(ASSIGNMENT)) {
        const absolute = blockStart + match.index!;
        if (insideString(absolute)) continue;
        const kind = match[1] as AndroidSdkKind;
        const raw = match[2]!.trim();
        if (!raw || raw.includes("$")) continue;
        const value = kind === "buildToolsVersion" ? buildToolsLiteral(raw) : apiLevelLiteral(raw);
        if (value === undefined) continue;
        add({ kind, value, line: lineAt(absolute) });
      }
    }

    return found.sort((left, right) => left.line - right.line || left.kind.localeCompare(right.kind));
  } catch {
    return [];
  }
}

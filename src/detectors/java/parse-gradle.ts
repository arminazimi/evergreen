import { jdkDeclaration } from "./jdk-version.js";
import { required } from "../../required.js";
import type {
  DependencyDeclaration,
  DynamicJdkDeclaration,
  JdkDeclaration,
  JdkRole,
  KotlinPluginDeclaration,
} from "./jdk-version.js";

/**
 * Pure, bounded parser for `build.gradle` and `build.gradle.kts`.
 *
 * A Gradle build script is a program, and Evergreen never evaluates it. This reads only single
 * statements of a few literal forms, outside comments and string literals:
 *
 * - `languageVersion = JavaLanguageVersion.of(N)` and `.set(...)`, and `jvmToolchain(N)` (the toolchain);
 * - `sourceCompatibility` and `targetCompatibility` as `JavaVersion.VERSION_N`, `'N'`, `"N"`, or `N`;
 * - a Kotlin plugin version: `kotlin("jvm") version "X"` or `id("org.jetbrains.kotlin.jvm") version "X"`;
 * - string-notation dependencies such as `implementation("group:artifact:version")`.
 *
 * Anything else (a version catalog, `JavaVersion.toVersion(x)`, a project property, a convention plugin,
 * a string with `$` interpolation in a dependency) is returned as dynamic or skipped. An unterminated
 * comment or string makes the file unreadable and the parser returns nothing.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;
export const MAXIMUM_DECLARATIONS = 5000;

export type GradleDeclaration =
  | JdkDeclaration
  | DynamicJdkDeclaration
  | KotlinPluginDeclaration
  | DependencyDeclaration;

interface Scanned {
  /** The source with comments replaced by spaces; line structure is unchanged. */
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
      const quote = source.charAt(index);
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

const TOOLCHAIN = /(?:languageVersion\s*(?:=|\.set\()\s*JavaLanguageVersion\s*\.\s*of\(|jvmToolchain\()/g;
const COMPATIBILITY = /\b(?:sourceCompatibility|targetCompatibility)\b\s*(?:=|\.set\()?\s*([^\n;]*)/g;
const KOTLIN_PLUGIN =
  /(?:\bkotlin\(\s*["'][A-Za-z0-9.-]+["']\s*\)|\bid\s*\(?\s*["']org\.jetbrains\.kotlin\.[A-Za-z0-9.-]+["']\s*\)?)\s*version\s+["']([^"'$]+)["']/g;
const CONFIGURATION =
  /\b(?:implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly|testCompileOnly|annotationProcessor|kapt|ksp|compile|runtime|testCompile)\s*\(?\s*["']([A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+:[^"'$:@\s]+)(?::[A-Za-z0-9_.-]+)?(?:@[a-z]+)?["']/g;

function unquote(text: string): string {
  return text.replace(/^["']|["']$/g, "");
}

/** A JDK declaration for a literal, or a dynamic one that keeps the expression as written. */
function declare(role: JdkRole, raw: string, literal: string | undefined, line: number): GradleDeclaration | undefined {
  if (literal === undefined) return raw ? { kind: "dynamic", role, value: raw, line } : undefined;
  return jdkDeclaration(role, literal, line);
}

/** The text up to the parenthesis that closes an already-open call, or undefined when it never closes. */
function balancedArgument(code: string, from: number): string | undefined {
  let depth = 1;
  for (let index = from; index < code.length && code[index] !== "\n"; index++) {
    if (code[index] === "(") depth++;
    else if (code[index] === ")" && --depth === 0) return code.slice(from, index).trim();
  }
  return undefined;
}

/** Drop closing parentheses that have no opening one (the end of `.set(17)`). */
function trimUnbalanced(value: string): string {
  let text = value.trim().replace(/\s*,\s*$/, "");
  const count = (character: string) => text.split(character).length - 1;
  while (text.endsWith(")") && count(")") > count("(")) text = text.slice(0, -1).trimEnd();
  return text;
}

/** Every match of `pattern` outside a string literal, with its offset checked instead of asserted with `!`. */
function* locatedMatches(
  code: string,
  pattern: RegExp,
  insideString: (offset: number) => boolean,
): Generator<readonly [number, RegExpMatchArray]> {
  for (const match of code.matchAll(pattern)) {
    const offset = required(match.index, "match offset");
    if (!insideString(offset)) yield [offset, match] as const;
  }
}

/** A literal JDK version text from a compatibility value, or undefined when the value is an expression. */
function compatibilityLiteral(value: string): string | undefined {
  const constant = /^JavaVersion\s*\.\s*VERSION_([0-9_]+)$/.exec(value);
  if (constant) return required(constant[1], "version constant").replace(/_/g, ".");
  const quoted = /^(["'])([0-9.]+)\1$/.exec(value);
  if (quoted) return required(quoted[2], "quoted version");
  return /^[0-9]+(?:\.[0-9]+)?$/.test(value) ? value : undefined;
}

/** Parse a Gradle build script without file, network, or process I/O. */
export function parseGradle(contents: string): GradleDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const scanned = scan(contents);
    if (!scanned) return [];
    // Overlong lines are not read.
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
        if (required(lineStarts[mid], "line start") <= offset) low = mid;
        else high = mid - 1;
      }
      return low + 1;
    };
    const insideString = (offset: number) => scanned.strings.some(([start, end]) => offset > start && offset < end);

    const found: GradleDeclaration[] = [];
    const add = (declaration: GradleDeclaration | undefined) => {
      if (declaration && found.length < MAXIMUM_DECLARATIONS) found.push(declaration);
    };

    for (const [offset, match] of locatedMatches(code, TOOLCHAIN, insideString)) {
      const argument = balancedArgument(code, offset + match[0].length);
      if (argument === undefined) continue;
      const literal = /^["']?[0-9]+["']?$/.test(argument) ? unquote(argument) : undefined;
      add(declare("toolchain", argument, literal, lineAt(offset)));
    }
    for (const [offset, match] of locatedMatches(code, COMPATIBILITY, insideString)) {
      const raw = trimUnbalanced(required(match[1], "compatibility value"));
      if (raw) add(declare("compile-level", raw, compatibilityLiteral(raw), lineAt(offset)));
    }
    for (const [offset, match] of locatedMatches(code, KOTLIN_PLUGIN, insideString)) {
      add({ kind: "kotlin-plugin", value: required(match[1], "kotlin version").trim(), line: lineAt(offset) });
    }
    for (const [offset, match] of locatedMatches(code, CONFIGURATION, insideString)) {
      const [group, artifact, version] = required(match[1], "notation").split(":") as [string, string, string];
      add({ kind: "dependency", group, artifact, version, line: lineAt(offset) });
    }
    return found.sort((left, right) => left.line - right.line);
  } catch {
    return [];
  }
}

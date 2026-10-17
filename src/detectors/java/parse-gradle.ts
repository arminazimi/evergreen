import { jdkDeclaration } from "./jdk-version.js";
import type { DependencyDeclaration, DynamicJdkDeclaration, JdkDeclaration, JdkRole, KotlinPluginDeclaration } from "./jdk-version.js";

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

export type GradleDeclaration = JdkDeclaration | DynamicJdkDeclaration | KotlinPluginDeclaration | DependencyDeclaration;

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

const TOOLCHAIN = /(?:languageVersion\s*(?:=|\.set\()\s*JavaLanguageVersion\s*\.\s*of\(|jvmToolchain\()/g;
const COMPATIBILITY = /\b(?:sourceCompatibility|targetCompatibility)\b\s*(?:=|\.set\()?\s*([^\n;]*)/g;
const KOTLIN_PLUGIN = /(?:\bkotlin\(\s*["'][A-Za-z0-9.-]+["']\s*\)|\bid\s*\(?\s*["']org\.jetbrains\.kotlin\.[A-Za-z0-9.-]+["']\s*\)?)\s*version\s+["']([^"'$]+)["']/g;
const CONFIGURATION = /\b(?:implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly|testCompileOnly|annotationProcessor|kapt|ksp|compile|runtime|testCompile)\s*\(?\s*["']([A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+:[^"'$:@\s]+)(?::[A-Za-z0-9_.-]+)?(?:@[a-z]+)?["']/g;

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

/** A literal JDK version text from a compatibility value, or undefined when the value is an expression. */
function compatibilityLiteral(value: string): string | undefined {
  const constant = /^JavaVersion\s*\.\s*VERSION_([0-9_]+)$/.exec(value);
  if (constant) return constant[1]!.replace(/_/g, ".");
  const quoted = /^(["'])([0-9.]+)\1$/.exec(value);
  if (quoted) return quoted[2]!;
  return /^[0-9]+(?:\.[0-9]+)?$/.test(value) ? value : undefined;
}

/** Parse a Gradle build script without file, network, or process I/O. */
export function parseGradle(contents: string): GradleDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const scanned = scan(contents);
    if (!scanned) return [];
    // Overlong lines are not read.
    const code = scanned.code.split("\n").map((line) => (line.length > MAXIMUM_LINE_LENGTH ? " ".repeat(line.length) : line)).join("\n");
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

    const found: GradleDeclaration[] = [];
    const add = (declaration: GradleDeclaration | undefined) => {
      if (declaration && found.length < MAXIMUM_DECLARATIONS) found.push(declaration);
    };

    for (const match of code.matchAll(TOOLCHAIN)) {
      if (insideString(match.index!)) continue;
      const argument = balancedArgument(code, match.index! + match[0].length);
      if (argument === undefined) continue;
      const literal = /^["']?[0-9]+["']?$/.test(argument) ? unquote(argument) : undefined;
      add(declare("toolchain", argument, literal, lineAt(match.index!)));
    }
    for (const match of code.matchAll(COMPATIBILITY)) {
      if (insideString(match.index!)) continue;
      const raw = trimUnbalanced(match[1]!);
      if (raw) add(declare("compile-level", raw, compatibilityLiteral(raw), lineAt(match.index!)));
    }
    for (const match of code.matchAll(KOTLIN_PLUGIN)) {
      if (insideString(match.index!)) continue;
      add({ kind: "kotlin-plugin", value: match[1]!.trim(), line: lineAt(match.index!) });
    }
    for (const match of code.matchAll(CONFIGURATION)) {
      if (insideString(match.index!)) continue;
      const [group, artifact, version] = match[1]!.split(":") as [string, string, string];
      add({ kind: "dependency", group, artifact, version, line: lineAt(match.index!) });
    }
    return found.sort((left, right) => left.line - right.line);
  } catch {
    return [];
  }
}

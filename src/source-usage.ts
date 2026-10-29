import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  CallUsageMatcher,
  ConfigUsageMatcher,
  ImportUsageMatcher,
  MigrationImpact,
  SourceLanguage,
  SourceUsage,
  SourceUsageAnalysis,
  SourceUsageContract,
} from "./domain.js";
import { relativePosix } from "./paths.js";
import { analyzeJavaScriptFile } from "./usage/javascript.js";
import { analyzePythonFile } from "./usage/python.js";

const ignoredDirectories = new Set([
  ".git",
  ".hg",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "venv",
]);

const maximumFileBytes = 1_000_000;

/** Directory read errors that skip the subtree instead of failing every finding in the scan. */
const skippedReadCodes = new Set(["EACCES", "ENOENT", "ENOTDIR", "EPERM"]);

interface SourceFile {
  absolutePath: string;
  path: string;
  language: SourceLanguage;
}

interface Binding {
  module: string;
  local: string;
  imported: string;
}

interface ImportReference {
  module: string;
  line: number;
  column: number;
  bindings: Binding[];
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function languageFor(path: string): SourceLanguage | undefined {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(extension)) return "javascript";
  if ([".ts", ".tsx", ".mts", ".cts"].includes(extension)) return "typescript";
  if (extension === ".py") return "python";
  if (extension === ".go") return "go";
  if (extension === ".rs") return "rust";
  if (extension === ".cs") return "csharp";
  if (extension === ".java") return "java";
  if (extension === ".kt") return "kotlin";
  if (extension === ".rb" || extension === ".rake" || extension === ".ru") return "ruby";
  if (extension === ".php") return "php";
  if (extension === ".swift") return "swift";
  if (extension === ".dart") return "dart";
  if (extension === ".json") return "json";
  if ([".yaml", ".yml"].includes(extension)) return "yaml";
  if (extension === ".toml") return "toml";
  if ([".ini", ".cfg"].includes(extension)) return "ini";
  return undefined;
}

async function sourceFiles(root: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const walk = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code && skippedReadCodes.has(code)) return;
      throw error;
    }
    // Do not sort directory entries here: usages are sorted by path at the end of analyzeSourceUsage.
    // Skipping localeCompare on huge non-source trees is the large-monorepo win.
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await walk(resolve(directory, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      // Extension check on the basename avoids joining/statting every filler file in a monorepo.
      const language = languageFor(entry.name);
      if (!language) continue;
      const path = resolve(directory, entry.name);
      if ((await stat(path)).size > maximumFileBytes) continue;
      files.push({ absolutePath: path, path: relativePosix(root, path), language });
    }
  };
  await walk(root);
  return files;
}

function javascriptBindings(clause: string, module: string): Binding[] {
  const bindings: Binding[] = [];
  const namespace = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause)?.[1];
  if (namespace) bindings.push({ module, local: namespace, imported: "*" });

  const named = /\{([^}]+)\}/.exec(clause)?.[1];
  for (const entry of named?.split(",") ?? []) {
    const match = /^\s*([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(entry);
    if (match?.[1]) {
      bindings.push({ module, imported: match[1], local: match[2] ?? match[1] });
    }
  }

  const defaultBinding = clause.split(",")[0]?.trim();
  if (defaultBinding && /^[A-Za-z_$][\w$]*$/.test(defaultBinding)) {
    bindings.push({ module, local: defaultBinding, imported: "default" });
  }
  return bindings;
}

function javascriptImports(line: string, lineNumber: number): ImportReference[] {
  const references: ImportReference[] = [];
  const fromPattern = /\bimport\s+(.+?)\s+from\s+["']([^"']+)["']/g;
  for (const match of line.matchAll(fromPattern)) {
    if (!match[1] || !match[2] || match.index === undefined) continue;
    const moduleColumn = line.indexOf(match[2], match.index) + 1;
    references.push({
      module: match[2],
      line: lineNumber,
      column: moduleColumn,
      bindings: javascriptBindings(match[1], match[2]),
    });
  }

  const sideEffectPattern = /\bimport\s+["']([^"']+)["']/g;
  for (const match of line.matchAll(sideEffectPattern)) {
    if (!match[1] || match.index === undefined) continue;
    references.push({
      module: match[1],
      line: lineNumber,
      column: line.indexOf(match[1], match.index) + 1,
      bindings: [],
    });
  }

  const requirePattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of line.matchAll(requirePattern)) {
    if (!match[1] || !match[2] || match.index === undefined) continue;
    references.push({
      module: match[2],
      line: lineNumber,
      column: line.indexOf(match[2], match.index) + 1,
      bindings: [{ module: match[2], local: match[1], imported: "*" }],
    });
  }

  const destructuredPattern = /\b(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of line.matchAll(destructuredPattern)) {
    if (!match[1] || !match[2] || match.index === undefined) continue;
    const bindings = match[1].split(",").flatMap((entry): Binding[] => {
      const binding = /^\s*([A-Za-z_$][\w$]*)(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*$/.exec(entry);
      return binding?.[1]
        ? [{ module: match[2]!, imported: binding[1], local: binding[2] ?? binding[1] }]
        : [];
    });
    references.push({
      module: match[2],
      line: lineNumber,
      column: line.indexOf(match[2], match.index) + 1,
      bindings,
    });
  }

  const dynamicPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of line.matchAll(dynamicPattern)) {
    if (!match[1] || match.index === undefined) continue;
    references.push({
      module: match[1],
      line: lineNumber,
      column: line.indexOf(match[1], match.index) + 1,
      bindings: [],
    });
  }
  return references;
}

function pythonImports(line: string, lineNumber: number): ImportReference[] {
  const references: ImportReference[] = [];
  const direct = /^\s*import\s+([A-Za-z_][\w.]*)(?:\s+as\s+([A-Za-z_]\w*))?/.exec(line);
  if (direct?.[1]) {
    const local = direct[2] ?? direct[1].split(".")[0]!;
    references.push({
      module: direct[1],
      line: lineNumber,
      column: line.indexOf(direct[1]) + 1,
      bindings: [{ module: direct[1], local, imported: "*" }],
    });
  }

  const from = /^\s*from\s+([A-Za-z_][\w.]*)\s+import\s+(.+)$/.exec(line);
  if (from?.[1] && from[2]) {
    const bindings = from[2].split(",").flatMap((entry): Binding[] => {
      const binding = /^\s*([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?\s*$/.exec(entry);
      return binding?.[1]
        ? [{ module: from[1]!, imported: binding[1], local: binding[2] ?? binding[1] }]
        : [];
    });
    references.push({
      module: from[1],
      line: lineNumber,
      column: line.indexOf(from[1]) + 1,
      bindings,
    });
  }
  return references;
}

function moduleMatches(actual: string, expected: string, language: SourceLanguage): boolean {
  if (language === "python") return actual === expected || actual.startsWith(`${expected}.`);
  if (language === "go") return actual === expected || actual.startsWith(`${expected}/`);
  if (language === "java" || language === "kotlin") return actual === expected || actual.startsWith(`${expected}.`);
  if (language === "rust") return actual === expected || actual.startsWith(`${expected}::`);
  if (language === "csharp") return actual === expected || actual.startsWith(`${expected}.`);
  if (language === "ruby") {
    const actualName = actual.replace(/\.rb$/, "");
    const expectedName = expected.replace(/\.rb$/, "");
    return actualName === expectedName || actualName.startsWith(`${expectedName}/`);
  }
  if (language === "php") {
    const normalize = (value: string): string => value.replace(/^\\+/, "").replace(/\.php$/, "");
    const actualName = normalize(actual);
    const expectedName = normalize(expected);
    return actualName === expectedName || actualName.startsWith(`${expectedName}\\`) || actualName.startsWith(`${expectedName}/`);
  }
  if (language === "swift") return actual === expected || actual.startsWith(`${expected}.`);
  return actual === expected;
}

/** Swift module imports, including declaration-specific and underscored attribute forms. */
function swiftImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  const entry = /^\s*(?:(?:@testable|@_exported|@_implementationOnly|@preconcurrency)\s+)?import\s+(?:(?:typealias|struct|class|enum|protocol|let|var|func)\s+)?([A-Za-z_]\w*)/;
  for (const [index, masked] of maskedLines.entries()) {
    const match = entry.exec(masked);
    if (!match?.[1]) continue;
    references.push({
      module: match[1],
      line: index + 1,
      column: lines[index]!.indexOf(match[1]) + 1,
      bindings: [{ module: match[1], local: match[1], imported: "*" }],
    });
  }
  return references;
}

/**
 * Dart `import` directives. The module is the package name of a `package:` URI or the `dart:` library, so
 * relative and `file:` imports name nothing. `as prefix` binds the whole library under the prefix and
 * `show A, B` binds exactly those names; a bare import brings unknown names into scope and binds nothing.
 */
function dartImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  const entry = /^\s*import\s*(['"])((?:package|dart):[^'"]+)\1([^;]*);/;
  for (const [index, masked] of maskedLines.entries()) {
    if (!/^\s*import\b/.test(masked)) continue;
    // A directive may continue on the lines that follow, up to its semicolon.
    let directive = lines[index]!;
    for (let next = index + 1; !directive.includes(";") && next < lines.length && next < index + 8; next += 1) directive += ` ${lines[next]!.trim()}`;
    const match = entry.exec(directive);
    if (!match?.[2]) continue;
    const uri = match[2];
    const module = uri.startsWith("dart:") ? uri : uri.slice("package:".length).split("/")[0]!;
    if (module === "") continue;
    const clauses = (match[3] ?? "").replace(/\/\/.*$/gm, "");
    const bindings: Binding[] = [];
    const prefix = /\b(?:deferred\s+)?as\s+([A-Za-z_]\w*)/.exec(clauses);
    if (prefix?.[1]) {
      bindings.push({ module, local: prefix[1], imported: "*" });
    } else {
      const shown = /\bshow\s+([^;]*?)(?:\bhide\b|$)/.exec(clauses);
      for (const name of shown?.[1]?.split(",") ?? []) {
        const trimmed = name.trim();
        if (/^[A-Za-z_]\w*$/.test(trimmed)) bindings.push({ module, local: trimmed, imported: trimmed });
      }
    }
    references.push({ module, line: index + 1, column: lines[index]!.indexOf("import") + 1, bindings });
  }
  return references;
}

interface SwiftAlias {
  local: string;
  target: string;
}

/** Simple source-level aliases such as `typealias LegacyClient = OldSDK.Client`. */
function swiftAliases(maskedLines: readonly string[]): SwiftAlias[] {
  const aliases: SwiftAlias[] = [];
  const entry = /^\s*(?:public\s+|internal\s+|private\s+|fileprivate\s+)?typealias\s+([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*)/;
  for (const line of maskedLines) {
    const match = entry.exec(line);
    if (!match?.[1] || !match[2]) continue;
    aliases.push({ local: match[1], target: match[2].replace(/\s+/g, "") });
  }
  return aliases;
}

interface RustLeaf {
  /** The path segments of one imported name, such as ["tokio", "sync", "Mutex"]. */
  path: string[];
  alias?: string;
  glob: boolean;
}

/** Splits a `use` tree such as `a::{b, c::d as e, f::*}` into its leaves; undefined when it is not understood. */
function rustUseLeaves(text: string): RustLeaf[] | undefined {
  const tokens = text.match(/::|[{}(),*]|[A-Za-z_][A-Za-z0-9_]*|r#[A-Za-z_][A-Za-z0-9_]*/g);
  if (!tokens) return undefined;
  let position = 0;
  const leaves: RustLeaf[] = [];
  const parse = (prefix: string[]): boolean => {
    const path = [...prefix];
    while (position < tokens.length) {
      const token = tokens[position]!;
      if (token === "::") {
        position += 1;
      } else if (token === "{") {
        position += 1;
        for (;;) {
          if (!parse(path)) return false;
          if (tokens[position] === ",") {
            position += 1;
            if (tokens[position] === "}") break;
            continue;
          }
          break;
        }
        if (tokens[position] !== "}") return false;
        position += 1;
        return true;
      } else if (token === "*") {
        position += 1;
        leaves.push({ path, glob: true });
        return true;
      } else if (/^[A-Za-z_]/.test(token) || token.startsWith("r#")) {
        position += 1;
        if (tokens[position] === "as") {
          const alias = tokens[position + 1];
          if (!alias) return false;
          position += 2;
          leaves.push({ path: [...path, token], alias, glob: false });
          return true;
        }
        path.push(token);
        if (tokens[position] !== "::") {
          leaves.push({ path, glob: false });
          return true;
        }
      } else {
        return false;
      }
    }
    return false;
  };
  return parse([]) && position === tokens.length ? leaves : undefined;
}

/**
 * `use` declarations and `extern crate` items in a Rust file, including statements that span lines. The crate is the
 * first path segment; `crate`, `self`, `super`, and `std`-style local paths are not matched by crate rules, so
 * only the text is recorded. A glob import is an import but binds no name, so calls through it are not guessed.
 */
function rustImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  let index = 0;
  while (index < maskedLines.length) {
    const start = /^\s*(?:pub(?:\([^)]*\))?\s+)?(use|extern\s+crate)\s+(.*)$/.exec(maskedLines[index]!);
    if (!start) {
      index += 1;
      continue;
    }
    let statement = start[2]!;
    const first = index;
    while (!statement.includes(";") && index + 1 < maskedLines.length && index - first < 40) {
      index += 1;
      statement += ` ${maskedLines[index]!.trim()}`;
    }
    index += 1;
    const body = statement.slice(0, statement.indexOf(";") === -1 ? statement.length : statement.indexOf(";")).trim();
    const column = lines[first]!.search(/\S/) + 1;
    if (start[1]!.startsWith("extern")) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/.exec(body);
      if (match?.[1]) references.push({ module: match[1], line: first + 1, column, bindings: [{ module: match[1], local: match[2] ?? match[1], imported: "*" }] });
      continue;
    }
    const leaves = rustUseLeaves(body.replace(/^::/, ""));
    if (!leaves) continue;
    for (const leaf of leaves) {
      const path = leaf.path;
      if (path.length === 0) continue;
      const last = path[path.length - 1]!;
      const whole = path.length === 1 || leaf.glob || last === "self";
      const modulePath = whole ? (last === "self" ? path.slice(0, -1) : path) : path.slice(0, -1);
      if (modulePath.length === 0) continue;
      const module = modulePath.join("::");
      const bindings: Binding[] = leaf.glob
        ? []
        : whole
          ? [{ module, local: leaf.alias ?? modulePath[modulePath.length - 1]!, imported: "*" }]
          : [{ module, local: leaf.alias ?? last, imported: last }];
      references.push({ module, line: first + 1, column, bindings });
    }
  }
  return references;
}

/**
 * `using` directives in a C# file: `using N;`, `global using N;`, `using static N.Type;`, and `using Alias = N;`.
 * A namespace import brings in every type of the namespace, so it binds no name; only an alias binds one. A
 * `using` statement (`using (var x = …)`, `using var x = …`) is not a directive and does not match.
 */
function csharpImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  for (const [index, masked] of maskedLines.entries()) {
    const match = /^\s*(?:global\s+)?using\s+(static\s+)?(?:([A-Za-z_]\w*)\s*=\s*)?([A-Za-z_][\w.]*)\s*;/.exec(masked);
    if (!match?.[3]) continue;
    references.push({
      module: match[3],
      line: index + 1,
      column: lines[index]!.search(/\S/) + 1,
      bindings: match[2] && !match[1] ? [{ module: match[3], local: match[2], imported: "*" }] : [],
    });
  }
  return references;
}

/** The identifier a Go import path binds by default: its last element, skipping a `/vN` major-version suffix. */
function goPackageName(path: string): string {
  const parts = path.split("/");
  let name = parts[parts.length - 1]!;
  if (/^v\d+$/.test(name) && parts.length > 1) name = parts[parts.length - 2]!;
  return name.replace(/^go-/, "").replace(/[.-]go$/, "").replace(/[^A-Za-z0-9_]/g, "_");
}

/**
 * Import declarations in a Go file: single `import "x"` lines and `import ( ... )` groups. Blank (`_`) and dot
 * (`.`) imports are real imports but bind no name, so only the import itself is reported, not calls through it.
 */
function goImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  let inGroup = false;
  const entry = /^\s*(?:import\s+)?(?:([A-Za-z_]\w*|\.)\s+)?"([^"]+)"/;
  for (const [index, masked] of maskedLines.entries()) {
    const line = lines[index]!;
    let candidate: string | undefined;
    if (inGroup) {
      if (/^\s*\)/.test(masked)) {
        inGroup = false;
        continue;
      }
      candidate = line;
    } else if (/^\s*import\s*\(/.test(masked)) {
      inGroup = !/\)\s*$/.test(masked);
      continue;
    } else if (/^\s*import\s+(?:[A-Za-z_]\w*\s+|\.\s+)?"/.test(line) && /^\s*import\b/.test(masked)) {
      candidate = line;
    }
    const match = candidate === undefined ? null : entry.exec(candidate);
    if (!match?.[2]) continue;
    const alias = match[1];
    references.push({
      module: match[2],
      line: index + 1,
      column: line.indexOf(match[2]) + 1,
      bindings: alias === "_" || alias === "." ? [] : [{ module: match[2], local: alias ?? goPackageName(match[2]), imported: "*" }],
    });
  }
  return references;
}

/**
 * Import declarations in a Java or Kotlin file: `import a.b.C;`, `import static a.b.C.m;`, wildcard imports, and
 * Kotlin imports without a semicolon or with `as`. An import binds names, but calls through them are not mapped,
 * so only the import itself is reported.
 */
function jvmImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  const entry = /^\s*import\s+(?:static\s+)?([A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*)(?:\.\*)?/;
  for (const [index, masked] of maskedLines.entries()) {
    if (!/^\s*import\s/.test(masked)) continue;
    const line = lines[index]!;
    const match = entry.exec(line);
    if (!match?.[1]) continue;
    references.push({ module: match[1], line: index + 1, column: line.indexOf(match[1]) + 1, bindings: [] });
  }
  return references;
}

const checkoutIgnoredSegments = new Set(["vendor", "fixtures", "__fixtures__", "testdata"]);

/** Dependency checkouts and fixture trees are not the project's own source. */
function checkoutSourceIgnored(path: string): boolean {
  return path.split("/").some((segment) => checkoutIgnoredSegments.has(segment));
}

interface RubyLiteral {
  value: string;
  end: number;
  column: number;
  interpolated: boolean;
}

/** A single-line string literal starting at `start`, or undefined when the text is not a quoted or percent string. */
function readRubyLiteral(line: string, start: number): RubyLiteral | undefined {
  const quoted = line[start];
  if (quoted === "'" || quoted === '"') {
    let value = "";
    let escaped = false;
    for (let index = start + 1; index < line.length; index += 1) {
      const character = line[index]!;
      if (escaped) {
        value += character;
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (quoted === '"' && character === "#" && line[index + 1] === "{") {
        return { value, end: line.length, column: start + 2, interpolated: true };
      }
      if (character === quoted) return { value, end: index + 1, column: start + 2, interpolated: false };
      value += character;
    }
    return undefined;
  }
  if (quoted !== "%") return undefined;
  let cursor = start + 1;
  const marker = line[cursor];
  let type = "";
  if (marker && /[qQwWrsxiI]/.test(marker)) {
    type = marker;
    cursor += 1;
  }
  const delimiter = line[cursor];
  if (!delimiter) return undefined;
  const closer = delimiter === "(" ? ")" : delimiter === "[" ? "]" : delimiter === "{" ? "}" : delimiter === "<" ? ">" : /[^A-Za-z0-9_\s]/.test(delimiter) ? delimiter : undefined;
  if (!closer || (type !== "" && type !== "q" && type !== "Q" && type !== "s")) return undefined;
  const interpolating = type === "" || type === "Q";
  const paired = closer !== delimiter;
  let depth = 1;
  let value = "";
  for (let index = cursor + 1; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === "\\" && index + 1 < line.length) {
      value += line[index + 1];
      index += 1;
      continue;
    }
    if (interpolating && character === "#" && line[index + 1] === "{") {
      return { value, end: line.length, column: cursor + 2, interpolated: true };
    }
    if (paired && character === delimiter) {
      depth += 1;
      value += character;
      continue;
    }
    if (character === closer) {
      depth -= 1;
      if (depth === 0) return { value, end: index + 1, column: cursor + 2, interpolated: false };
    }
    value += character;
  }
  return undefined;
}

interface RubyInvocation {
  kind: "require" | "load" | "gem" | "autoload" | "require_relative";
  line: number;
  keywordColumn: number;
  reference: string;
  argument: { kind: "literal"; value: string; column: number } | { kind: "dynamic" };
}

const RUBY_MAX_LINE = 4096;
const RUBY_MAX_INVOCATIONS = 10_000;
const RUBY_MAX_REFERENCE = 200;
const RUBY_DEF_LOOKBEHIND = 32;

/**
 * True when the keyword at `index` is a real call site, not a hash key, method receiver, or bare assignment.
 * Argument-start checks use the original `line` because string literals are blanked in `masked`.
 */
function rubyKeywordIsCall(line: string, masked: string, index: number, keywordLength: number): boolean {
  const before = index > 0 ? masked[index - 1] : "";
  if (before === ":" || before === "@" || before === "$") return false;
  let cursor = index + keywordLength;
  const hadSpace = line[cursor] === " " || line[cursor] === "\t";
  while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
  const next = line[cursor];
  // Hash key `load:` has no space before `:`; `autoload :Foo` has whitespace then a symbol.
  if (next === ":") return hadSpace;
  if (next === undefined || next === "." || next === "," || next === "}" || next === ")" || next === ";") return false;
  // Assignment (`gem = …`), but not `==`.
  if (next === "=" && line[cursor + 1] !== "=") return false;
  if (next === "(") return true;
  return next === "'" || next === '"' || next === "%" || next === "/" || /[A-Za-z_$@]/.test(next);
}

/** True when `def` appears immediately before the match within a short look-behind window. */
function rubyKeywordIsMethodDefinition(masked: string, index: number): boolean {
  const start = Math.max(0, index - RUBY_DEF_LOOKBEHIND);
  const window = masked.slice(start, index);
  return /(?:^|\s)def\s+(?:self\s*\.\s*|(?:::)?Kernel\s*\.\s*)?$/.test(window);
}

interface RubyScanSkip {
  line: number;
  column: number;
  reference: string;
  reason: string;
}

interface RubyInvocationScan {
  invocations: RubyInvocation[];
  skips: RubyScanSkip[];
}

const RUBY_INVOCATION_HINT = /(?:^|[^\w.:])(?:(?:::)?Kernel\s*\.\s*)?(?:require_relative|require|load|gem|autoload)\b/;

/**
 * `require`, `load`, `gem`, `autoload`, and `require_relative` on one line. A string literal is a path; a
 * variable, interpolation, concatenation, or method call on the string is dynamic. `JSON.load` and
 * `require_relative` are not `load` or `require`. Lines over 4,096 characters and matches past
 * {@link RUBY_MAX_INVOCATIONS} are not scanned; each is reported in `skips` instead of being dropped.
 */
function rubyInvocations(lines: readonly string[], maskedLines: readonly string[]): RubyInvocationScan {
  const keyword = /(?<![\w.:])(?:(?:::)?Kernel\s*\.\s*)?(require_relative|require|load|gem|autoload)\b/g;
  const invocations: RubyInvocation[] = [];
  const skips: RubyScanSkip[] = [];
  let invocationCapReached = false;
  for (const [index, masked] of maskedLines.entries()) {
    const line = lines[index]!;
    if (line.length > RUBY_MAX_LINE || masked.length > RUBY_MAX_LINE) {
      if (RUBY_INVOCATION_HINT.test(line)) {
        skips.push({
          line: index + 1,
          column: 1,
          reference: line.slice(0, RUBY_MAX_REFERENCE).trim(),
          reason: `line longer than ${RUBY_MAX_LINE} characters`,
        });
      }
      continue;
    }
    keyword.lastIndex = 0;
    for (const match of masked.matchAll(keyword)) {
      if (match.index === undefined || !match[1]) continue;
      const kind = match[1] as RubyInvocation["kind"];
      const keywordLength = match[0].length;
      if (rubyKeywordIsMethodDefinition(masked, match.index)) continue;
      if (!rubyKeywordIsCall(line, masked, match.index, keywordLength)) continue;
      const reference = line.slice(match.index, match.index + RUBY_MAX_REFERENCE).trim();
      if (invocationCapReached || invocations.length >= RUBY_MAX_INVOCATIONS) {
        invocationCapReached = true;
        skips.push({
          line: index + 1,
          column: match.index + 1,
          reference,
          reason: `more than ${RUBY_MAX_INVOCATIONS} invocations in this repository`,
        });
        continue;
      }
      let cursor = match.index + keywordLength;
      while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
      if (line[cursor] === "(") {
        cursor += 1;
        while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
      }
      if (kind === "autoload") {
        const symbol = /^:([A-Za-z_]\w*)/.exec(line.slice(cursor));
        if (!symbol) {
          invocations.push({ kind, line: index + 1, keywordColumn: match.index + 1, reference, argument: { kind: "dynamic" } });
          continue;
        }
        cursor += symbol[0].length;
        while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
        if (line[cursor] !== ",") {
          invocations.push({ kind, line: index + 1, keywordColumn: match.index + 1, reference, argument: { kind: "dynamic" } });
          continue;
        }
        cursor += 1;
        while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
      }
      const literal = readRubyLiteral(line, cursor);
      let after = literal?.end ?? cursor;
      while (line[after] === " " || line[after] === "\t") after += 1;
      const transformed = literal !== undefined && (literal.interpolated || line[after] === "+" || line[after] === "\\" || line[after] === ".");
      invocations.push({
        kind,
        line: index + 1,
        keywordColumn: match.index + 1,
        reference,
        argument: literal && !transformed ? { kind: "literal", value: literal.value, column: literal.column } : { kind: "dynamic" },
      });
    }
  }
  return { invocations, skips };
}

/** `require`/`load`/`gem`/`autoload` of a string. `require_relative` is a local file, not a gem. Bindings stay empty; calls use the rule's qualified target. */
function rubyImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  for (const invocation of rubyInvocations(lines, maskedLines).invocations) {
    if (invocation.argument.kind !== "literal" || invocation.kind === "require_relative") continue;
    const module = invocation.argument.value.replace(/\.rb$/, "");
    if (module.length === 0) continue;
    references.push({ module, line: invocation.line, column: invocation.argument.column, bindings: [] });
  }
  return references;
}

interface RubyAlias {
  local: string;
  target: string;
}

const RUBY_MAX_ALIASES = 256;
const RUBY_MAX_ALIAS_DEPTH = 8;
const RUBY_MAX_RECEIVER_FORMS = 64;

/**
 * Resolve `name` through constant assignments iteratively. Cycles and chains deeper than
 * {@link RUBY_MAX_ALIAS_DEPTH} resolve to nothing (undefined), never throw.
 */
function resolveRubyAlias(name: string, assigned: ReadonlyMap<string, string>, memo: Map<string, string | undefined>): string | undefined {
  if (memo.has(name)) return memo.get(name);

  let current = name;
  let suffix = "";
  const seen = new Set<string>();
  for (let depth = 0; depth < RUBY_MAX_ALIAS_DEPTH; depth += 1) {
    if (seen.has(current)) {
      memo.set(name, undefined);
      return undefined;
    }
    seen.add(current);
    const next = assigned.get(current);
    if (!next) {
      const resolved = `${current}${suffix}`;
      memo.set(name, resolved);
      return resolved;
    }
    const parts = next.split("::");
    if (parts.length > 1) suffix = `::${parts.slice(1).join("::")}${suffix}`;
    current = parts[0]!;
  }
  memo.set(name, undefined);
  return undefined;
}

/** `Parser = JSON` and `parser = ::JSON::Parser`, including an alias of an alias in the same file. */
function rubyAliases(maskedLines: readonly string[]): RubyAlias[] {
  const assigned = new Map<string, string>();
  const pattern = /^\s*([$@]{0,2}[A-Za-z_]\w*)\s*(?:\|\|)?=\s*(?:::)?([A-Z]\w*(?:::[A-Z]\w*)*)\s*$/;
  for (const line of maskedLines) {
    if (assigned.size >= RUBY_MAX_ALIASES) break;
    const match = pattern.exec(line);
    if (!match?.[1] || !match[2]) continue;
    assigned.set(match[1], match[2]);
  }
  const memo = new Map<string, string | undefined>();
  const aliases: RubyAlias[] = [];
  for (const local of assigned.keys()) {
    const target = resolveRubyAlias(local, assigned, memo);
    if (target === undefined || target === local) continue;
    aliases.push({ local, target });
  }
  return aliases;
}

/** Qualified call forms for a target such as `JSON.parse`, plus receivers assigned from that constant. */
function rubyReceivers(target: string, aliases: readonly RubyAlias[]): string[][] {
  const parts = target.split(/::|\./).filter((part) => part.length > 0);
  if (parts.length < 2) return [];
  const forms: string[][] = [parts];
  const seen = new Set<string>([parts.join("\0")]);
  for (const alias of aliases) {
    if (forms.length >= RUBY_MAX_RECEIVER_FORMS) break;
    const aliasParts = alias.target.split("::");
    if (aliasParts.length === 0 || aliasParts.length >= parts.length) continue;
    if (!aliasParts.every((part, index) => part === parts[index])) continue;
    const form = [alias.local, ...parts.slice(aliasParts.length)];
    const key = form.join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    forms.push(form);
  }
  return forms;
}

const PHP_MAX_LINE = 4096;
const PHP_MAX_REFERENCE = 200;
const PHP_MAX_ALIASES = 256;
const PHP_MAX_ALIAS_DEPTH = 8;
const PHP_MAX_RECEIVER_FORMS = 64;
const PHP_DYNAMIC_ARGUMENT_REASON = "the argument is not a string literal, so Evergreen does not attribute it to a package";
const PHP_DYNAMIC_NAME_REASON = "the class or function name is a variable, so Evergreen does not attribute it to a package";

interface PhpLiteral {
  value: string;
  end: number;
  column: number;
  interpolated: boolean;
}

/** A single-line quoted PHP string starting at `start`. Interpolation in double quotes is flagged, not decoded. */
function readPhpLiteral(line: string, start: number): PhpLiteral | undefined {
  const quote = line[start];
  if (quote !== "'" && quote !== '"') return undefined;
  let value = "";
  let escaped = false;
  let interpolated = false;
  for (let index = start + 1; index < line.length; index += 1) {
    const character = line[index]!;
    if (escaped) {
      value += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === quote) return { value, end: index + 1, column: start + 2, interpolated };
    if (quote === '"' && character === "$") interpolated = true;
    value += character;
  }
  return undefined;
}

interface PhpRequire {
  line: number;
  keywordColumn: number;
  reference: string;
  argument: { kind: "literal"; value: string; column: number } | { kind: "dynamic" };
}

interface PhpScanSkip {
  line: number;
  column: number;
  reference: string;
  reason: string;
}

/** `require`, `require_once`, `include`, and `include_once`. A quoted path is literal; anything else is dynamic. */
function phpRequires(lines: readonly string[], maskedLines: readonly string[]): { requires: PhpRequire[]; skips: PhpScanSkip[] } {
  const keyword = /(?<![\w$>-])(require_once|include_once|require|include)\b/g;
  const requires: PhpRequire[] = [];
  const skips: PhpScanSkip[] = [];
  for (const [index, masked] of maskedLines.entries()) {
    const line = lines[index]!;
    if (line.length > PHP_MAX_LINE || masked.length > PHP_MAX_LINE) {
      if (/require|include/.test(masked)) {
        skips.push({
          line: index + 1,
          column: 1,
          reference: line.slice(0, PHP_MAX_REFERENCE).trim(),
          reason: `line longer than ${PHP_MAX_LINE} characters`,
        });
      }
      continue;
    }
    keyword.lastIndex = 0;
    for (const match of masked.matchAll(keyword)) {
      if (match.index === undefined || !match[1]) continue;
      const reference = line.slice(match.index, match.index + PHP_MAX_REFERENCE).trim();
      let cursor = match.index + match[1].length;
      while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
      if (line[cursor] === "(") {
        cursor += 1;
        while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
      }
      const literal = readPhpLiteral(line, cursor);
      let after = literal?.end ?? cursor;
      while (line[after] === " " || line[after] === "\t") after += 1;
      const transformed = literal !== undefined && (literal.interpolated || line[after] === ".");
      requires.push({
        line: index + 1,
        keywordColumn: match.index + 1,
        reference,
        argument: literal && !transformed ? { kind: "literal", value: literal.value, column: literal.column } : { kind: "dynamic" },
      });
    }
  }
  return { requires, skips };
}

/** Quoted `require` / `include` (and `_once`) paths. The matched module is the path, with a trailing `.php` removed. */
function phpImportsFromRequires(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  for (const invocation of phpRequires(lines, maskedLines).requires) {
    if (invocation.argument.kind !== "literal") continue;
    const module = invocation.argument.value.replace(/\.php$/, "");
    if (module.length === 0) continue;
    references.push({ module, line: invocation.line, column: invocation.argument.column, bindings: [] });
  }
  return references;
}

interface PhpAlias {
  local: string;
  target: string;
}

interface PhpUseHit {
  module: string;
  line: number;
  column: number;
}

function phpNormalizeName(value: string): string {
  return value.replace(/^\\+/, "");
}

function phpLastSegment(name: string): string {
  const normalized = phpNormalizeName(name);
  const slash = normalized.lastIndexOf("\\");
  return slash === -1 ? normalized : normalized.slice(slash + 1);
}

function readPhpName(line: string, cursor: number): { raw: string; column: number; end: number } | undefined {
  const match = /^\\?[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)*/.exec(line.slice(cursor));
  if (!match?.[0]) return undefined;
  const raw = match[0];
  const offset = raw.startsWith("\\") ? 1 : 0;
  return { raw, column: cursor + offset + 1, end: cursor + raw.length };
}

function phpWordAt(line: string, cursor: number, word: string): boolean {
  if (!line.startsWith(word, cursor)) return false;
  const after = line[cursor + word.length];
  return after === undefined || !/[\w$]/.test(after);
}

/** One-level `use Prefix\{A, B as C}`. Nested groups are left unread. */
function readPhpGroup(line: string, prefix: string, brace: number): { imports: Array<{ module: string; column: number }>; aliases: Array<{ local: string; target: string }> } | undefined {
  const imports: Array<{ module: string; column: number }> = [];
  const aliases: Array<{ local: string; target: string }> = [];
  let cursor = brace + 1;
  while (cursor < line.length) {
    while (line[cursor] === " " || line[cursor] === "\t" || line[cursor] === ",") cursor += 1;
    if (line[cursor] === "}") return imports.length > 0 ? { imports, aliases } : undefined;
    const name = readPhpName(line, cursor);
    if (!name || name.raw.includes("\\")) return undefined;
    cursor = name.end;
    while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
    let local = name.raw;
    if (phpWordAt(line, cursor, "as")) {
      cursor += 2;
      while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
      const alias = /^[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(cursor));
      if (!alias) return undefined;
      local = alias[0];
      cursor += alias[0].length;
    }
    const module = `${prefix}\\${name.raw}`;
    imports.push({ module, column: name.column });
    aliases.push({ local, target: module });
  }
  return undefined;
}

/** One `use` statement at `start`, or undefined for a closure `use (` or a form this scanner does not understand. */
function readPhpUse(line: string, start: number): { imports: Array<{ module: string; column: number }>; aliases: Array<{ local: string; target: string }> } | undefined {
  let cursor = start + "use".length;
  const skipSpace = (): void => {
    while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
  };
  skipSpace();
  if (line[cursor] === "(") return undefined;
  if (phpWordAt(line, cursor, "function")) {
    cursor += "function".length;
    skipSpace();
  } else if (phpWordAt(line, cursor, "const")) {
    cursor += "const".length;
    skipSpace();
  }
  const name = readPhpName(line, cursor);
  if (!name) return undefined;
  cursor = name.end;
  skipSpace();
  if (line[cursor] === "\\") {
    let look = cursor + 1;
    while (line[look] === " " || line[look] === "\t") look += 1;
    if (line[look] === "{") cursor = look;
  }
  if (line[cursor] === "{") return readPhpGroup(line, phpNormalizeName(name.raw), cursor);
  let local = phpLastSegment(name.raw);
  if (phpWordAt(line, cursor, "as")) {
    cursor += 2;
    skipSpace();
    const alias = /^[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(cursor));
    if (!alias?.[0]) return undefined;
    local = alias[0];
  }
  const module = phpNormalizeName(name.raw);
  if (module.length === 0 || local.length === 0) return undefined;
  return { imports: [{ module, column: name.column }], aliases: [{ local, target: module }] };
}

interface PhpUseScan {
  imports: PhpUseHit[];
  aliases: PhpAlias[];
}

/**
 * Resolve `name` through `use` aliases. A later alias of an alias follows the chain. Cycles and chains
 * deeper than {@link PHP_MAX_ALIAS_DEPTH} resolve to nothing.
 */
function resolvePhpAlias(name: string, assigned: ReadonlyMap<string, string>, memo: Map<string, string | undefined>): string | undefined {
  if (memo.has(name)) return memo.get(name);
  let current = name;
  const seen = new Set<string>();
  for (let depth = 0; depth < PHP_MAX_ALIAS_DEPTH; depth += 1) {
    if (seen.has(current)) {
      memo.set(name, undefined);
      return undefined;
    }
    seen.add(current);
    const exact = assigned.get(current);
    if (exact) {
      current = exact;
      continue;
    }
    const slash = current.indexOf("\\");
    if (slash === -1) {
      memo.set(name, current);
      return current;
    }
    const head = current.slice(0, slash);
    const headTarget = assigned.get(head);
    if (!headTarget) {
      memo.set(name, current);
      return current;
    }
    current = `${headTarget}${current.slice(slash)}`;
  }
  memo.set(name, undefined);
  return undefined;
}

/** `use` imports and the aliases they create, including `use function`, `use const`, and one-level groups. */
function phpUses(lines: readonly string[], maskedLines: readonly string[]): PhpUseScan {
  const keyword = /(?<![\w$>-])use\b/g;
  const assigned = new Map<string, string>();
  const imports: PhpUseHit[] = [];
  for (const [index, masked] of maskedLines.entries()) {
    const line = lines[index]!;
    if (line.length > PHP_MAX_LINE || masked.length > PHP_MAX_LINE) continue;
    keyword.lastIndex = 0;
    for (const match of masked.matchAll(keyword)) {
      if (match.index === undefined || assigned.size >= PHP_MAX_ALIASES) continue;
      const parsed = readPhpUse(line, match.index);
      if (!parsed) continue;
      for (const hit of parsed.imports) imports.push({ module: hit.module, line: index + 1, column: hit.column });
      for (const alias of parsed.aliases) {
        if (assigned.size >= PHP_MAX_ALIASES) break;
        assigned.set(alias.local, alias.target);
      }
    }
  }
  const memo = new Map<string, string | undefined>();
  const aliases: PhpAlias[] = [];
  for (const local of assigned.keys()) {
    const target = resolvePhpAlias(local, assigned, memo);
    if (target === undefined || target === local) continue;
    aliases.push({ local, target });
  }
  return { imports, aliases };
}

interface PhpCallForm {
  kind: "new" | "static";
  receiver: string;
  method?: string;
}

const PHP_CLASS_NAME = /^[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)*$/;

/**
 * Call forms for a target. `Swift_Mailer::newInstance` is a static call; `new Swift_Mailer` is a constructor.
 * A `use` alias of that class, or of a namespace prefix, is another receiver. An alias of an alias is already resolved.
 */
function phpCallForms(target: string, aliases: readonly PhpAlias[]): PhpCallForm[] {
  let kind: PhpCallForm["kind"];
  let className: string;
  let method: string | undefined;
  if (target.startsWith("new ")) {
    kind = "new";
    className = phpNormalizeName(target.slice("new ".length).trim());
    if (!PHP_CLASS_NAME.test(className)) return [];
  } else {
    const split = target.lastIndexOf("::");
    if (split <= 0) return [];
    kind = "static";
    className = phpNormalizeName(target.slice(0, split));
    method = target.slice(split + 2);
    if (!PHP_CLASS_NAME.test(className) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(method)) return [];
  }
  const formFor = (receiver: string): PhpCallForm => (method === undefined ? { kind, receiver } : { kind, receiver, method });
  const forms: PhpCallForm[] = [formFor(className)];
  const seen = new Set<string>([`${kind}\0${className}\0${method ?? ""}`]);
  for (const alias of aliases) {
    if (forms.length >= PHP_MAX_RECEIVER_FORMS) break;
    let receiver: string | undefined;
    if (alias.target === className) receiver = alias.local;
    else if (className.startsWith(`${alias.target}\\`)) receiver = `${alias.local}${className.slice(alias.target.length)}`;
    if (!receiver || !PHP_CLASS_NAME.test(receiver)) continue;
    const key = `${kind}\0${receiver}\0${method ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    forms.push(formFor(receiver));
  }
  return forms;
}

function phpCallPattern(forms: readonly PhpCallForm[]): RegExp {
  const ordered = [...forms].sort((left, right) => right.receiver.length - left.receiver.length);
  const parts = ordered.map((form) => {
    const receiver = form.receiver.split("\\").map((segment) => escapePattern(segment)).join("\\\\");
    if (form.kind === "new") return `new\\s+\\\\?${receiver}(?![\\w\\\\:])`;
    return `\\\\?${receiver}\\s*::\\s*${escapePattern(form.method!)}\\s*\\(`;
  });
  return new RegExp(`(?<![\\w$\\\\])(?:${parts.join("|")})`, "g");
}

interface PhpDynamicHit {
  line: number;
  column: number;
  reference: string;
  reason: string;
}

/** `new $class` and `$class::method()`. A static `use` or a quoted require is not dynamic. */
function phpVariableCalls(lines: readonly string[], maskedLines: readonly string[]): PhpDynamicHit[] {
  const variableNew = /(?<![\w$\\])new\s+\$[A-Za-z_][A-Za-z0-9_]*/g;
  const variableStatic = /(?<![\w$\\])\$[A-Za-z_][A-Za-z0-9_]*\s*::\s*[A-Za-z_][A-Za-z0-9_]*\s*\(/g;
  const found: PhpDynamicHit[] = [];
  for (const [index, masked] of maskedLines.entries()) {
    const line = lines[index]!;
    if (line.length > PHP_MAX_LINE || masked.length > PHP_MAX_LINE) {
      if (/new\s+\$|\$[A-Za-z_][A-Za-z0-9_]*\s*::/.test(masked)) {
        found.push({
          line: index + 1,
          column: 1,
          reference: line.slice(0, PHP_MAX_REFERENCE).trim(),
          reason: `line longer than ${PHP_MAX_LINE} characters`,
        });
      }
      continue;
    }
    for (const pattern of [variableNew, variableStatic]) {
      pattern.lastIndex = 0;
      for (const match of masked.matchAll(pattern)) {
        if (match.index === undefined) continue;
        found.push({
          line: index + 1,
          column: match.index + 1,
          reference: line.slice(match.index, match.index + match[0].length).trim(),
          reason: PHP_DYNAMIC_NAME_REASON,
        });
      }
    }
  }
  return found;
}

interface RubyPercentState {
  kind: "percent";
  delimiter: string;
  closer: string;
  paired: boolean;
  depth: number;
}

interface RubyQuoteState {
  kind: "quote";
  quote: string;
  escaped: boolean;
}

type RubyOpenString = RubyPercentState | RubyQuoteState;

/** Open a Ruby percent literal at `index`, or undefined when the text is not one. */
function rubyPercentOpen(line: string, index: number): RubyPercentState | undefined {
  if (line[index] !== "%") return undefined;
  let cursor = index + 1;
  const marker = line[cursor];
  if (marker && /[qQwWrsxiI]/.test(marker)) cursor += 1;
  const delimiter = line[cursor];
  if (!delimiter) return undefined;
  const closer = delimiter === "(" ? ")" : delimiter === "[" ? "]" : delimiter === "{" ? "}" : delimiter === "<" ? ">" : /[^A-Za-z0-9_\s]/.test(delimiter) ? delimiter : undefined;
  if (!closer) return undefined;
  return { kind: "percent", delimiter, closer, paired: closer !== delimiter, depth: 1 };
}

/**
 * Advance through a percent literal body starting at `from`. Returns the index of the closer when it
 * closes on this line, or undefined when it stays open (caller should keep `state` for the next line).
 */
function rubyPercentClose(line: string, from: number, state: RubyPercentState): number | undefined {
  for (let position = from; position < line.length; position += 1) {
    const character = line[position]!;
    if (character === "\\" && position + 1 < line.length) {
      position += 1;
      continue;
    }
    if (state.paired && character === state.delimiter) state.depth += 1;
    else if (character === state.closer) {
      state.depth -= 1;
      if (state.depth === 0) return position;
    }
  }
  return undefined;
}

/** True when `/` at `index` can start a regexp rather than division. */
function rubyRegexMayStart(line: string, index: number): boolean {
  let prev = index - 1;
  while (prev >= 0 && (line[prev] === " " || line[prev] === "\t")) prev -= 1;
  if (prev < 0) return true;
  const character = line[prev]!;
  if (/[\w$)\]]/.test(character)) return false;
  return true;
}

/** End index of a `/.../` regexp starting at `start`, including trailing flags; undefined if unclosed. */
function rubyRegexEnd(line: string, start: number): number | undefined {
  let escaped = false;
  for (let index = start + 1; index < line.length; index += 1) {
    const character = line[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "/") {
      let end = index;
      while (end + 1 < line.length && /[a-z]/.test(line[end + 1]!)) end += 1;
      return end;
    }
  }
  return undefined;
}

interface MaskState {
  blockComment: boolean;
  /** Swift permits nested block comments; the boolean alone cannot preserve their depth. */
  swiftBlockCommentDepth?: number;
  rubyBlock?: boolean;
  heredoc?: string;
  /** Set when a line that is exactly `__END__` has been seen; the rest of the file is data. */
  afterEnd?: boolean;
  /** Unclosed single-quoted, double-quoted, or percent string carried across lines. */
  openString?: RubyOpenString;
  /** Swift multiline string literal opened by three double quotes. */
  swiftMultilineString?: boolean;
  /** C# verbatim string (`@"…"`) left open at the end of a line; it may span lines. */
  csharpVerbatim?: boolean;
}

/**
 * Index of the quote that closes a C# verbatim string whose body starts at `from`, or undefined if it stays open.
 * A verbatim string has no backslash escapes; a doubled quote (`""`) is a literal quote.
 */
function csharpVerbatimEnd(line: string, from: number): number | undefined {
  for (let index = from; index < line.length; index += 1) {
    if (line[index] !== '"') continue;
    if (line[index + 1] === '"') {
      index += 1;
      continue;
    }
    return index;
  }
  return undefined;
}

function maskCodeLine(line: string, language: SourceLanguage, state: MaskState): string {
  if (language === "ruby" && state.afterEnd) return " ".repeat(line.length);
  if (language === "ruby" && line === "__END__") {
    state.afterEnd = true;
    return " ".repeat(line.length);
  }
  if (language === "ruby" && state.heredoc) {
    if (line.trim() === state.heredoc) delete state.heredoc;
    return " ".repeat(line.length);
  }
  if (language === "ruby" && state.rubyBlock) {
    if (/^=end\b/.test(line)) state.rubyBlock = false;
    return " ".repeat(line.length);
  }
  if (language === "ruby" && /^=begin\b/.test(line)) {
    state.rubyBlock = true;
    return " ".repeat(line.length);
  }
  if (language === "php" && state.heredoc) {
    const trimmed = line.trim();
    if (trimmed === state.heredoc || trimmed === `${state.heredoc};`) delete state.heredoc;
    return " ".repeat(line.length);
  }
  // Fast path: no quotes, comments, percent literals, heredocs, character literals, or regexps to mask.
  if (language === "ruby" && !state.blockComment && !state.openString && !/[#"'%`<\/?]/.test(line)) return line;

  const output = [...line];
  let quote: string | undefined = state.openString?.kind === "quote" ? state.openString.quote : undefined;
  let escaped = state.openString?.kind === "quote" ? state.openString.escaped : false;
  let percent = state.openString?.kind === "percent" ? { ...state.openString } : undefined;
  if (language === "ruby" || language === "php") delete state.openString;

  let index = 0;
  if (language === "swift" && state.swiftMultilineString) {
    const end = line.indexOf('"""');
    if (end === -1) return " ".repeat(line.length);
    for (let cursor = 0; cursor < end + 3; cursor += 1) output[cursor] = " ";
    state.swiftMultilineString = false;
    index = end + 3;
  }
  if (language === "csharp" && state.csharpVerbatim) {
    const end = csharpVerbatimEnd(line, 0);
    if (end === undefined) return " ".repeat(line.length);
    for (let cursor = 0; cursor <= end; cursor += 1) output[cursor] = " ";
    state.csharpVerbatim = false;
    index = end + 1;
  }
  if (percent) {
    const closed = rubyPercentClose(line, 0, percent);
    const end = closed === undefined ? line.length - 1 : closed;
    for (let cursor = 0; cursor <= end; cursor += 1) output[cursor] = " ";
    if (closed === undefined) {
      state.openString = percent;
      return output.join("");
    }
    index = end + 1;
    percent = undefined;
  }

  for (; index < output.length; index += 1) {
    const character = output[index]!;
    const next = output[index + 1];
    if (state.blockComment) {
      output[index] = " ";
      if (language === "swift" && character === "/" && next === "*") {
        output[index + 1] = " ";
        state.swiftBlockCommentDepth = (state.swiftBlockCommentDepth ?? 1) + 1;
        index += 1;
        continue;
      }
      if (character === "*" && next === "/") {
        output[index + 1] = " ";
        if (language === "swift" && (state.swiftBlockCommentDepth ?? 1) > 1) {
          state.swiftBlockCommentDepth = (state.swiftBlockCommentDepth ?? 1) - 1;
        } else {
          state.blockComment = false;
          delete state.swiftBlockCommentDepth;
        }
        index += 1;
      }
      continue;
    }
    if (quote) {
      output[index] = " ";
      if (!escaped && character === quote) quote = undefined;
      escaped = character === "\\" && !escaped;
      continue;
    }
    if (language === "swift" && line.slice(index, index + 3) === '"""') {
      const end = line.indexOf('"""', index + 3);
      if (end === -1) {
        for (let rest = index; rest < output.length; rest += 1) output[rest] = " ";
        state.swiftMultilineString = true;
        return output.join("");
      }
      for (let cursor = index; cursor < end + 3; cursor += 1) output[cursor] = " ";
      index = end + 2;
      continue;
    }
    if (language === "ruby" && character === "?" && next !== undefined && next !== " " && next !== "\t") {
      // Character literal `?x` / `?\n` — a quote here must not open a string.
      output[index] = " ";
      if (next === "\\") {
        output[index + 1] = " ";
        if (index + 2 < output.length) {
          output[index + 2] = " ";
          index += 2;
        } else {
          index += 1;
        }
      } else {
        output[index + 1] = " ";
        index += 1;
      }
      continue;
    }
    if (language === "ruby" && character === "/" && next !== "=" && rubyRegexMayStart(line, index)) {
      const end = rubyRegexEnd(line, index);
      if (end !== undefined) {
        for (let cursor = index; cursor <= end; cursor += 1) output[cursor] = " ";
        index = end;
        continue;
      }
      // Unclosed regexp: mask the rest so a quote inside cannot hide later code.
      for (let rest = index; rest < output.length; rest += 1) output[rest] = " ";
      break;
    }
    if (language === "ruby" && character === "%") {
      const opened = rubyPercentOpen(line, index);
      if (opened) {
        const bodyStart = line[index + 1] && /[qQwWrsxiI]/.test(line[index + 1]!) ? index + 3 : index + 2;
        const closed = rubyPercentClose(line, bodyStart, opened);
        const end = closed === undefined ? line.length - 1 : closed;
        for (let cursor = index; cursor <= end; cursor += 1) output[cursor] = " ";
        if (closed === undefined) {
          state.openString = opened;
          return output.join("");
        }
        index = end;
        continue;
      }
    }
    if (language === "php" && character === "<" && next === "<" && line[index + 2] === "<") {
      const opener = /^<<<(?:'([A-Za-z_][A-Za-z0-9_]*)'|"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*))/.exec(line.slice(index));
      const terminator = opener?.[1] ?? opener?.[2] ?? opener?.[3];
      if (opener && terminator) {
        state.heredoc = terminator;
        for (let cursor = index; cursor < output.length; cursor += 1) output[cursor] = " ";
        return output.join("");
      }
    }
    if (language === "ruby" && character === "<" && next === "<" && (index === 0 || !/[\w)\]]/.test(line[index - 1]!))) {
      const heredoc = /^<<[-~]?(?:'([^'\n]+)'|"([^"\n]+)"|([A-Za-z_]\w*))/.exec(line.slice(index));
      const terminator = heredoc?.[1] ?? heredoc?.[2] ?? heredoc?.[3];
      if (heredoc && terminator) {
        state.heredoc = terminator;
        for (let cursor = index; cursor < index + heredoc[0].length; cursor += 1) output[cursor] = " ";
        index += heredoc[0].length - 1;
        continue;
      }
    }
    if (language === "csharp" && character === "@" && next === '"') {
      const end = csharpVerbatimEnd(line, index + 2);
      const last = end ?? output.length - 1;
      for (let cursor = index; cursor <= last; cursor += 1) output[cursor] = " ";
      if (end === undefined) {
        state.csharpVerbatim = true;
        return output.join("");
      }
      index = end;
      continue;
    }
    if (character === '"' || (character === "'" && language !== "rust") || (character === "`" && language !== "python" && language !== "rust")) {
      quote = character;
      output[index] = " ";
      escaped = false;
      continue;
    }
    if (language !== "python" && language !== "ruby" && character === "/" && next === "*") {
      output[index] = " ";
      output[index + 1] = " ";
      state.blockComment = true;
      if (language === "swift") state.swiftBlockCommentDepth = 1;
      index += 1;
      continue;
    }
    if (
      ((language === "python" || language === "ruby") && character === "#") ||
      (language === "php" && character === "#" && next !== "[") ||
      (language !== "python" && language !== "ruby" && character === "/" && next === "/")
    ) {
      for (let rest = index; rest < output.length; rest += 1) output[rest] = " ";
      break;
    }
  }
  if ((language === "ruby" || language === "php") && quote) state.openString = { kind: "quote", quote, escaped };
  return output.join("");
}

function configKeyMatch(line: string, matcher: ConfigUsageMatcher): number | undefined {
  const key = escapePattern(matcher.key);
  const pattern =
    matcher.language === "json"
      ? new RegExp(`["']${key}["']\\s*:`)
      : matcher.language === "yaml"
        ? new RegExp(`^\\s*${key}\\s*:`)
        : new RegExp(`^\\s*${key}\\s*=`);
  const match = pattern.exec(line);
  if (!match || (matcher.valueIncludes && !line.includes(matcher.valueIncludes))) return undefined;
  const keyIndex = line.indexOf(matcher.key, match.index);
  return keyIndex === -1 ? match.index + 1 : keyIndex + 1;
}

export function impactFor(usages: readonly SourceUsage[]): MigrationImpact {
  const usageCount = usages.length;
  return {
    usageCount,
    affectedFiles: new Set(usages.map((usage) => usage.location.path)).size,
    level: usageCount === 0 ? "none" : usageCount <= 3 ? "low" : usageCount <= 10 ? "medium" : "high",
  };
}

async function parsedUsages(
  file: SourceFile,
  contents: string,
  contracts: readonly SourceUsageContract[],
): Promise<Map<string, SourceUsage[]> | undefined> {
  try {
    if (file.language === "python") return await analyzePythonFile({ path: file.path, language: "python", source: contents }, contracts);
    if (file.language === "javascript" || file.language === "typescript") {
      return await analyzeJavaScriptFile({ path: file.path, language: file.language, source: contents }, contracts);
    }
  } catch {
    // The parser could not run; the regex scanner covers the file.
  }
  return undefined;
}

export interface SourceUsageOptions {
  /** Set to false to use the regex scanner for every language, as the parity tests and benchmark do. Defaults to true. */
  parser?: boolean;
}

export async function analyzeSourceUsage(
  root: string,
  contracts: readonly SourceUsageContract[],
  options: SourceUsageOptions = {},
): Promise<SourceUsageAnalysis[]> {
  const resolvedRoot = resolve(root);
  const relevantLanguages = new Set(
    contracts.flatMap((contract) => contract.matchers.map((matcher) => matcher.language)),
  );
  const results = new Map<string, SourceUsage[]>(contracts.map((contract) => [contract.id, []]));
  const seen = new Map<string, Set<string>>(contracts.map((contract) => [contract.id, new Set()]));
  const push = (contractId: string, usage: SourceUsage): void => {
    const key = `${usage.kind}:${usage.location.path}:${usage.location.line}:${usage.location.column}:${usage.symbol}`;
    const contractSeen = seen.get(contractId)!;
    if (contractSeen.has(key)) return;
    contractSeen.add(key);
    results.get(contractId)!.push(usage);
  };

  for (const file of await sourceFiles(resolvedRoot)) {
    if (!relevantLanguages.has(file.language)) continue;
    if ((file.language === "ruby" || file.language === "php") && checkoutSourceIgnored(file.path)) continue;
    const contents = await readFile(file.absolutePath, "utf8");
    // JavaScript, TypeScript, and Python import and call usages come from the parser when it can read the file;
    // otherwise (too large, over budget, or the runtime cannot load) the regex scanner below handles them.
    const parsed = options.parser === false ? undefined : await parsedUsages(file, contents, contracts);
    if (parsed) {
      for (const [contractId, usages] of parsed) for (const usage of usages) push(contractId, usage);
      if (!contracts.some((contract) => contract.matchers.some((matcher) => matcher.kind === "config-key" && matcher.language === file.language))) continue;
    }
    const lines = contents.split(/\r?\n/);
    const maskedLines: string[] = [];
    const maskState = { blockComment: false };
    for (const line of lines) maskedLines.push(maskCodeLine(line, file.language, maskState));
    const phpFile = file.language === "php" ? phpUses(lines, maskedLines) : undefined;
    const imports = file.language === "php"
      ? [...phpImportsFromRequires(lines, maskedLines), ...phpFile!.imports.map((hit) => ({ module: hit.module, line: hit.line, column: hit.column, bindings: [] }))]
      : file.language === "ruby" ? rubyImports(lines, maskedLines) : file.language === "go" ? goImports(lines, maskedLines) : file.language === "rust" ? rustImports(lines, maskedLines) : file.language === "csharp" ? csharpImports(lines, maskedLines) : file.language === "java" || file.language === "kotlin" ? jvmImports(lines, maskedLines) : file.language === "swift" ? swiftImports(lines, maskedLines) : file.language === "dart" ? dartImports(lines, maskedLines) : lines.flatMap((line, index) => {
      const maskedLine = maskedLines[index]!;
      if (file.language === "python") {
        return /\b(?:from|import)\b/.test(maskedLine) ? pythonImports(line, index + 1) : [];
      }
      if (file.language === "javascript" || file.language === "typescript") {
        return /\b(?:import|require)\b/.test(maskedLine)
          ? javascriptImports(line, index + 1)
          : [];
      }
      return [];
    });
    const bindings = imports.flatMap((reference) => reference.bindings);
    // Alias resolution is per file, not per matcher or target.
    const rubyFileAliases = file.language === "ruby" ? rubyAliases(maskedLines) : [];
    const phpFileAliases = phpFile?.aliases ?? [];
    const swiftFileAliases = file.language === "swift" ? swiftAliases(maskedLines) : [];
    const rubyReceiverPatterns = new Map<string, RegExp>();
    const phpReceiverPatterns = new Map<string, RegExp>();

    for (const contract of contracts) {
      const matchers = contract.matchers.filter((matcher) => matcher.language === file.language);
      for (const matcher of matchers) {
        if (parsed && matcher.kind !== "config-key") continue;
        if (matcher.kind === "import") {
          for (const reference of imports.filter((candidate) =>
            moduleMatches(candidate.module, matcher.module, file.language),
          )) {
            push(contract.id, {
              kind: "import",
              language: file.language,
              symbol: matcher.module,
              location: { path: file.path, line: reference.line, column: reference.column },
              excerpt: lines[reference.line - 1]!.trim(),
            });
          }
        } else if (matcher.kind === "call") {
          // Swift calls are attributed only when they stay module-qualified, or use a source-level
          // typealias whose target is inside that module. Unqualified imported names are ambiguous.
          if (file.language === "swift") {
            for (const target of matcher.targets) {
              const qualified = `${matcher.module}.${target}`;
              const forms = [qualified];
              for (const alias of swiftFileAliases) {
                if (qualified === alias.target) forms.push(alias.local);
                else if (qualified.startsWith(`${alias.target}.`)) forms.push(`${alias.local}${qualified.slice(alias.target.length)}`);
              }
              const alternatives = [...new Set(forms)]
                .sort((left, right) => right.length - left.length)
                .map((form) => form.split(".").map(escapePattern).join("\\s*\\.\\s*"));
              const pattern = new RegExp(`(?<![\\w$.])(?:${alternatives.join("|")})\\s*\\(`, "g");
              for (const [index, line] of maskedLines.entries()) {
                for (const match of line.matchAll(pattern)) {
                  if (match.index === undefined) continue;
                  push(contract.id, {
                    kind: "call",
                    language: file.language,
                    symbol: `${matcher.module}.${target}`,
                    location: { path: file.path, line: index + 1, column: match.index + 1 },
                    excerpt: lines[index]!.trim(),
                  });
                }
              }
            }
          }
          // In Rust a crate is always in scope by name, so `crate::function(…)` needs no `use`.
          if (file.language === "rust") {
            for (const target of matcher.targets) {
              const full = [matcher.module, target].join("::").split("::").map(escapePattern).join("\\s*::\\s*");
              const pattern = new RegExp(`(?<![\\w$:])${full}\\s*(?:!\\s*[(\\[{]|\\()`, "g");
              for (const [index, line] of maskedLines.entries()) {
                for (const match of line.matchAll(pattern)) {
                  if (match.index === undefined) continue;
                  push(contract.id, {
                    kind: "call",
                    language: file.language,
                    symbol: `${matcher.module}.${target}`,
                    location: { path: file.path, line: index + 1, column: match.index + 1 },
                    excerpt: lines[index]!.trim(),
                  });
                }
              }
            }
          }
          // In C# a type is reached by its full name, or by its simple name when a `using` brings in its namespace.
          if (file.language === "csharp") {
            // `using N;` brings in the types of N itself, not those of its sub-namespaces.
            const imported = imports.some((candidate) => candidate.module === matcher.module);
            for (const target of matcher.targets) {
              const path = (value: string): string => value.split(".").map(escapePattern).join("\\s*\\.\\s*");
              const forms = [{ source: path(`${matcher.module}.${target}`) }, ...(imported ? [{ source: path(target) }] : [])];
              for (const form of forms) {
                const pattern = new RegExp(`(?<![\\w$.])${form.source}\\s*\\(`, "g");
                for (const [index, line] of maskedLines.entries()) {
                  for (const match of line.matchAll(pattern)) {
                    if (match.index === undefined) continue;
                    push(contract.id, {
                      kind: "call",
                      language: file.language,
                      symbol: `${matcher.module}.${target}`,
                      location: { path: file.path, line: index + 1, column: match.index + 1 },
                      excerpt: lines[index]!.trim(),
                    });
                  }
                }
              }
            }
          }
          // A PHP call target is `Class::method(` or `new Class`. `use Foo as Alias` then `Alias::method(` or `new Alias` is the same call.
          if (file.language === "php") {
            for (const target of matcher.targets) {
              const forms = phpCallForms(target, phpFileAliases);
              if (forms.length === 0) continue;
              const formKey = forms.map((form) => `${form.kind}\0${form.receiver}\0${form.method ?? ""}`).join("\n");
              let pattern = phpReceiverPatterns.get(formKey);
              if (!pattern) {
                pattern = phpCallPattern(forms);
                phpReceiverPatterns.set(formKey, pattern);
              }
              for (const [index, line] of maskedLines.entries()) {
                if (line.length > PHP_MAX_LINE || (!line.includes("(") && !line.includes("new"))) continue;
                pattern.lastIndex = 0;
                for (const match of line.matchAll(pattern)) {
                  if (match.index === undefined) continue;
                  const column = match.index + 1 + (match[0].startsWith("\\") ? 1 : 0);
                  push(contract.id, {
                    kind: "call",
                    language: file.language,
                    symbol: `${matcher.module}.${target}`,
                    location: { path: file.path, line: index + 1, column },
                    excerpt: lines[index]!.trim(),
                  });
                }
              }
            }
          }
          // A Ruby call is qualified (`JSON.parse(` or `JSON::parse(`). `Parser = JSON` then `Parser.parse(` is the same call.
          // One combined regex per target (not per alias form) so a large alias table cannot multiply file scans.
          if (file.language === "ruby") {
            for (const target of matcher.targets) {
              const forms = rubyReceivers(target, rubyFileAliases);
              if (forms.length === 0) continue;
              const formKey = forms.map((parts) => parts.join("\0")).join("\n");
              let pattern = rubyReceiverPatterns.get(formKey);
              if (!pattern) {
                const alternation = forms
                  .map((parts) => parts.map((part) => escapePattern(part)).join("\\s*(?:\\.|::)\\s*"))
                  .join("|");
                pattern = new RegExp(`(?<![\\w$:])(?:::)?(?:${alternation})\\s*\\(`, "g");
                rubyReceiverPatterns.set(formKey, pattern);
              }
              for (const [index, line] of maskedLines.entries()) {
                if (line.length > RUBY_MAX_LINE || !line.includes("(")) continue;
                pattern.lastIndex = 0;
                for (const match of line.matchAll(pattern)) {
                  if (match.index === undefined) continue;
                  push(contract.id, {
                    kind: "call",
                    language: file.language,
                    symbol: `${matcher.module}.${target}`,
                    location: { path: file.path, line: index + 1, column: match.index + 1 },
                    excerpt: lines[index]!.trim(),
                  });
                }
              }
            }
          }
          const matchingBindings = file.language === "swift" ? [] : bindings.filter((binding) =>
            moduleMatches(binding.module, matcher.module, file.language),
          );
          for (const binding of matchingBindings) {
            for (const target of matcher.targets) {
              const rust = file.language === "rust";
              const separator = rust ? "\\s*::\\s*" : "\\s*\\.\\s*";
              const escapedTarget = rust ? target.split("::").map(escapePattern).join("\\s*::\\s*") : escapePattern(target);
              const head = rust ? target.split("::")[0]! : target;
              const callable =
                target === "default"
                  ? binding.imported === "default" || binding.imported === "*"
                    ? escapePattern(binding.local)
                    : undefined
                  : binding.imported === target
                    ? escapePattern(binding.local)
                    : rust && target.includes("::") && binding.imported === head
                      ? `${escapePattern(binding.local)}\\s*::\\s*${target.split("::").slice(1).map(escapePattern).join("\\s*::\\s*")}`
                      : binding.imported === "*" || binding.imported === "default"
                        ? `${escapePattern(binding.local)}${separator}${escapedTarget}`
                        : undefined;
              if (!callable) continue;
              // A Rust macro is called with a bang: `format_err!(…)`.
              const pattern = new RegExp(`(?<![\\w$${rust ? ":" : ""}])${callable}${rust ? "\\s*(?:!\\s*[(\\[{]|\\()" : "\\s*\\("}`, "g");
              for (const [index, line] of maskedLines.entries()) {
                for (const match of line.matchAll(pattern)) {
                  if (match.index === undefined) continue;
                  push(contract.id, {
                    kind: "call",
                    language: file.language,
                    symbol: target === "default" ? matcher.module : `${matcher.module}.${target}`,
                    location: { path: file.path, line: index + 1, column: match.index + 1 },
                    excerpt: lines[index]!.trim(),
                  });
                }
              }
            }
          }
        } else if (matcher.kind === "config-key") {
          for (const [index, line] of lines.entries()) {
            const column = configKeyMatch(line, matcher);
            if (column === undefined) continue;
            push(contract.id, {
              kind: "config-key",
              language: file.language,
              symbol: matcher.key,
              location: { path: file.path, line: index + 1, column },
              excerpt: line.trim(),
            });
          }
        }
      }
    }
  }

  return contracts.map((contract) => {
    const usages = results.get(contract.id)!.sort((left, right) => {
      const pathOrder = left.location.path.localeCompare(right.location.path);
      if (pathOrder !== 0) return pathOrder;
      const lineOrder = (left.location.line ?? 0) - (right.location.line ?? 0);
      return lineOrder !== 0
        ? lineOrder
        : (left.location.column ?? 0) - (right.location.column ?? 0);
    });
    return { contractId: contract.id, usages, impact: impactFor(usages) };
  });
}

export interface RubyDynamicReference {
  path: string;
  line: number;
  column: number;
  reference: string;
  reason: string;
}

const RUBY_DYNAMIC_REASON = "the argument is not a string literal, so Evergreen does not attribute it to a gem";

/**
 * `require`, `load`, `gem`, and `autoload` whose argument is not a string literal, plus invocations
 * that were not scanned because a line or repository bound was hit.
 * `require_relative` is never unclassified: it names a local file, not a gem.
 */
export async function findRubyDynamicReferences(root: string): Promise<RubyDynamicReference[]> {
  const found: RubyDynamicReference[] = [];
  for (const file of await sourceFiles(resolve(root))) {
    if (file.language !== "ruby" || checkoutSourceIgnored(file.path)) continue;
    const lines = (await readFile(file.absolutePath, "utf8")).split(/\r?\n/);
    const maskedLines: string[] = [];
    const maskState: MaskState = { blockComment: false };
    for (const line of lines) maskedLines.push(maskCodeLine(line, "ruby", maskState));
    const { invocations, skips } = rubyInvocations(lines, maskedLines);
    for (const skip of skips) {
      found.push({ path: file.path, line: skip.line, column: skip.column, reference: skip.reference, reason: skip.reason });
    }
    for (const invocation of invocations) {
      if (invocation.kind === "require_relative" || invocation.argument.kind !== "dynamic") continue;
      found.push({
        path: file.path,
        line: invocation.line,
        column: invocation.keywordColumn,
        reference: invocation.reference,
        reason: RUBY_DYNAMIC_REASON,
      });
    }
  }
  return found.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.column - right.column || left.reference.localeCompare(right.reference));
}

export interface PhpDynamicReference {
  path: string;
  line: number;
  column: number;
  reference: string;
  reason: string;
}

/**
 * `require`, `require_once`, `include`, and `include_once` whose argument is not a string literal, plus
 * `new $class` and `$class::method()`. A quoted path and a static `use` are never unclassified. PHP has no
 * `require_relative`. Reported only for files this scanner reads; the detector calls it when a finding has usage matchers.
 */
export async function findPhpDynamicReferences(root: string): Promise<PhpDynamicReference[]> {
  const found: PhpDynamicReference[] = [];
  for (const file of await sourceFiles(resolve(root))) {
    if (file.language !== "php" || checkoutSourceIgnored(file.path)) continue;
    const lines = (await readFile(file.absolutePath, "utf8")).split(/\r?\n/);
    const maskedLines: string[] = [];
    const maskState: MaskState = { blockComment: false };
    for (const line of lines) maskedLines.push(maskCodeLine(line, "php", maskState));
    const { requires, skips } = phpRequires(lines, maskedLines);
    for (const skip of skips) {
      found.push({ path: file.path, line: skip.line, column: skip.column, reference: skip.reference, reason: skip.reason });
    }
    for (const invocation of requires) {
      if (invocation.argument.kind !== "dynamic") continue;
      found.push({
        path: file.path,
        line: invocation.line,
        column: invocation.keywordColumn,
        reference: invocation.reference,
        reason: PHP_DYNAMIC_ARGUMENT_REASON,
      });
    }
    for (const call of phpVariableCalls(lines, maskedLines)) {
      found.push({ path: file.path, line: call.line, column: call.column, reference: call.reference, reason: call.reason });
    }
  }
  const unique = new Map<string, PhpDynamicReference>();
  for (const hit of found) {
    const key = `${hit.path}:${hit.line}:${hit.column}:${hit.reference}:${hit.reason}`;
    if (!unique.has(key)) unique.set(key, hit);
  }
  return [...unique.values()].sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.column - right.column || left.reference.localeCompare(right.reference));
}

export interface DartDynamicReference {
  path: string;
  line: number;
  column: number;
  reference: string;
  reason: string;
}

const DART_DYNAMIC_REASON = "the runtime lookup cannot be attributed statically to a Dart package or API";
const DART_DYNAMIC_LOOKUP = /\bFunction\s*\.\s*apply\s*\(/g;
const DART_MIRROR_LOOKUP = /\b(?:reflect|reflectClass|reflectType|currentMirrorSystem)\s*\(/g;

/** Runtime lookup forms in Dart source that cannot be assigned to a package safely: `Function.apply`, and `dart:mirrors` reflection. */
export async function findDartDynamicReferences(root: string): Promise<DartDynamicReference[]> {
  const found: DartDynamicReference[] = [];
  for (const file of await sourceFiles(resolve(root))) {
    if (file.language !== "dart" || checkoutSourceIgnored(file.path)) continue;
    const lines = (await readFile(file.absolutePath, "utf8")).split(/\r?\n/);
    const maskedLines: string[] = [];
    const maskState: MaskState = { blockComment: false };
    for (const line of lines) maskedLines.push(maskCodeLine(line, "dart", maskState));
    const mirrors = lines.some((line, index) => /^\s*import\b/.test(maskedLines[index]!) && /^\s*import\s*['"]dart:mirrors['"]/.test(line));
    for (const [index, masked] of maskedLines.entries()) {
      for (const pattern of mirrors ? [DART_DYNAMIC_LOOKUP, DART_MIRROR_LOOKUP] : [DART_DYNAMIC_LOOKUP]) {
        pattern.lastIndex = 0;
        for (const match of masked.matchAll(pattern)) {
          if (match.index === undefined) continue;
          found.push({ path: file.path, line: index + 1, column: match.index + 1, reference: lines[index]!.trim(), reason: DART_DYNAMIC_REASON });
        }
      }
    }
  }
  return found.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.column - right.column);
}

export interface SwiftDynamicReference {
  path: string;
  line: number;
  column: number;
  reference: string;
  reason: string;
}

const SWIFT_DYNAMIC_REASON = "the runtime lookup cannot be attributed statically to a Swift package or API";
const SWIFT_DYNAMIC_LOOKUP = /\b(?:NSClassFromString|NSProtocolFromString|NSSelectorFromString|Selector|objc_getClass|sel_registerName|dlsym)\s*\(/g;

/** Runtime Objective-C lookup forms in Swift source that cannot be assigned to a package safely. */
export async function findSwiftDynamicReferences(root: string): Promise<SwiftDynamicReference[]> {
  const found: SwiftDynamicReference[] = [];
  for (const file of await sourceFiles(resolve(root))) {
    if (file.language !== "swift" || checkoutSourceIgnored(file.path)) continue;
    const lines = (await readFile(file.absolutePath, "utf8")).split(/\r?\n/);
    const maskedLines: string[] = [];
    const maskState: MaskState = { blockComment: false };
    for (const line of lines) maskedLines.push(maskCodeLine(line, "swift", maskState));
    for (const [index, masked] of maskedLines.entries()) {
      SWIFT_DYNAMIC_LOOKUP.lastIndex = 0;
      for (const match of masked.matchAll(SWIFT_DYNAMIC_LOOKUP)) {
        if (match.index === undefined) continue;
        found.push({
          path: file.path,
          line: index + 1,
          column: match.index + 1,
          reference: lines[index]!.trim(),
          reason: SWIFT_DYNAMIC_REASON,
        });
      }
    }
  }
  return found.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.column - right.column);
}

export type { SourceUsageAnalysis, SourceUsageContract } from "./domain.js";

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
  if (extension === ".json") return "json";
  if ([".yaml", ".yml"].includes(extension)) return "yaml";
  if (extension === ".toml") return "toml";
  if ([".ini", ".cfg"].includes(extension)) return "ini";
  return undefined;
}

async function sourceFiles(root: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const language = languageFor(path);
      if (!language || (await stat(path)).size > maximumFileBytes) continue;
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
  return actual === expected;
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

const rubyIgnoredSegments = new Set(["vendor", "fixtures", "__fixtures__", "testdata"]);

/** Ruby dependency checkouts and fixture trees are not the project's own source. */
function rubySourceIgnored(path: string): boolean {
  return path.split("/").some((segment) => rubyIgnoredSegments.has(segment));
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

/**
 * `require`, `load`, `gem`, `autoload`, and `require_relative` on one line. A string literal is a path; a
 * variable, interpolation, concatenation, or method call on the string is dynamic. `JSON.load` and
 * `require_relative` are not `load` or `require`. Lines over 4,096 characters are skipped.
 */
function rubyInvocations(lines: readonly string[], maskedLines: readonly string[]): RubyInvocation[] {
  const keyword = /(?<![\w.:])(?:(?:::)?Kernel\s*\.\s*)?(require_relative|require|load|gem|autoload)\b/g;
  const invocations: RubyInvocation[] = [];
  for (const [index, masked] of maskedLines.entries()) {
    if (invocations.length >= RUBY_MAX_INVOCATIONS) break;
    const line = lines[index]!;
    if (line.length > RUBY_MAX_LINE || masked.length > RUBY_MAX_LINE) continue;
    keyword.lastIndex = 0;
    for (const match of masked.matchAll(keyword)) {
      if (invocations.length >= RUBY_MAX_INVOCATIONS) break;
      if (match.index === undefined || !match[1]) continue;
      const kind = match[1] as RubyInvocation["kind"];
      const keywordLength = match[0].length;
      if (rubyKeywordIsMethodDefinition(masked, match.index)) continue;
      if (!rubyKeywordIsCall(line, masked, match.index, keywordLength)) continue;
      let cursor = match.index + keywordLength;
      while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
      if (line[cursor] === "(") {
        cursor += 1;
        while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
      }
      const reference = line.slice(match.index, match.index + RUBY_MAX_REFERENCE).trim();
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
  return invocations;
}

/** `require`/`load`/`gem`/`autoload` of a string. `require_relative` is a local file, not a gem. Bindings stay empty; calls use the rule's qualified target. */
function rubyImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  for (const invocation of rubyInvocations(lines, maskedLines)) {
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

/** The end index of a Ruby percent literal starting at `index`, so its body cannot look like code. */
function rubyPercentEnd(line: string, index: number): number | undefined {
  if (line[index] !== "%") return undefined;
  let cursor = index + 1;
  const marker = line[cursor];
  if (marker && /[qQwWrsxiI]/.test(marker)) cursor += 1;
  const delimiter = line[cursor];
  if (!delimiter) return undefined;
  const closer = delimiter === "(" ? ")" : delimiter === "[" ? "]" : delimiter === "{" ? "}" : delimiter === "<" ? ">" : /[^A-Za-z0-9_\s]/.test(delimiter) ? delimiter : undefined;
  if (!closer) return undefined;
  const paired = closer !== delimiter;
  let depth = 1;
  for (let position = cursor + 1; position < line.length; position += 1) {
    const character = line[position]!;
    if (character === "\\" && position + 1 < line.length) {
      position += 1;
      continue;
    }
    if (paired && character === delimiter) depth += 1;
    else if (character === closer) {
      depth -= 1;
      if (depth === 0) return position;
    }
  }
  return line.length - 1;
}

interface MaskState {
  blockComment: boolean;
  rubyBlock?: boolean;
  heredoc?: string;
}

function maskCodeLine(line: string, language: SourceLanguage, state: MaskState): string {
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
  // Fast path: no quotes, comments, percent literals, or heredocs to mask.
  if (language === "ruby" && !state.blockComment && !/[#"'%`<]/.test(line)) return line;

  const output = [...line];
  let quote: string | undefined;
  let escaped = false;
  for (let index = 0; index < output.length; index += 1) {
    const character = output[index]!;
    const next = output[index + 1];
    if (state.blockComment) {
      output[index] = " ";
      if (character === "*" && next === "/") {
        output[index + 1] = " ";
        state.blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      output[index] = " ";
      if (!escaped && character === quote) quote = undefined;
      escaped = !escaped && character === "\\";
      if (character !== "\\") escaped = false;
      continue;
    }
    if (language === "ruby" && character === "%") {
      const end = rubyPercentEnd(line, index);
      if (end !== undefined) {
        for (let cursor = index; cursor <= end; cursor += 1) output[cursor] = " ";
        index = end;
        continue;
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
    if (character === '"' || (character === "'" && language !== "rust") || (character === "`" && language !== "python" && language !== "rust")) {
      quote = character;
      output[index] = " ";
      continue;
    }
    if (language !== "python" && language !== "ruby" && character === "/" && next === "*") {
      output[index] = " ";
      output[index + 1] = " ";
      state.blockComment = true;
      index += 1;
      continue;
    }
    if (
      ((language === "python" || language === "ruby") && character === "#") ||
      (language !== "python" && language !== "ruby" && character === "/" && next === "/")
    ) {
      for (let rest = index; rest < output.length; rest += 1) output[rest] = " ";
      break;
    }
  }
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

export async function analyzeSourceUsage(
  root: string,
  contracts: readonly SourceUsageContract[],
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
    if (file.language === "ruby" && rubySourceIgnored(file.path)) continue;
    const contents = await readFile(file.absolutePath, "utf8");
    const lines = contents.split(/\r?\n/);
    const maskedLines: string[] = [];
    const maskState = { blockComment: false };
    for (const line of lines) maskedLines.push(maskCodeLine(line, file.language, maskState));
    const imports = file.language === "ruby" ? rubyImports(lines, maskedLines) : file.language === "go" ? goImports(lines, maskedLines) : file.language === "rust" ? rustImports(lines, maskedLines) : file.language === "csharp" ? csharpImports(lines, maskedLines) : file.language === "java" || file.language === "kotlin" ? jvmImports(lines, maskedLines) : lines.flatMap((line, index) => {
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
    const rubyReceiverPatterns = new Map<string, RegExp>();

    for (const contract of contracts) {
      const matchers = contract.matchers.filter((matcher) => matcher.language === file.language);
      for (const matcher of matchers) {
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
          const matchingBindings = bindings.filter((binding) =>
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
}

/**
 * `require`, `load`, `gem`, and `autoload` whose argument is not a string literal.
 * `require_relative` is never unclassified: it names a local file, not a gem.
 */
export async function findRubyDynamicReferences(root: string): Promise<RubyDynamicReference[]> {
  const found: RubyDynamicReference[] = [];
  for (const file of await sourceFiles(resolve(root))) {
    if (file.language !== "ruby" || rubySourceIgnored(file.path)) continue;
    const lines = (await readFile(file.absolutePath, "utf8")).split(/\r?\n/);
    const maskedLines: string[] = [];
    const maskState: MaskState = { blockComment: false };
    for (const line of lines) maskedLines.push(maskCodeLine(line, "ruby", maskState));
    for (const invocation of rubyInvocations(lines, maskedLines)) {
      if (invocation.kind === "require_relative" || invocation.argument.kind !== "dynamic") continue;
      found.push({ path: file.path, line: invocation.line, column: invocation.keywordColumn, reference: invocation.reference });
    }
  }
  return found.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.column - right.column || left.reference.localeCompare(right.reference));
}

export type { SourceUsageAnalysis, SourceUsageContract } from "./domain.js";

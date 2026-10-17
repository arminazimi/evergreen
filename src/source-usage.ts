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
  if (extension === ".java") return "java";
  if (extension === ".kt") return "kotlin";
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

function maskCodeLine(
  line: string,
  language: SourceLanguage,
  state: { blockComment: boolean },
): string {
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
    if (character === '"' || (character === "'" && language !== "rust") || (character === "`" && language !== "python" && language !== "rust")) {
      quote = character;
      output[index] = " ";
      continue;
    }
    if (language !== "python" && character === "/" && next === "*") {
      output[index] = " ";
      output[index + 1] = " ";
      state.blockComment = true;
      index += 1;
      continue;
    }
    if (
      (language === "python" && character === "#") ||
      (language !== "python" && character === "/" && next === "/")
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
    const contents = await readFile(file.absolutePath, "utf8");
    const lines = contents.split(/\r?\n/);
    const maskedLines: string[] = [];
    const maskState = { blockComment: false };
    for (const line of lines) maskedLines.push(maskCodeLine(line, file.language, maskState));
    const imports = file.language === "go" ? goImports(lines, maskedLines) : file.language === "rust" ? rustImports(lines, maskedLines) : file.language === "java" || file.language === "kotlin" ? jvmImports(lines, maskedLines) : lines.flatMap((line, index) => {
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
        } else {
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

export type { SourceUsageAnalysis, SourceUsageContract } from "./domain.js";

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
  return language === "python"
    ? actual === expected || actual.startsWith(`${expected}.`)
    : actual === expected;
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
    if (character === '"' || character === "'" || (character === "`" && language !== "python")) {
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

function impactFor(usages: readonly SourceUsage[]): MigrationImpact {
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
    const imports = lines.flatMap((line, index) => {
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
          const matchingBindings = bindings.filter((binding) =>
            moduleMatches(binding.module, matcher.module, file.language),
          );
          for (const binding of matchingBindings) {
            for (const target of matcher.targets) {
              const callable =
                target === "default"
                  ? binding.imported === "default" || binding.imported === "*"
                    ? escapePattern(binding.local)
                    : undefined
                  : binding.imported === target
                    ? escapePattern(binding.local)
                    : binding.imported === "*" || binding.imported === "default"
                      ? `${escapePattern(binding.local)}\\s*\\.\\s*${escapePattern(target)}`
                      : undefined;
              if (!callable) continue;
              const pattern = new RegExp(`(?<![\\w$])${callable}\\s*\\(`, "g");
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

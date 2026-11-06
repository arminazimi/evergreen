import { openMemoryGuard } from "./usage/memory-guard.js";
import { resolve } from "node:path";

import type { CallUsageMatcher, ConfigUsageMatcher, ImportUsageMatcher, SourceLanguage, SourceUsage, SourceUsageAnalysis, SourceUsageContract, UsageMatcher } from "./domain.js";
import type { ScanFileSystem } from "./file-system.js";
import { nodeFileSystem } from "./node-file-system.js";
import { type SourceFile, sourceFiles } from "./source-files.js";
import { noteCappedUsage } from "./usage/binding-budget.js";
import { checkoutSourceIgnored } from "./usage/checkout.js";
import { configKeyMatch } from "./usage/config-keys.js";
import { dartImports } from "./usage/dart.js";
import { impactFor } from "./usage/impact.js";
import {
  type Binding,
  csharpImports,
  goImports,
  type ImportReference,
  javascriptBindings,
  jvmImports,
  pythonImports,
  type SwiftAlias,
  swiftAliases,
  swiftImports,
} from "./usage/imports.js";
import { maskCodeLine, type MaskState } from "./usage/masking.js";
import { moduleMatches } from "./usage/module-matches.js";
import { parsedUsages } from "./usage/parsers.js";
import { escapePattern } from "./usage/patterns.js";
import { PHP_MAX_LINE, phpCallForms, phpCallPattern, phpImportsFromRequires, phpUses } from "./usage/php.js";
import { rubyAliases, rubyReceivers } from "./usage/ruby.js";
import { RUBY_MAX_LINE, rubyInvocations } from "./usage/ruby-invocations.js";
import { rustImports } from "./usage/rust.js";

/** The string at `index`, or the empty string when the array is shorter. */
function textAt(values: readonly string[], index: number): string {
  return values[index] ?? "";
}

/** The map value at `key`; every key here comes from the contract list, so a miss is a bug. */
function requiredAt<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`missing source-usage entry for ${String(key)}`);
  return value;
}

/** The first `::`-separated segment of a Rust path. */
function rustHead(target: string): string {
  return target.split("::")[0] ?? "";
}

/** One way a JavaScript or TypeScript file names a module, and the bindings its captures introduce. */
interface JavaScriptImportForm {
  readonly pattern: RegExp;
  readonly read: (match: RegExpMatchArray) => { module: string; bindings: Binding[] } | undefined;
}

/** `const { get: fetch } = require("request")` binds `fetch` to `get`; an unaliased name binds itself. */
function destructuredRequireBindings(names: string, module: string): Binding[] {
  const entry = /^\s*([A-Za-z_$][\w$]*)(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*$/;
  return names.split(",").flatMap((one): Binding[] => {
    const binding = entry.exec(one);
    return binding?.[1] ? [{ module, imported: binding[1], local: binding[2] ?? binding[1] }] : [];
  });
}

/** The five ways a script file reaches a package, tried in this order so each form reports its own column. */
const JAVASCRIPT_IMPORT_FORMS: readonly JavaScriptImportForm[] = [
  {
    pattern: /\bimport\s+(.+?)\s+from\s+["']([^"']+)["']/g,
    read: (match) => {
      const clause = match[1];
      const module = match[2];
      if (clause === undefined || module === undefined) return undefined;
      return { module, bindings: javascriptBindings(clause, module) };
    },
  },
  {
    pattern: /\bimport\s+["']([^"']+)["']/g,
    read: (match) => (match[1] === undefined ? undefined : { module: match[1], bindings: [] }),
  },
  {
    pattern: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*["']([^"']+)["']\s*\)/g,
    read: (match) => {
      const local = match[1];
      const module = match[2];
      if (local === undefined || module === undefined) return undefined;
      return { module, bindings: [{ module, local, imported: "*" }] };
    },
  },
  {
    pattern: /\b(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\(\s*["']([^"']+)["']\s*\)/g,
    read: (match) => {
      const names = match[1];
      const module = match[2];
      if (names === undefined || module === undefined) return undefined;
      return { module, bindings: destructuredRequireBindings(names, module) };
    },
  },
  {
    pattern: /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    read: (match) => (match[1] === undefined ? undefined : { module: match[1], bindings: [] }),
  },
];

function javascriptImports(line: string, lineNumber: number): ImportReference[] {
  const references: ImportReference[] = [];
  for (const form of JAVASCRIPT_IMPORT_FORMS) {
    for (const match of line.matchAll(form.pattern)) {
      if (match.index === undefined) continue;
      const found = form.read(match);
      if (found === undefined) continue;
      references.push({
        module: found.module,
        line: lineNumber,
        column: line.indexOf(found.module, match.index) + 1,
        bindings: found.bindings,
      });
    }
  }
  return references;
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

/** `parser: false` forces the regex scanner; `skips` receives one line per memory-capped file. */
export interface SourceUsageOptions {
  parser?: boolean;
  skips?: string[];
  /** Where files are read from. Defaults to the real filesystem. */
  fileSystem?: ScanFileSystem;
}

/**
 * The contracts found so far, with the usages of each one deduplicated by position and symbol.
 * A usage's key includes its file, so duplicates can only arise inside one file: `startFile` drops the
 * keys of the previous file, which keeps the dedupe state the size of one file instead of the repository.
 */
interface UsageResults {
  readonly results: Map<string, SourceUsage[]>;
  readonly seen: Map<string, Set<string>>;
  readonly push: (contractId: string, usage: SourceUsage) => void;
  readonly startFile: () => void;
}

function openUsageResults(contracts: readonly SourceUsageContract[]): UsageResults {
  const results = new Map<string, SourceUsage[]>(contracts.map((contract) => [contract.id, []]));
  const seen = new Map<string, Set<string>>(contracts.map((contract) => [contract.id, new Set()]));
  const push = (contractId: string, usage: SourceUsage): void => {
    const key = `${usage.kind}:${usage.location.path}:${usage.location.line}:${usage.location.column}:${usage.symbol}`;
    const contractSeen = requiredAt(seen, contractId);
    if (contractSeen.has(key)) return;
    contractSeen.add(key);
    requiredAt(results, contractId).push(usage);
  };
  const startFile = (): void => {
    for (const keys of seen.values()) keys.clear();
  };
  return { results, seen, push, startFile };
}

/** The module names one language's files bind, read from its lines and the mask of those lines. */
type ImportReader = (lines: readonly string[], maskedLines: readonly string[]) => ImportReference[];

/** A call reader for one language: every call site of the matcher's module and targets in the file. */
type CallReader = (scan: FileScan, contractId: string, matcher: CallUsageMatcher) => void;

/** A file's text, its mask, and the names it imports: what every matcher of every contract reads. */
interface FileScan {
  readonly file: SourceFile;
  readonly language: SourceLanguage;
  readonly lines: readonly string[];
  readonly maskedLines: readonly string[];
  readonly imports: readonly ImportReference[];
  readonly bindings: readonly Binding[];
  readonly rubyAliases: ReturnType<typeof rubyAliases>;
  readonly phpAliases: ReturnType<typeof phpUses>["aliases"];
  readonly swiftAliases: SwiftAlias[];
  /** Regexes built per alias form, so a large alias table cannot multiply the number of line scans. */
  readonly rubyReceiverPatterns: Map<string, RegExp>;
  readonly phpReceiverPatterns: Map<string, RegExp>;
  readonly push: (contractId: string, usage: SourceUsage) => void;
}

/** Reads one line at a time, only where the masked line still mentions an import keyword. */
function readImportsPerLine(hint: RegExp, read: (line: string, lineNumber: number) => ImportReference[]): ImportReader {
  return (lines, maskedLines) => lines.flatMap((line, index) => (hint.test(textAt(maskedLines, index)) ? read(line, index + 1) : []));
}

/** The module names each language binds. PHP is read apart from this table; see `fileImports`. */
const IMPORT_READERS: Partial<Record<SourceLanguage, ImportReader>> = {
  javascript: readImportsPerLine(/\b(?:import|require)\b/, javascriptImports),
  typescript: readImportsPerLine(/\b(?:import|require)\b/, javascriptImports),
  python: readImportsPerLine(/\b(?:from|import)\b/, pythonImports),
  ruby: rubyImports,
  go: goImports,
  rust: rustImports,
  csharp: csharpImports,
  java: jvmImports,
  kotlin: jvmImports,
  swift: swiftImports,
  dart: dartImports,
};

/** Every module name the file binds, in the order its lines mention them. */
function fileImports(language: SourceLanguage, lines: readonly string[], maskedLines: readonly string[], uses: ReturnType<typeof phpUses> | undefined): ImportReference[] {
  if (language === "php" && uses !== undefined) {
    const named = uses.imports.map((hit) => ({ module: hit.module, line: hit.line, column: hit.column, bindings: [] }));
    return [...phpImportsFromRequires(lines, maskedLines), ...named];
  }
  const read = IMPORT_READERS[language];
  return read === undefined ? [] : read(lines, maskedLines);
}

/** What a line must look like before a call pattern is run over it, and how its column is counted. */
interface CallHitFilter {
  /** A line longer than this is not scanned at all. */
  readonly maxLine: number;
  /** When non-empty, only a line containing one of these is scanned. */
  readonly needles: readonly string[];
  /** PHP writes `\Class::method(`; its usage points at the name, not at the leading backslash. */
  readonly skipLeadingBackslash: boolean;
}

const EVERY_LINE: CallHitFilter = { maxLine: Number.POSITIVE_INFINITY, needles: [], skipLeadingBackslash: false };
const RUBY_HITS: CallHitFilter = { maxLine: RUBY_MAX_LINE, needles: ["("], skipLeadingBackslash: false };
const PHP_HITS: CallHitFilter = { maxLine: PHP_MAX_LINE, needles: ["(", "new"], skipLeadingBackslash: true };

/** True when a masked line is short enough, and holds enough, to be worth scanning for a call. */
function mayHoldCall(line: string, filter: CallHitFilter): boolean {
  return line.length <= filter.maxLine && (filter.needles.length === 0 || filter.needles.some((needle) => line.includes(needle)));
}

/** Every match of `pattern` in the masked lines, recorded as one call usage of `symbol`. */
function pushCallHits(scan: FileScan, contractId: string, symbol: string, pattern: RegExp, filter: CallHitFilter): void {
  pattern.lastIndex = 0;
  for (const [index, line] of scan.maskedLines.entries()) {
    if (!mayHoldCall(line, filter)) continue;
    for (const match of line.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const column = match.index + 1 + (filter.skipLeadingBackslash && match[0]?.startsWith("\\") ? 1 : 0);
      scan.push(contractId, {
        kind: "call",
        language: scan.language,
        symbol,
        location: { path: scan.file.path, line: index + 1, column },
        excerpt: textAt(scan.lines, index).trim(),
      });
    }
  }
}

/** One regex per distinct alias form, kept for the rest of the file. */
function cachedPattern(cache: Map<string, RegExp>, key: string, build: () => RegExp): RegExp {
  const found = cache.get(key);
  if (found !== undefined) return found;
  const pattern = build();
  cache.set(key, pattern);
  return pattern;
}

const RUST_SEPARATOR = "\\s*::\\s*";
const DOT_SEPARATOR = "\\s*\\.\\s*";

/** A qualified name as a pattern that tolerates whitespace around each dot. */
function dottedPattern(value: string): string {
  return value.split(".").map(escapePattern).join("\\s*\\.\\s*");
}

/** A Rust path as a pattern that tolerates whitespace around each `::`. */
function rustPathPattern(value: string): string {
  return value.split("::").map(escapePattern).join(RUST_SEPARATOR);
}

/**
 * A Swift call counts only when it stays module-qualified or uses a `typealias` whose target is inside that
 * module; an unqualified imported name is ambiguous. Longest form first, so a prefix cannot shadow it.
 */
function matchSwiftCalls(scan: FileScan, contractId: string, matcher: CallUsageMatcher): void {
  for (const target of matcher.targets) {
    const qualified = `${matcher.module}.${target}`;
    const forms = [qualified];
    for (const alias of scan.swiftAliases) {
      if (qualified === alias.target) forms.push(alias.local);
      else if (qualified.startsWith(`${alias.target}.`)) forms.push(`${alias.local}${qualified.slice(alias.target.length)}`);
    }
    const alternatives = [...new Set(forms)].sort((left, right) => right.length - left.length).map(dottedPattern);
    pushCallHits(scan, contractId, qualified, new RegExp(`(?<![\\w$.])(?:${alternatives.join("|")})\\s*\\(`, "g"), EVERY_LINE);
  }
}

/** In Rust a crate is always in scope by name, so `crate::function(…)` needs no `use`, and a macro ends in `!`. */
function matchRustQualifiedCalls(scan: FileScan, contractId: string, matcher: CallUsageMatcher): void {
  for (const target of matcher.targets) {
    const full = rustPathPattern(`${matcher.module}::${target}`);
    pushCallHits(scan, contractId, `${matcher.module}.${target}`, new RegExp(`(?<![\\w$:])${full}\\s*(?:!\\s*[(\\[{]|\\()`, "g"), EVERY_LINE);
  }
}

/** In C# a type is reached by its full name, or by its simple name once `using` brings in its namespace. */
function matchCsharpCalls(scan: FileScan, contractId: string, matcher: CallUsageMatcher): void {
  // `using N;` brings in the types of N itself, not those of its sub-namespaces.
  const imported = scan.imports.some((candidate) => candidate.module === matcher.module);
  for (const target of matcher.targets) {
    const forms = [dottedPattern(`${matcher.module}.${target}`), ...(imported ? [dottedPattern(target)] : [])];
    for (const source of forms) {
      pushCallHits(scan, contractId, `${matcher.module}.${target}`, new RegExp(`(?<![\\w$.])${source}\\s*\\(`, "g"), EVERY_LINE);
    }
  }
}

/** A PHP call target is `Class::method(` or `new Class`; `use Foo as Alias` makes `Alias::method(` the same call. */
function matchPhpCalls(scan: FileScan, contractId: string, matcher: CallUsageMatcher): void {
  for (const target of matcher.targets) {
    const forms = phpCallForms(target, scan.phpAliases);
    if (forms.length === 0) continue;
    const formKey = forms.map((form) => `${form.kind}\0${form.receiver}\0${form.method ?? ""}`).join("\n");
    const pattern = cachedPattern(scan.phpReceiverPatterns, formKey, () => phpCallPattern(forms));
    pushCallHits(scan, contractId, `${matcher.module}.${target}`, pattern, PHP_HITS);
  }
}

/** A Ruby call is qualified (`JSON.parse(` or `JSON::parse(`); `Parser = JSON` then `Parser.parse(` is the same call. */
function matchRubyCalls(scan: FileScan, contractId: string, matcher: CallUsageMatcher): void {
  // One combined regex per target, not one per alias form, so a large alias table cannot multiply the scans.
  for (const target of matcher.targets) {
    const forms = rubyReceivers(target, scan.rubyAliases);
    if (forms.length === 0) continue;
    const formKey = forms.map((parts) => parts.join("\0")).join("\n");
    const pattern = cachedPattern(scan.rubyReceiverPatterns, formKey, () => {
      const alternation = forms.map((parts) => parts.map((part) => escapePattern(part)).join("\\s*(?:\\.|::)\\s*")).join("|");
      return new RegExp(`(?<![\\w$:])(?:::)?(?:${alternation})\\s*\\(`, "g");
    });
    pushCallHits(scan, contractId, `${matcher.module}.${target}`, pattern, RUBY_HITS);
  }
}

/** The languages that name a qualified call their own way; every other language is read through its bindings. */
const QUALIFIED_CALL_READERS: Partial<Record<SourceLanguage, CallReader>> = {
  swift: matchSwiftCalls,
  rust: matchRustQualifiedCalls,
  csharp: matchCsharpCalls,
  php: matchPhpCalls,
  ruby: matchRubyCalls,
};

/**
 * The expression that calls `target` through `binding`: the name it imported, or a member of the namespace
 * or module it stands for. Undefined when the binding cannot reach that target.
 */
function callableExpression(binding: Binding, target: string, language: SourceLanguage): string | undefined {
  const rust = language === "rust";
  const local = escapePattern(binding.local);
  if (target === "default") return binding.imported === "default" || binding.imported === "*" ? local : undefined;
  if (binding.imported === target) return local;
  if (rust && target.includes("::") && binding.imported === rustHead(target)) {
    return `${local}${RUST_SEPARATOR}${rustPathPattern(target.split("::").slice(1).join("::"))}`;
  }
  if (binding.imported === "*" || binding.imported === "default") {
    const reached = rust ? rustPathPattern(target) : escapePattern(target);
    return `${local}${rust ? RUST_SEPARATOR : DOT_SEPARATOR}${reached}`;
  }
  return undefined;
}

/** A call pattern for `callable`; a Rust macro is called with a bang, so `format_err!(…)` counts too. */
function callPattern(callable: string, language: SourceLanguage): RegExp {
  const rust = language === "rust";
  return new RegExp(`(?<![\\w$${rust ? ":" : ""}])${callable}${rust ? "\\s*(?:!\\s*[(\\[{]|\\()" : "\\s*\\("}`, "g");
}

/** A call through a name the file imported: `import legacy from "request"; legacy(url)`. */
function matchBindingCalls(scan: FileScan, contractId: string, matcher: CallUsageMatcher): void {
  // Swift names are resolved by `matchSwiftCalls`, which stays module-qualified; an imported name is ambiguous.
  if (scan.language === "swift") return;
  for (const binding of scan.bindings) {
    if (!moduleMatches(binding.module, matcher.module, scan.language)) continue;
    for (const target of matcher.targets) {
      const callable = callableExpression(binding, target, scan.language);
      if (callable === undefined) continue;
      const symbol = target === "default" ? matcher.module : `${matcher.module}.${target}`;
      pushCallHits(scan, contractId, symbol, callPattern(callable, scan.language), EVERY_LINE);
    }
  }
}

/** Every call site of a `call` matcher: the language's own qualified form, plus the names it imported. */
function matchCallUsage(scan: FileScan, contractId: string, matcher: CallUsageMatcher): void {
  const qualified = QUALIFIED_CALL_READERS[scan.language];
  if (qualified !== undefined) qualified(scan, contractId, matcher);
  matchBindingCalls(scan, contractId, matcher);
}

/** An `import` of the matcher's module, at the column of the module name in the source. */
function matchImportUsage(scan: FileScan, contractId: string, matcher: ImportUsageMatcher): void {
  for (const reference of scan.imports) {
    if (!moduleMatches(reference.module, matcher.module, scan.language)) continue;
    scan.push(contractId, {
      kind: "import",
      language: scan.language,
      symbol: matcher.module,
      location: { path: scan.file.path, line: reference.line, column: reference.column },
      excerpt: textAt(scan.lines, reference.line - 1).trim(),
    });
  }
}

/** A configuration line naming the matcher's key, in the file's own text: comments there count too. */
function matchConfigKeyUsage(scan: FileScan, contractId: string, matcher: ConfigUsageMatcher): void {
  for (const [index, line] of scan.lines.entries()) {
    const column = configKeyMatch(line, matcher);
    if (column === undefined) continue;
    scan.push(contractId, {
      kind: "config-key",
      language: scan.language,
      symbol: matcher.key,
      location: { path: scan.file.path, line: index + 1, column },
      excerpt: line.trim(),
    });
  }
}

/** Records the usages of one matcher in one file. A `symbol` matcher is read by the parsers, not here. */
function matchFileUsage(scan: FileScan, contractId: string, matcher: UsageMatcher): void {
  if (matcher.kind === "import") matchImportUsage(scan, contractId, matcher);
  else if (matcher.kind === "call") matchCallUsage(scan, contractId, matcher);
  else if (matcher.kind === "config-key") matchConfigKeyUsage(scan, contractId, matcher);
}

/** The regex scanner's pass over one file, for every contract that matches its language. */
function matchFileContract(scan: FileScan, contract: SourceUsageContract, hasParser: boolean): void {
  for (const matcher of contract.matchers) {
    if (matcher.language !== scan.language) continue;
    // The parser owns imports and calls of the languages it read; only configuration keys stay with the scanner.
    if (hasParser && matcher.kind !== "config-key") continue;
    matchFileUsage(scan, contract.id, matcher);
  }
}

/** The text of one file, masked, with the names it binds: everything the matchers need to read. */
function openFileScan(file: SourceFile, lines: readonly string[], push: (contractId: string, usage: SourceUsage) => void): FileScan {
  const maskState: MaskState = { blockComment: false };
  const maskedLines = lines.map((line) => maskCodeLine(line, file.language, maskState));
  const uses = file.language === "php" ? phpUses(lines, maskedLines) : undefined;
  const imports = fileImports(file.language, lines, maskedLines, uses);
  return {
    file,
    language: file.language,
    lines,
    maskedLines,
    imports,
    bindings: imports.flatMap((reference) => reference.bindings),
    // Alias resolution is per file, not per matcher or target.
    rubyAliases: file.language === "ruby" ? rubyAliases(maskedLines) : [],
    phpAliases: uses?.aliases ?? [],
    swiftAliases: file.language === "swift" ? swiftAliases(maskedLines) : [],
    rubyReceiverPatterns: new Map(),
    phpReceiverPatterns: new Map(),
    push,
  };
}

/** The usages of one file, from the parser when it read it and from the regex scanner when it did not. */
async function scanSourceFile(file: SourceFile, contracts: readonly SourceUsageContract[], options: SourceUsageOptions, usage: UsageResults): Promise<void> {
  if ((file.language === "ruby" || file.language === "php") && checkoutSourceIgnored(file.path)) return;
  const contents = await (options.fileSystem ?? nodeFileSystem).readText(file.absolutePath);
  usage.startFile();
  // JavaScript, TypeScript, and Python import and call usages come from the parser when it can read the file;
  // otherwise (too large, over budget, or the runtime cannot load) the regex scanner below handles them.
  const parsed = options.parser === false ? undefined : await parsedUsages(file, contents, contracts);
  if (parsed !== undefined) {
    noteCappedUsage(options.skips, file.path, parsed.analysisCapped);
    for (const [contractId, usages] of parsed) for (const one of usages) usage.push(contractId, one);
    const needsConfigKeys = contracts.some((contract) => contract.matchers.some((matcher) => matcher.kind === "config-key" && matcher.language === file.language));
    if (!needsConfigKeys) return;
  }
  const scan = openFileScan(file, contents.split(/\r?\n/), usage.push);
  for (const contract of contracts) matchFileContract(scan, contract, parsed !== undefined);
}

/** Usages in file order, so two runs of the same repository report the same list. */
function compareUsagePosition(left: SourceUsage, right: SourceUsage): number {
  const pathOrder = left.location.path.localeCompare(right.location.path);
  if (pathOrder !== 0) return pathOrder;
  const lineOrder = (left.location.line ?? 0) - (right.location.line ?? 0);
  return lineOrder !== 0 ? lineOrder : (left.location.column ?? 0) - (right.location.column ?? 0);
}

/** One analysis per contract, in the order the caller passed them, each with its impact. */
function summarizeUsage(contracts: readonly SourceUsageContract[], usage: UsageResults): SourceUsageAnalysis[] {
  return contracts.map((contract) => {
    const usages = requiredAt(usage.results, contract.id).sort(compareUsagePosition);
    return { contractId: contract.id, usages, impact: impactFor(usages) };
  });
}

/** Finds every use of the given contracts in a repository and summarizes the impact. */
export async function analyzeSourceUsage(root: string, contracts: readonly SourceUsageContract[], options: SourceUsageOptions = {}): Promise<SourceUsageAnalysis[]> {
  const usage = openUsageResults(contracts);
  const relevantLanguages = new Set(contracts.flatMap((contract) => contract.matchers.map((matcher) => matcher.language)));
  const files = await sourceFiles(resolve(root), { include: (language) => relevantLanguages.has(language) }, options.fileSystem ?? nodeFileSystem);
  const checkMemory = openMemoryGuard();
  for (const file of files) {
    checkMemory();
    await scanSourceFile(file, contracts, options, usage);
  }
  return summarizeUsage(contracts, usage);
}

export { impactFor };
export * from "./usage/dynamic-references.js";
export type { SourceUsageAnalysis, SourceUsageContract } from "./domain.js";

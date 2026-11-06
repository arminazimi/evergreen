import { openMemoryGuard } from "./usage/memory-guard.js";
import { resolve } from "node:path";

import type { ConfigUsageMatcher, ImportUsageMatcher, SourceUsage, SourceUsageAnalysis, SourceUsageContract, UsageMatcher } from "./domain.js";
import type { ScanFileSystem } from "./file-system.js";
import { nodeFileSystem } from "./node-file-system.js";
import { type SourceFile, sourceFileEntries } from "./source-files.js";
import { noteCappedUsage } from "./usage/binding-budget.js";
import { matchCallUsage } from "./usage/call-matching.js";
import { checkoutSourceIgnored } from "./usage/checkout.js";
import { configKeyMatch } from "./usage/config-keys.js";
import { type FileScan, textAt } from "./usage/file-scan.js";
import { fileImports } from "./usage/import-readers.js";
import { swiftAliases } from "./usage/imports.js";
import { impactFor } from "./usage/impact.js";
import { maskCodeLine, type MaskState } from "./usage/masking.js";
import { moduleMatches } from "./usage/module-matches.js";
import { parsedUsages } from "./usage/parsers.js";
import { phpUses } from "./usage/php.js";
import { rubyAliases } from "./usage/ruby.js";

/** The map value at `key`; every key here comes from the contract list, so a miss is a bug. */
function requiredAt<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`missing source-usage entry for ${String(key)}`);
  return value;
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
  // Stream the walk: each file is read, matched, and dropped before the next one is discovered, so
  // the live set stays one file plus the usages the caller asked for instead of the whole tree.
  const files = sourceFileEntries(resolve(root), { include: (language) => relevantLanguages.has(language) }, options.fileSystem ?? nodeFileSystem);
  const checkMemory = openMemoryGuard();
  for await (const file of files) {
    checkMemory();
    await scanSourceFile(file, contracts, options, usage);
  }
  return summarizeUsage(contracts, usage);
}

export { impactFor };
export * from "./usage/dynamic-references.js";
export type { SourceUsageAnalysis, SourceUsageContract } from "./domain.js";

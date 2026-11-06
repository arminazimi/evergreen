import type { SourceLanguage, SourceUsage } from "../domain.js";
import type { SourceFile } from "../source-files.js";
import type { Binding, ImportReference, SwiftAlias } from "./imports.js";
import { PHP_MAX_LINE } from "./php.js";
import type { phpUses } from "./php.js";
import type { rubyAliases } from "./ruby.js";
import { RUBY_MAX_LINE } from "./ruby-invocations.js";

/** The string at `index`, or the empty string when the array is shorter. */
export function textAt(values: readonly string[], index: number): string {
  return values[index] ?? "";
}

/** A file's text, its mask, and the names it imports: what every matcher of every contract reads. */
export interface FileScan {
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

/** What a line must look like before a call pattern is run over it, and how its column is counted. */
export interface CallHitFilter {
  /** A line longer than this is not scanned at all. */
  readonly maxLine: number;
  /** When non-empty, only a line containing one of these is scanned. */
  readonly needles: readonly string[];
  /** PHP writes `\Class::method(`; its usage points at the name, not at the leading backslash. */
  readonly skipLeadingBackslash: boolean;
}

export const EVERY_LINE: CallHitFilter = {
  maxLine: Number.POSITIVE_INFINITY,
  needles: [],
  skipLeadingBackslash: false,
};
export const RUBY_HITS: CallHitFilter = { maxLine: RUBY_MAX_LINE, needles: ["("], skipLeadingBackslash: false };
export const PHP_HITS: CallHitFilter = { maxLine: PHP_MAX_LINE, needles: ["(", "new"], skipLeadingBackslash: true };

/** True when a masked line is short enough, and holds enough, to be worth scanning for a call. */
export function mayHoldCall(line: string, filter: CallHitFilter): boolean {
  return (
    line.length <= filter.maxLine &&
    (filter.needles.length === 0 || filter.needles.some((needle) => line.includes(needle)))
  );
}

/** Every match of `pattern` in the masked lines, recorded as one call usage of `symbol`. */
export function pushCallHits(
  scan: FileScan,
  contractId: string,
  symbol: string,
  pattern: RegExp,
  filter: CallHitFilter,
): void {
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
export function cachedPattern(cache: Map<string, RegExp>, key: string, build: () => RegExp): RegExp {
  const found = cache.get(key);
  if (found !== undefined) return found;
  const pattern = build();
  cache.set(key, pattern);
  return pattern;
}

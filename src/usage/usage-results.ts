import type { SourceUsage } from "../domain.js";
import { lineExcerpt } from "./tree-sitter.js";

/** Where the usages of one file are located: its path, language, source lines, and offset-to-position mapping. */
export interface UsageContext {
  path: string;
  language: SourceUsage["language"];
  lines: readonly string[];
  locate: (offset: number) => { line: number; column: number };
}

/** The location and excerpt of the source at one offset. */
export function describeAt(context: UsageContext, offset: number): Pick<SourceUsage, "location" | "excerpt"> {
  const { line, column } = context.locate(offset);
  return {
    location: { path: context.path, line, column },
    excerpt: lineExcerpt(context.lines, line),
  };
}

/** A usage of the given kind and symbol at one offset of the file. */
export function usageAt(context: UsageContext, kind: SourceUsage["kind"], symbol: string, offset: number): SourceUsage {
  return {
    kind,
    language: context.language,
    symbol,
    ...describeAt(context, offset),
  };
}

/** The usages one contract finds in one file. A repeat of the same kind, position, and symbol is kept once. */
export class UsageList {
  private readonly usages: SourceUsage[] = [];
  private readonly seen = new Set<string>();

  add(usage: SourceUsage): void {
    const key = `${usage.kind}:${usage.location.line}:${usage.location.column}:${usage.symbol}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.usages.push(usage);
  }

  /** The usages in source order. */
  sorted(): SourceUsage[] {
    return this.usages.sort(
      (left, right) =>
        (left.location.line ?? 0) - (right.location.line ?? 0) ||
        (left.location.column ?? 0) - (right.location.column ?? 0),
    );
  }
}

import { execFileSync } from "node:child_process";

import { DiffError } from "../diff.js";
import type { Finding, ScanResult } from "../domain.js";
import { planFixReport } from "../fix/index.js";
import { required } from "../required.js";
import type { FixSuggestion, LineRange, SuggestionComment } from "./types.js";

function unquotePath(header: string): string {
  if (!header.startsWith('"') || !header.endsWith('"')) return header;
  const named: Record<string, string> = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", '"': '"', "\\": "\\" };
  return header
    .slice(1, -1)
    .replace(/\\([0-7]{1,3}|.)/g, (_, escape: string) =>
      /^[0-7]+$/.test(escape) ? String.fromCharCode(parseInt(escape, 8)) : (named[escape] ?? escape),
    );
}

/** Parses `git diff --unified=0` into the new-side line ranges it added or changed, keyed by repository-relative path. */
export function parseChangedLines(diff: string): Map<string, LineRange[]> {
  const changed = new Map<string, LineRange[]>();
  let path: string | undefined;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const header = unquotePath(line.slice(4).trim());
      path = header === "/dev/null" ? undefined : header.replace(/^b\//, "");
      continue;
    }
    if (path === undefined || !line.startsWith("@@ ")) continue;
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) continue;
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count > 0) changed.set(path, [...(changed.get(path) ?? []), { start, end: start + count - 1 }]);
  }
  return changed;
}

/** Splits findings into those on a line the range changed and the rest; a finding without a line is never on a changed line. */
export function selectChangedAnnotations(
  findings: readonly Finding[],
  changed: ReadonlyMap<string, readonly LineRange[]>,
): { annotated: Finding[]; unannotated: Finding[] } {
  const annotated: Finding[] = [];
  const unannotated: Finding[] = [];
  for (const finding of findings) {
    const line = finding.location.line;
    const ranges = changed.get(finding.location.path) ?? [];
    if (line !== undefined && ranges.some((range) => line >= range.start && line <= range.end)) annotated.push(finding);
    else unannotated.push(finding);
  }
  return { annotated, unannotated };
}

export function changedLines(root: string, range: string): Map<string, LineRange[]> {
  try {
    const output = execFileSync(
      "git",
      ["-c", "core.quotePath=false", "diff", "--unified=0", "--no-color", "--no-ext-diff", "--no-textconv", range],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 1024,
        windowsHide: true,
      },
    );
    return parseChangedLines(output);
  } catch (error) {
    const stderr = (error as { stderr?: string | Buffer }).stderr?.toString().trim();
    throw new DiffError(stderr || "git diff failed.");
  }
}

/**
 * Turns the unified diff a fixer returns into the replacements it proposes. Each run of removed lines
 * followed by added lines becomes one suggestion; a run that only inserts or deletes lines cannot be
 * expressed as one, so it is left out.
 */
export function suggestionsFromPatch(path: string, patch: string): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];
  let headLine = 0;
  let inHunk = false;
  let removed: number[] = [];
  let added: string[] = [];

  const flush = (): void => {
    if (removed.length > 0 && added.length > 0) {
      suggestions.push({
        path,
        startLine: required(removed[0], "a removed line"),
        line: required(removed.at(-1), "a removed line"),
        replacement: added,
      });
    }
    removed = [];
    added = [];
  };

  for (const line of patch.split("\n")) {
    if (line.startsWith("@@ ")) {
      flush();
      inHunk = true;
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match) headLine = Number(match[1]);
      continue;
    }
    if (!inHunk && (line.startsWith("--- ") || line.startsWith("+++ "))) continue;
    if (line.startsWith("+")) {
      added.push(line.slice(1));
      continue;
    }
    if (line.startsWith("-")) {
      removed.push(headLine);
      headLine += 1;
      continue;
    }
    if (line.startsWith(" ")) {
      flush();
      headLine += 1;
    }
  }
  flush();
  return suggestions;
}

/**
 * Plans the `suggestion` blocks for a diff-mode scan: every fixer runs over the introduced findings,
 * and a replacement is kept only when every line it rewrites was added or changed by the pull request.
 * Findings without a deterministic fix, and patches that only insert or delete lines, produce nothing.
 */
export async function planFixSuggestions(
  result: ScanResult,
  changed: ReadonlyMap<string, readonly LineRange[]>,
): Promise<FixSuggestion[]> {
  const plan = await planFixReport(result);
  const suggestions: FixSuggestion[] = [];
  for (const patch of plan.patches) {
    const ranges = changed.get(patch.path) ?? [];
    for (const suggestion of suggestionsFromPatch(patch.path, patch.diff)) {
      const replacedLines = Array.from(
        { length: suggestion.line - suggestion.startLine + 1 },
        (_, offset) => suggestion.startLine + offset,
      );
      const touchesOnlyChangedLines = replacedLines.every((line) =>
        ranges.some((range) => line >= range.start && line <= range.end),
      );
      if (touchesOnlyChangedLines) suggestions.push(suggestion);
    }
  }
  return suggestions.sort(
    (left, right) => left.path.localeCompare(right.path) || left.startLine - right.startLine || left.line - right.line,
  );
}

/** A `suggestion` block: the lines GitHub replaces the commented lines with. */
export function renderSuggestion(replacement: readonly string[]): string {
  return ["```suggestion", ...replacement, "```"].join("\n");
}

/** One inline review comment that applies a planned fix. */
export function suggestionComment(suggestion: FixSuggestion): SuggestionComment {
  return {
    path: suggestion.path,
    ...(suggestion.startLine === suggestion.line
      ? {}
      : { start_line: suggestion.startLine, start_side: "RIGHT" as const }),
    line: suggestion.line,
    side: "RIGHT",
    body: renderSuggestion(suggestion.replacement),
  };
}

/** Hidden marker that identifies the one review Evergreen owns on a pull request, so re-runs update it. */
export const FIX_SUGGESTION_MARKER = "<!-- evergreen-fix-suggestions -->";

/** The review body: the marker, then what the review offers and how to make the same change locally. */
export function renderSuggestionReview(count: number): string {
  return `${FIX_SUGGESTION_MARKER}\nEvergreen can fix ${count} lifecycle finding${count === 1 ? "" : "s"} on lines this pull request changed. Apply a suggestion, or run \`npx evergreen-deprecation fix\` to make every change locally.`;
}

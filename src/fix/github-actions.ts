import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { renderDiff } from "../agent-instructions.js";
import type { Finding } from "../domain.js";
import type { Fixer, FilePatch } from "./index.js";

/** `actions/checkout@v5 or later`: the only replacement wording that names an exact action and major version. */
const ACTION_REPLACEMENT = /^([a-z0-9._-]+\/[a-z0-9._/-]+)@v(\d+) or later$/i;
const USES_LINE = /^(\s*(?:-\s*)?uses\s*:\s*["']?)([^\s#"']+)(.*)$/;
const TAG_REF = /^v?(\d+)(?:\.\d+){0,2}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

interface ActionEdit {
  action: string;
  major: number;
}

interface Targets {
  lines: Map<number, ActionEdit>;
  findings: Finding[];
}

/** Rewrites `uses: owner/action@vN` to the major version the rule names. SHA-pinned and floating references are left alone. */
export const githubActionsUsesFixer: Fixer = {
  id: "github-actions-uses",
  async plan(result, refuse) {
    const targets = new Map<string, Targets>();
    for (const finding of result.findings) {
      if (!finding.ruleId.startsWith("github-actions.") || !finding.location.path.startsWith(".github/workflows/")) continue;
      if (finding.location.line === undefined) {
        refuse?.(finding, "The finding names no line to rewrite.");
        continue;
      }
      const edit = actionEdit(finding);
      if (!edit) {
        refuse?.(finding, "The rule's replacement does not name an action and a major version.");
        continue;
      }
      const entry: Targets = targets.get(finding.location.path) ?? { lines: new Map(), findings: [] };
      entry.lines.set(finding.location.line, edit);
      entry.findings.push(finding);
      targets.set(finding.location.path, entry);
    }

    const patches: FilePatch[] = [];
    for (const [path, { lines, findings }] of [...targets].sort(([a], [b]) => a.localeCompare(b))) {
      const decline = (reason: string) => {
        for (const finding of findings) refuse?.(finding, reason);
      };
      const absolute = resolve(result.root, path);
      const inside = relative(resolve(result.root), absolute);
      if (inside.startsWith("..") || isAbsolute(inside)) {
        decline("The path resolves outside the repository.");
        continue;
      }
      const before = await readFile(absolute, "utf8").catch(() => undefined);
      if (before === undefined) {
        decline("The workflow file could not be read.");
        continue;
      }
      if (!before.endsWith("\n")) {
        decline("The workflow file does not end with a newline.");
        continue;
      }
      const original = before.split("\n");
      const text = original.map((line, index) => {
        const edit = lines.get(index + 1);
        return edit ? bumpAction(line, edit.action, edit.major) : line;
      }).join("\n");
      if (text !== before) patches.push({ path, diff: renderDiff(path, before.slice(0, -1), text.slice(0, -1)) });
      const updated = text.split("\n");
      for (const finding of findings) {
        const index = finding.location.line! - 1;
        if (updated[index] !== original[index]) continue;
        const reason = refusalReason(original[index], lines.get(index + 1)!);
        if (reason !== undefined) refuse?.(finding, reason);
      }
    }
    return patches;
  },
};

function actionEdit(finding: Finding): ActionEdit | undefined {
  if (finding.location.line === undefined || !finding.location.path.startsWith(".github/workflows/")) return undefined;
  const match = ACTION_REPLACEMENT.exec(finding.replacement ?? "");
  return match ? { action: match[1]!.toLowerCase(), major: Number(match[2]) } : undefined;
}

function bumpAction(line: string, action: string, major: number): string {
  const match = USES_LINE.exec(line);
  if (!match) return line;
  const target = match[2]!;
  const separator = target.lastIndexOf("@");
  if (separator <= 0 || target.slice(0, separator).toLowerCase() !== action) return line;
  const current = TAG_REF.exec(target.slice(separator + 1));
  if (!current || Number(current[1]) >= major) return line;
  return `${match[1]}${target.slice(0, separator)}@v${major}${match[3]}`;
}

/** Why the line still holds the reference the finding named, or undefined when there was nothing left to raise. */
function refusalReason(line: string | undefined, edit: ActionEdit): string | undefined {
  if (line === undefined) return "The finding names no line to rewrite.";
  const match = USES_LINE.exec(line);
  if (!match) return "The line is not a `uses:` reference.";
  const target = match[2]!;
  const separator = target.lastIndexOf("@");
  if (separator <= 0 || target.slice(0, separator).toLowerCase() !== edit.action) return "The line names a different action than the rule.";
  const reference = target.slice(separator + 1);
  if (COMMIT_SHA.test(reference)) return "The reference is pinned to a commit SHA, not a major-version tag.";
  const current = TAG_REF.exec(reference);
  if (!current) return "The reference is not a version tag; a branch or floating reference is left alone.";
  if (Number(current[1]) >= edit.major) return undefined;
  return "The reference did not match the action on its line.";
}

import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { renderDiff } from "../agent-instructions.js";
import type { Finding } from "../domain.js";
import type { Fixer, FilePatch } from "./index.js";

/** `actions/checkout@v5 or later`: the only replacement wording that names an exact action and major version. */
const ACTION_REPLACEMENT = /^([a-z0-9._-]+\/[a-z0-9._/-]+)@v(\d+) or later$/i;
const USES_LINE = /^(\s*(?:-\s*)?uses\s*:\s*["']?)([^\s#"']+)(.*)$/;
const TAG_REF = /^v?(\d+)(?:\.\d+){0,2}$/;

/** Rewrites `uses: owner/action@vN` to the major version the rule names. SHA-pinned and floating references are left alone. */
export const githubActionsUsesFixer: Fixer = {
  id: "github-actions-uses",
  async plan(result) {
    const edits = new Map<string, Map<number, { action: string; major: number }>>();
    for (const finding of result.findings) {
      const edit = actionEdit(finding);
      if (!edit) continue;
      const lines = edits.get(finding.location.path) ?? new Map();
      lines.set(finding.location.line!, edit);
      edits.set(finding.location.path, lines);
    }
    const patches: FilePatch[] = [];
    for (const [path, lines] of [...edits].sort(([a], [b]) => a.localeCompare(b))) {
      const absolute = resolve(result.root, path);
      const inside = relative(resolve(result.root), absolute);
      if (inside.startsWith("..") || isAbsolute(inside)) continue;
      const before = await readFile(absolute, "utf8");
      const text = before.split("\n").map((line, index) => {
        const edit = lines.get(index + 1);
        return edit ? bumpAction(line, edit.action, edit.major) : line;
      }).join("\n");
      // renderDiff treats the text after the last newline as a line; dropping the newline keeps git apply from seeing a phantom one.
      if (text !== before && before.endsWith("\n")) patches.push({ path, diff: renderDiff(path, before.slice(0, -1), text.slice(0, -1)) });
    }
    return patches;
  },
};

function actionEdit(finding: Finding): { action: string; major: number } | undefined {
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

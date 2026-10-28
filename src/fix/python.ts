import { readFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";

import semver from "semver";
import { parse as parseToml } from "smol-toml";

import { renderDiff } from "../agent-instructions.js";
import { loadDataFile } from "../data-source.js";
import { validateRegistryV2 } from "../registry.js";
import type { FilePatch, Fixer } from "./index.js";

/** `.python-version` is already handled by runtimePinsFixer; this adds explicit requires-python lower bounds. */
export const pythonFixer: Fixer = {
  id: "python",
  async plan(result) {
    const paths = new Set(result.findings.filter((finding) =>
      finding.ruleId.startsWith("python.runtime.eol-") && basename(finding.location.path) === "pyproject.toml",
    ).map((finding) => finding.location.path));
    if (paths.size === 0) return [];
    const day = result.asOf ?? result.scannedAt.slice(0, 10);
    let target: string | undefined;
    for (const rule of validateRegistryV2(await loadDataFile("registry/python.json")).rules) {
      const bound = /^vers:pypi\/<(\d+\.\d+)$/.exec(rule.vers)?.[1];
      if (rule.id.startsWith("python.runtime.eol-") && bound && (!rule.deadline || rule.deadline <= day)
        && (!target || semver.gt(`${bound}.0`, `${target}.0`))) target = bound;
    }
    if (!target) return [];

    const patches: FilePatch[] = [];
    for (const path of [...paths].sort()) {
      const absolute = resolve(result.root, path);
      const inside = relative(resolve(result.root), absolute);
      if (inside.startsWith("..") || isAbsolute(inside)) continue;
      const before = await readFile(absolute, "utf8");
      const document = parseToml(before);
      let project = false;
      const text = before.split("\n").map((line) => {
        const header = /^\s*\[([^\]]+)\]\s*(?:#.*)?\r?$/.exec(line);
        if (header) project = header[1]!.trim() === "project";
        if (!project) return line;
        const match = /^(\s*requires-python\s*=\s*)(["'])([^"']*)\2(\s*(?:#.*)?\r?)$/.exec(line);
        if (!match) return line;
        const value = raiseLowerBound(match[3]!, target!);
        return `${match[1]}${match[2]}${value}${match[2]}${match[4]}`;
      }).join("\n");
      if (text === before) continue;
      const updated = parseToml(text);
      const projectBefore = document.project;
      const projectAfter = updated.project;
      if (!projectBefore || typeof projectBefore !== "object" || Array.isArray(projectBefore)
        || !projectAfter || typeof projectAfter !== "object" || Array.isArray(projectAfter)) continue;
      Reflect.set(projectAfter, "requires-python", Reflect.get(projectBefore, "requires-python"));
      if (JSON.stringify(updated) !== JSON.stringify(document)) continue;
      // Match the other fixers: only emit diffs whose final line git apply can reproduce exactly.
      if (text !== before && before.endsWith("\n")) patches.push({ path, diff: renderDiff(path, before.slice(0, -1), text.slice(0, -1)) });
    }
    return patches;
  },
};

/** Keep upper bounds byte-for-byte and decline constraints that would exclude the supported target. */
function raiseLowerBound(value: string, target: string): string {
  const clauses = value.split(",");
  const bounds = clauses.map((clause) => /^\s*(>=|<=|<)\s*(\d+(?:\.\d+){0,2})\s*$/.exec(clause));
  if (bounds.some((bound) => !bound)) return value;
  const version = `${target}.0`;
  if (bounds.some((bound) => bound![1] !== ">=" && !semver.satisfies(version, `${bound![1]}${semver.coerce(bound![2]!)?.version}`))) return value;
  return clauses.map((clause, index) => {
    const bound = bounds[index]!;
    const current = semver.coerce(bound[2]!);
    return bound[1] === ">=" && current && semver.lt(current, version) ? clause.replace(bound[2]!, target) : clause;
  }).join(",");
}

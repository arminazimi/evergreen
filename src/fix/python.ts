import { readFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";

import semver from "semver";
import { parse as parseToml } from "smol-toml";

import { renderDiff } from "../agent-instructions.js";
import { loadDataFile } from "../data-source.js";
import type { Finding } from "../domain.js";
import { validateRegistryV2 } from "../registry.js";
import type { FilePatch, Fixer } from "./index.js";

const REQUIRES_PYTHON = /^(\s*requires-python\s*=\s*)(["'])([^"']*)\2(\s*(?:#.*)?\r?)$/;
const BOUND = /^\s*(>=|<=|<)\s*(\d+(?:\.\d+){0,2})\s*$/;
const TABLE = /^\s*\[([^\]]+)\]\s*(?:#.*)?\r?$/;

/** `.python-version` is already handled by runtimePinsFixer; this adds explicit requires-python lower bounds. */
export const pythonFixer: Fixer = {
  id: "python",
  async plan(result, refuse) {
    const targets = new Map<string, Finding[]>();
    for (const finding of result.findings) {
      if (!finding.ruleId.startsWith("python.runtime.eol-") || basename(finding.location.path) !== "pyproject.toml")
        continue;
      targets.set(finding.location.path, [...(targets.get(finding.location.path) ?? []), finding]);
    }
    if (targets.size === 0) return [];
    const day = result.asOf ?? result.scannedAt.slice(0, 10);
    let target: string | undefined;
    for (const rule of validateRegistryV2(await loadDataFile("registry/python.json")).rules) {
      const bound = /^vers:pypi\/<(\d+\.\d+)$/.exec(rule.vers)?.[1];
      if (
        rule.id.startsWith("python.runtime.eol-") &&
        bound &&
        (!rule.deadline || rule.deadline <= day) &&
        (!target || semver.gt(`${bound}.0`, `${target}.0`))
      )
        target = bound;
    }
    if (!target) {
      for (const finding of [...targets.values()].flat())
        refuse?.(finding, "The registry names no supported Python line for the scan date.");
      return [];
    }
    const supported = target;

    const patches: FilePatch[] = [];
    for (const [path, findings] of [...targets].sort(([a], [b]) => a.localeCompare(b))) {
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
        decline("The file could not be read.");
        continue;
      }
      if (!before.endsWith("\n")) {
        decline("The file does not end with a newline.");
        continue;
      }
      const document = parseToml(before);
      const original = before.split("\n");
      const state = { project: false };
      const text = original.map((line) => raiseLine(line, state, supported)).join("\n");
      const updated = text === before ? document : parseToml(text);
      const projectBefore = document.project;
      const projectAfter = updated.project;
      if (
        !projectBefore ||
        typeof projectBefore !== "object" ||
        Array.isArray(projectBefore) ||
        !projectAfter ||
        typeof projectAfter !== "object" ||
        Array.isArray(projectAfter)
      ) {
        decline("The file has no `[project]` table to edit.");
        continue;
      }
      if (text !== before) {
        Reflect.set(projectAfter, "requires-python", Reflect.get(projectBefore, "requires-python"));
        if (JSON.stringify(updated) !== JSON.stringify(document)) {
          decline("The edit would change other `pyproject.toml` keys.");
          continue;
        }
        patches.push({ path, diff: renderDiff(path, before.slice(0, -1), text.slice(0, -1)) });
      }
      const after = text.split("\n");
      for (const finding of findings) {
        const index = (finding.location.line ?? 0) - 1;
        if (index >= 0 && after[index] !== original[index]) continue;
        const reason = refusalReason(index >= 0 ? original[index] : undefined, supported);
        if (reason !== undefined) refuse?.(finding, reason);
      }
    }
    return patches;
  },
};

/** The line with its `requires-python` lower bound raised; `state.project` tracks the enclosing table. */
function raiseLine(line: string, state: { project: boolean }, target: string): string {
  const table = TABLE.exec(line)?.[1];
  if (table !== undefined) state.project = table.trim() === "project";
  if (!state.project) return line;
  const match = REQUIRES_PYTHON.exec(line);
  if (!match) return line;
  const bound = match[3];
  if (bound === undefined) return line;
  return `${match[1]}${match[2]}${raiseLowerBound(bound, target)}${match[2]}${match[4]}`;
}

/** One literal `>=1.2` bound of a `requires-python` constraint. */
interface PythonBound {
  operator: string;
  version: string;
}

/** The clause's operator and version, or undefined when it is not a literal bound. */
function parseBound(clause: string): PythonBound | undefined {
  const match = BOUND.exec(clause);
  const operator = match?.[1];
  const version = match?.[2];
  return operator === undefined || version === undefined ? undefined : { operator, version };
}

/** Every comma-separated clause as a literal bound, or undefined when one is not. */
function parseBounds(value: string): PythonBound[] | undefined {
  const bounds: PythonBound[] = [];
  for (const clause of value.split(",")) {
    const bound = parseBound(clause);
    if (bound === undefined) return undefined;
    bounds.push(bound);
  }
  return bounds;
}

/** Whether the bound rules out the release; only a lower bound can admit it, and only when it does not exclude it. */
function excludesRelease(bound: PythonBound, release: string): boolean {
  if (bound.operator === ">=") return false;
  return !semver.satisfies(release, `${bound.operator}${semver.coerce(bound.version)?.version}`);
}

/** Why the line was left as it is, or undefined when the constraint already allows the supported target. */
function refusalReason(line: string | undefined, target: string): string | undefined {
  if (line === undefined) return "The finding names no line to rewrite.";
  const match = REQUIRES_PYTHON.exec(line);
  const value = match?.[3];
  if (value === undefined) return "The line is not a literal `requires-python` assignment.";
  const bounds = parseBounds(value);
  if (bounds === undefined) return "The `requires-python` constraint is not a set of literal bounds.";
  const release = `${target}.0`;
  if (bounds.some((bound) => excludesRelease(bound, release)))
    return "The `requires-python` constraint excludes the supported Python version.";
  return undefined;
}

/** Keep upper bounds byte-for-byte and decline constraints that would exclude the supported target. */
function raiseLowerBound(value: string, target: string): string {
  const clauses = value.split(",");
  const bounds = parseBounds(value);
  if (bounds === undefined) return value;
  const release = `${target}.0`;
  if (bounds.some((bound) => excludesRelease(bound, release))) return value;
  return clauses
    .map((clause, index) => {
      const bound = bounds[index];
      if (bound === undefined) return clause;
      const current = semver.coerce(bound.version);
      return bound.operator === ">=" && current && semver.lt(current, release)
        ? clause.replace(bound.version, target)
        : clause;
    })
    .join(",");
}

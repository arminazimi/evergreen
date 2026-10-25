import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import semver from "semver";

import { renderDiff } from "../agent-instructions.js";
import { loadDataFile } from "../data-source.js";
import type { Finding, ScanResult } from "../domain.js";
import { validateRegistryV2 } from "../registry.js";
import type { FilePatch, Fixer } from "./index.js";

/** An exact runtime pin: `20`, `v20`, `20.11`, or `20.11.0`. Ranges such as `>=20`, `^20`, `20.x`, or `18 || 20` never match. */
const EXACT_PIN = /^v?\d+(?:\.\d+){0,2}$/;
const NODE_REPLACEMENT = /^Node\.js (\d+) LTS or later$/;
const PYTHON_UPPER_BOUND = /^vers:pypi\/<(\d+\.\d+)$/;
const ENGINES_NODE = /^(\s*"node"\s*:\s*")([^"]*)(")/;

type Runtime = "node" | "python";

interface Pin {
  runtime: Runtime;
  /** Rewrites the pinned value on its line, or returns the line unchanged when it is not an exact pin. */
  rewrite(line: string, target: string): string;
}

/** The files whose whole first line is the pin, and the runtime each one pins. */
const VERSION_FILES: Record<string, Runtime> = { ".nvmrc": "node", ".node-version": "node", ".python-version": "python" };

function pinFor(path: string): Pin | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const runtime = VERSION_FILES[name];
  if (runtime) return { runtime, rewrite: rewriteVersionFile };
  if (name === "package.json") return { runtime: "node", rewrite: rewriteEngines };
  return undefined;
}

/** Replaces the version in `value` with `target`, keeping a leading `v`; returns undefined when `value` is not an exact pin. */
function pinned(value: string, target: string): string | undefined {
  if (!EXACT_PIN.test(value)) return undefined;
  return `${value.startsWith("v") ? "v" : ""}${target}`;
}

function rewriteVersionFile(line: string, target: string): string {
  const value = line.trim();
  const next = pinned(value, target);
  return next === undefined ? line : line.replace(value, next);
}

function rewriteEngines(line: string, target: string): string {
  const match = ENGINES_NODE.exec(line);
  const next = match && pinned(match[2]!, target);
  return match && next !== undefined ? `${match[1]}${next}${match[3]}${line.slice(match[0].length)}` : line;
}

/** The lowest line a finding's rule does not cover, as `22` for Node.js or `3.11` for Python. */
async function targetLine(finding: Finding, runtime: Runtime, pythonLine: () => Promise<string | undefined>): Promise<string | undefined> {
  return runtime === "node" ? NODE_REPLACEMENT.exec(finding.replacement ?? "")?.[1] : pythonLine();
}

function isRuntimeRule(finding: Finding, runtime: Runtime): boolean {
  return runtime === "node" ? finding.ruleId.startsWith("nodejs.runtime.") : finding.ruleId.startsWith("python.runtime.");
}

/**
 * Moves an exact Node.js or Python pin to the lowest line the finding's rule does not cover. It handles `.nvmrc`,
 * `.node-version`, `.python-version`, and an exact `engines.node`; a range is a compatibility statement, not a pin, and
 * is never rewritten.
 */
export const runtimePinsFixer: Fixer = {
  id: "runtime-pins",
  async plan(result) {
    let line: Promise<string | undefined> | undefined;
    const pythonLine = () => (line ??= lowestSupportedPython(result.asOf ?? result.scannedAt.slice(0, 10)));
    const edits = new Map<string, Map<number, { pin: Pin; target: string }>>();
    for (const finding of result.findings) {
      const pin = pinFor(finding.location.path);
      if (!pin || finding.location.line === undefined || !isRuntimeRule(finding, pin.runtime)) continue;
      const target = await targetLine(finding, pin.runtime, pythonLine);
      if (!target) continue;
      const lines = edits.get(finding.location.path) ?? new Map();
      lines.set(finding.location.line, { pin, target });
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
        return edit ? edit.pin.rewrite(line, edit.target) : line;
      }).join("\n");
      // renderDiff treats the text after the last newline as a line; dropping the newline keeps git apply from seeing a phantom one.
      if (text !== before && before.endsWith("\n")) patches.push({ path, diff: renderDiff(path, before.slice(0, -1), text.slice(0, -1)) });
    }
    return patches;
  },
};

/** The lowest Python line that no ended runtime rule covers on `day`: the highest `<3.11` bound among them, here `3.11`. */
async function lowestSupportedPython(day: string): Promise<string | undefined> {
  let lowest: string | undefined;
  for (const rule of validateRegistryV2(await loadDataFile("registry/python.json")).rules) {
    const bound = PYTHON_UPPER_BOUND.exec(rule.vers)?.[1];
    const ended = rule.event !== "scheduled-end-of-life" && (rule.deadline === undefined || rule.deadline <= day);
    if (rule.id.startsWith("python.runtime.") && bound && ended && (lowest === undefined || semver.gt(`${bound}.0`, `${lowest}.0`))) lowest = bound;
  }
  return lowest;
}

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
const NODE_MAJOR_RANGE = /^vers:semver\/>=(\d+)\.0\.0\|<(\d+)\.0\.0$/;
const NODE_BELOW_MAJOR = /^vers:semver\/<(\d+)\.0\.0$/;
const PYTHON_UPPER_BOUND = /^vers:pypi\/<(\d+\.\d+)$/;
const ENGINES_NODE = /^(\s*"node"\s*:\s*")([^"]*)(")/;

type Runtime = "node" | "python";

interface Pin {
  runtime: Runtime;
  /** Whether the whole line is the pin or the pin is an `engines.node` value inside it. */
  kind: "file" | "engines";
  /** The exact value the line pins, or undefined when the line does not hold an exact pin. */
  value(line: string): string | undefined;
  /** Rewrites the pinned value on its line, or returns the line unchanged when it is not an exact pin. */
  rewrite(line: string, target: string): string;
}

/** The files whose whole first line is the pin, and the runtime each one pins. */
const VERSION_FILES: Record<string, Runtime> = { ".nvmrc": "node", ".node-version": "node", ".python-version": "python" };

function pinFor(path: string): Pin | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const runtime = VERSION_FILES[name];
  if (runtime) return { runtime, kind: "file", value: versionFileValue, rewrite: rewriteVersionFile };
  if (name === "package.json") return { runtime: "node", kind: "engines", value: enginesValue, rewrite: rewriteEngines };
  return undefined;
}

function versionFileValue(line: string): string | undefined {
  const value = line.trim();
  return EXACT_PIN.test(value) ? value : undefined;
}

function enginesValue(line: string): string | undefined {
  const match = ENGINES_NODE.exec(line);
  return match && EXACT_PIN.test(match[2]!) ? match[2] : undefined;
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

function isRuntimeRule(finding: Finding, runtime: Runtime): boolean {
  return runtime === "node" ? finding.ruleId.startsWith("nodejs.runtime.") : finding.ruleId.startsWith("python.runtime.");
}

interface Targets {
  lines: Map<number, Pin>;
  findings: Finding[];
}

/**
 * Moves an exact Node.js or Python pin past every runtime rule that covers it. A Node.js pin goes to the lowest line
 * at or above it that no runtime rule covers, so it never stops on a line another rule reports (including a scheduled
 * end of life); Python goes to the highest end-of-life bound. It handles `.nvmrc`, `.node-version`, `.python-version`,
 * and an exact `engines.node`; a range is a compatibility statement, not a pin, and is never rewritten. A finding it
 * cannot rewrite is reported through `refuse` with the reason.
 */
export const runtimePinsFixer: Fixer = {
  id: "runtime-pins",
  async plan(result, refuse) {
    const targets = new Map<string, Targets>();
    for (const finding of result.findings) {
      const pin = pinFor(finding.location.path);
      if (!pin || !isRuntimeRule(finding, pin.runtime)) continue;
      if (finding.location.line === undefined) {
        refuse?.(finding, "The finding names no line to rewrite.");
        continue;
      }
      const entry: Targets = targets.get(finding.location.path) ?? { lines: new Map(), findings: [] };
      entry.lines.set(finding.location.line, pin);
      entry.findings.push(finding);
      targets.set(finding.location.path, entry);
    }
    if (targets.size === 0) return [];

    let covered: Promise<Set<number>> | undefined;
    let python: Promise<string | undefined> | undefined;
    const target = async (pin: Pin, value: string): Promise<string | undefined> => {
      if (pin.runtime === "node") return nextSupportedNode(await (covered ??= coveredNodeMajors()), value);
      return (python ??= lowestSupportedPython(result.asOf ?? result.scannedAt.slice(0, 10)));
    };

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
      const before = await readFile(absolute, "utf8");
      if (!before.endsWith("\n")) {
        decline("The pin file does not end with a newline.");
        continue;
      }
      const original = before.split("\n");
      const text = [...original];
      const rewritten = new Set<number>();
      for (let index = 0; index < text.length; index += 1) {
        const pin = lines.get(index + 1);
        const value = pin?.value(text[index]!);
        if (!pin || value === undefined) continue;
        const next = await target(pin, value);
        if (next === undefined) continue;
        const line = pin.rewrite(text[index]!, next);
        if (line === text[index]) continue;
        text[index] = line;
        rewritten.add(index + 1);
      }
      const after = text.join("\n");
      // renderDiff treats the text after the last newline as a line; dropping the newline keeps git apply from seeing a phantom one.
      if (after !== before) patches.push({ path, diff: renderDiff(path, before.slice(0, -1), after.slice(0, -1)) });
      for (const finding of findings) {
        const index = finding.location.line! - 1;
        if (rewritten.has(index + 1)) continue;
        const pin = lines.get(index + 1)!;
        const line = original[index] ?? "";
        const value = pin.value(line);
        const reason = refusalReason(line, pin, value === undefined ? undefined : await target(pin, value));
        if (reason !== undefined) refuse?.(finding, reason);
      }
    }
    return patches;
  },
};

/** Why the pin on `line` still holds the finding's value, or undefined when it is already past the target. */
function refusalReason(line: string, pin: Pin, target: string | undefined): string | undefined {
  if (pin.value(line) === undefined) {
    if (pin.kind === "engines" && !ENGINES_NODE.test(line)) return "The file has no `engines.node` value to rewrite.";
    if (pin.kind === "file" && line.trim() === "") return "The file has no version to rewrite.";
    return "The pin is a range, not an exact version.";
  }
  if (target === undefined) {
    return pin.runtime === "node" ? "The rule names no supported Node.js line." : "No supported Python line is known for the scan date.";
  }
  return undefined;
}

/** Every Node.js major an active runtime rule covers; `<18.0.0` covers 0 through 17. */
async function coveredNodeMajors(): Promise<Set<number>> {
  const covered = new Set<number>();
  for (const rule of validateRegistryV2(await loadDataFile("registry/nodejs.json")).rules) {
    if (!rule.id.startsWith("nodejs.runtime.")) continue;
    const range = NODE_MAJOR_RANGE.exec(rule.vers);
    if (range) {
      covered.add(Number.parseInt(range[1]!, 10));
      continue;
    }
    const below = NODE_BELOW_MAJOR.exec(rule.vers);
    if (below) for (let major = 0; major < Number.parseInt(below[1]!, 10); major += 1) covered.add(major);
  }
  return covered;
}

/** The lowest Node.js major at or above `value` that no runtime rule covers, so a second pass has nothing left to move. */
function nextSupportedNode(covered: Set<number>, value: string): string | undefined {
  const major = Number.parseInt(value.replace(/^v/, ""), 10);
  if (!Number.isInteger(major)) return undefined;
  let next = major;
  while (covered.has(next)) next += 1;
  return String(next);
}

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

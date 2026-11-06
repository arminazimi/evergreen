import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import semver from "semver";

import { parseGoMod } from "../detectors/go/parse-go-mod.js";
import type { Finding } from "../domain.js";
import type { FilePatch, Fixer, Refuse } from "./types.js";

const VERSION = /^\d+\.\d+(?:\.\d+)?$/;
const DIRECTIVE = /^(\s*(go|toolchain)\s+)((?:go)?\d+\.\d+(?:\.\d+)?)(\s*(?:\/\/.*)?\r?)$/;
const GO_REPLACEMENT = /^Go (\d+\.\d+(?:\.\d+)?) or later$/;

function version(value: string): string | undefined {
  if (!VERSION.test(value)) return undefined;
  return semver.valid(value.split(".").length === 2 ? `${value}.0` : value) ?? undefined;
}

/** Resolve symlinks before reading: findings and vendored metadata are untrusted repository input. */
async function readInside(root: string, path: string): Promise<string | undefined> {
  try {
    const inside = relative(await realpath(root), await realpath(path));
    if (inside === ".." || inside.startsWith("../") || inside.startsWith("..\\") || isAbsolute(inside))
      return undefined;
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * The vendor manifest records dependencies' own Go floors, including indirect dependencies.
 * Without it a requirement cannot be verified offline, so leave the module alone. Replacements
 * and exclusions need module resolution and are deliberately left to the user as well.
 * Returns why the module cannot be shown to keep its dependencies working, or undefined when it can.
 */
async function dependencyProblem(
  root: string,
  path: string,
  contents: string,
  target: string,
): Promise<string | undefined> {
  const code = contents.replace(/\/\/[^\n]*/g, "");
  if (/^\s*(?:replace|exclude)\b/m.test(code))
    return "The module has `replace` or `exclude` directives, which need module resolution.";
  const requirements = parseGoMod(code).filter((item) => item.kind === "require");
  if (requirements.length === 0)
    return /^\s*require\b/m.test(code) ? "The module's `require` block could not be parsed." : undefined;
  const vendor = await readInside(root, resolve(dirname(path), "vendor/modules.txt"));
  if (vendor === undefined) return "There is no `vendor/modules.txt` to verify requirements offline.";
  const modules = new Set<string>();
  let module: string | undefined;
  for (const line of vendor.split(/\r?\n/)) {
    if (line.startsWith("# ")) {
      const header = /^# (\S+) (v\S+)$/.exec(line);
      if (!header) return "`vendor/modules.txt` could not be read.";
      module = `${header[1]} ${header[2]}`;
    } else if (line.startsWith("## ")) {
      const floor = /(?:^|[; ])go (\S+)/.exec(line)?.[1];
      const normalized = floor && version(floor);
      if (!module || !normalized || semver.gt(normalized, target))
        return "A vendored module's Go floor is above the target or is not a literal version.";
      modules.add(module);
    }
  }
  if (!requirements.every((item) => modules.has(`${item.module} ${item.value}`)))
    return "`vendor/modules.txt` does not list every requirement.";
  return undefined;
}

interface Targets {
  target: string;
  normalized: string;
  findings: Finding[];
}

/** Record the target a finding names, refusing one that names no literal Go version. */
function collectTargets(targets: Map<string, Targets>, findings: readonly Finding[], refuse?: Refuse): void {
  for (const finding of findings) {
    if (!finding.ruleId.startsWith("go.runtime.") || basename(finding.location.path) !== "go.mod") continue;
    const target = GO_REPLACEMENT.exec(finding.replacement ?? "")?.[1];
    const next = target === undefined ? undefined : version(target);
    if (!target || next === undefined) {
      refuse?.(finding, "The rule's replacement does not name a literal Go version.");
      continue;
    }
    const entry = targets.get(finding.location.path);
    if (!entry) {
      targets.set(finding.location.path, {
        target,
        normalized: next,
        findings: [finding],
      });
      continue;
    }
    const current = version(entry.target);
    if (current !== undefined && semver.gt(next, current)) {
      entry.target = target;
      entry.normalized = next;
    }
    entry.findings.push(finding);
  }
}

/** Raise only go.mod directive values to an explicit supported replacement, never resolving modules or running Go. */
export const goModFixer: Fixer = {
  id: "go-mod",
  async plan(result, refuse) {
    const targets = new Map<string, Targets>();
    collectTargets(targets, result.findings, refuse);
    const patches: FilePatch[] = [];
    for (const [path, { normalized, findings }] of targets) {
      const patch = await planFile(result.root, path, normalized, findings, refuse);
      if (patch !== undefined) patches.push(patch);
    }
    return patches;
  },
};

/** The `go.mod` patch that raises its directives to `normalized`, or undefined when nothing can change; declined findings are reported. */
async function planFile(
  root: string,
  path: string,
  normalized: string,
  findings: readonly Finding[],
  refuse: Refuse | undefined,
): Promise<FilePatch | undefined> {
  const decline = (reason: string): undefined => {
    for (const finding of findings) refuse?.(finding, reason);
    return undefined;
  };
  const absolute = resolve(root, path);
  const before = await readInside(root, absolute);
  if (before === undefined) return decline("The `go.mod` file could not be read inside the repository.");
  if (!before.endsWith("\n")) return decline("The `go.mod` file does not end with a newline.");
  const declarations = parseGoMod(before);
  const go = declarations.filter((item) => item.kind === "go");
  const toolchain = declarations.filter((item) => item.kind === "toolchain");
  const [directive] = go;
  if (go.length !== 1 || directive === undefined) return decline("The module has no single literal `go` directive.");
  const floor = version(directive.value);
  if (!floor) return decline("The `go` directive value is not a literal Go version.");

  const text = before.slice(0, -1).split("\n");
  let edits = new Map<number, string>();
  if (!semver.gt(floor, normalized)) {
    const problem = await raisedDirectiveProblem(root, absolute, before, toolchain, normalized);
    if (problem !== undefined) return decline(problem);
    edits = directiveEdits(declarations, text, normalized);
  }
  refuseUnchangedDirectives(findings, text, edits, refuse);
  return edits.size === 0 ? undefined : hunkPatch(path, text, edits);
}

/** Why the module cannot be raised safely, or undefined when its `toolchain` directives allow it and its dependencies are verifiable. */
async function raisedDirectiveProblem(
  root: string,
  absolute: string,
  before: string,
  toolchain: readonly { value: string }[],
  normalized: string,
): Promise<string | undefined> {
  if (toolchain.length > 1) return "The module has more than one `toolchain` directive.";
  if (toolchain.some((item) => !version(item.value.replace(/^go/, ""))))
    return "The module has a computed `toolchain` value.";
  return dependencyProblem(root, absolute, before, normalized);
}

/** The new text of each `go` and `toolchain` directive line that names a version below `normalized`, keyed by index. */
function directiveEdits(
  declarations: readonly { kind: string; line: number }[],
  text: readonly string[],
  normalized: string,
): Map<number, string> {
  const edits = new Map<number, string>();
  const lines = new Set(declarations.filter((item) => item.kind !== "require").map((item) => item.line));
  text.forEach((line, index) => {
    const match = lines.has(index + 1) ? DIRECTIVE.exec(line) : null;
    const declared = match?.[3];
    const current = declared === undefined ? undefined : version(declared.replace(/^go/, ""));
    if (!match || !current || !semver.lt(current, normalized)) return;
    edits.set(index, `${match[1]}${match[2] === "toolchain" ? "go" : ""}${normalized}${match[4]}`);
  });
  return edits;
}

/** A unified diff hunk around the edited lines; intervening declarations are context, never removed and re-added. */
function hunkPatch(path: string, text: readonly string[], edits: ReadonlyMap<number, string>): FilePatch {
  const start = Math.max(0, Math.min(...edits.keys()) - 2);
  const end = Math.min(text.length, Math.max(...edits.keys()) + 3);
  const hunk = text.slice(start, end).flatMap((line, offset) => {
    const after = edits.get(start + offset);
    return after === undefined ? [` ${line}`] : [`-${line}`, `+${after}`];
  });
  return {
    path,
    diff: [
      `--- a/${path}`,
      `+++ b/${path}`,
      `@@ -${start + 1},${end - start} +${start + 1},${end - start} @@`,
      ...hunk,
    ].join("\n"),
  };
}

/** Refuses each finding whose directive the edit left alone, with the reason it could not be raised. */
function refuseUnchangedDirectives(
  findings: readonly Finding[],
  text: readonly string[],
  edits: ReadonlyMap<number, string>,
  refuse: Refuse | undefined,
): void {
  for (const finding of findings) {
    const index = (finding.location.line ?? 0) - 1;
    if (index >= 0 && edits.has(index)) continue;
    const reason = refusalReason(index >= 0 ? text[index] : undefined);
    if (reason !== undefined) refuse?.(finding, reason);
  }
}

/** Why the line still holds the finding's value, or undefined when the directive is already at or above the target. */
function refusalReason(line: string | undefined): string | undefined {
  if (line === undefined) return "The finding names no line to rewrite.";
  const match = DIRECTIVE.exec(line);
  if (!match) return "The line is not a `go` or `toolchain` directive.";
  const declared = match[3];
  if (declared === undefined || !version(declared.replace(/^go/, "")))
    return "The directive value is not a literal Go version.";
  return undefined;
}

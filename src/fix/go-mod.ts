import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import semver from "semver";

import { parseGoMod } from "../detectors/go/parse-go-mod.js";
import type { Finding } from "../domain.js";
import type { FilePatch, Fixer } from "./index.js";

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
    if (inside === ".." || inside.startsWith("../") || inside.startsWith("..\\") || isAbsolute(inside)) return undefined;
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
async function dependencyProblem(root: string, path: string, contents: string, target: string): Promise<string | undefined> {
  const code = contents.replace(/\/\/[^\n]*/g, "");
  if (/^\s*(?:replace|exclude)\b/m.test(code)) return "The module has `replace` or `exclude` directives, which need module resolution.";
  const requirements = parseGoMod(code).filter((item) => item.kind === "require");
  if (requirements.length === 0) return /^\s*require\b/m.test(code) ? "The module's `require` block could not be parsed." : undefined;
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
      if (!module || !normalized || semver.gt(normalized, target)) return "A vendored module's Go floor is above the target or is not a literal version.";
      modules.add(module);
    }
  }
  if (!requirements.every((item) => modules.has(`${item.module} ${item.value}`))) return "`vendor/modules.txt` does not list every requirement.";
  return undefined;
}

interface Targets {
  target: string;
  findings: Finding[];
}

/** Raise only go.mod directive values to an explicit supported replacement, never resolving modules or running Go. */
export const goModFixer: Fixer = {
  id: "go-mod",
  async plan(result, refuse) {
    const targets = new Map<string, Targets>();
    for (const finding of result.findings) {
      if (!finding.ruleId.startsWith("go.runtime.") || basename(finding.location.path) !== "go.mod") continue;
      const target = GO_REPLACEMENT.exec(finding.replacement ?? "")?.[1];
      if (!target || !version(target)) {
        refuse?.(finding, "The rule's replacement does not name a literal Go version.");
        continue;
      }
      const entry = targets.get(finding.location.path);
      if (!entry) targets.set(finding.location.path, { target, findings: [finding] });
      else {
        if (semver.gt(version(target)!, version(entry.target)!)) entry.target = target;
        entry.findings.push(finding);
      }
    }
    const patches: FilePatch[] = [];
    for (const [path, { target, findings }] of targets) {
      const decline = (reason: string) => {
        for (const finding of findings) refuse?.(finding, reason);
      };
      const absolute = resolve(result.root, path);
      const before = await readInside(result.root, absolute);
      if (before === undefined) {
        decline("The `go.mod` file could not be read inside the repository.");
        continue;
      }
      if (!before.endsWith("\n")) {
        decline("The `go.mod` file does not end with a newline.");
        continue;
      }
      const declarations = parseGoMod(before);
      const go = declarations.filter((item) => item.kind === "go");
      const toolchain = declarations.filter((item) => item.kind === "toolchain");
      const normalized = version(target)!;
      if (go.length !== 1) {
        decline("The module has no single literal `go` directive.");
        continue;
      }
      const floor = version(go[0]!.value);
      if (!floor) {
        decline("The `go` directive value is not a literal Go version.");
        continue;
      }
      const edits = new Map<number, string>();
      const text = before.slice(0, -1).split("\n");
      if (!semver.gt(floor, normalized)) {
        const problem = toolchain.length > 1
          ? "The module has more than one `toolchain` directive."
          : toolchain.some((item) => !version(item.value.replace(/^go/, "")))
            ? "The module has a computed `toolchain` value."
            : await dependencyProblem(result.root, absolute, before, normalized);
        if (problem !== undefined) {
          decline(problem);
          continue;
        }
        const lines = new Set(declarations.filter((item) => item.kind !== "require").map((item) => item.line));
        text.forEach((line, index) => {
          const match = lines.has(index + 1) && DIRECTIVE.exec(line);
          const current = match && version(match[3]!.replace(/^go/, ""));
          if (!match || !current || !semver.lt(current, normalized)) return;
          const after = `${match[1]}${match[2] === "toolchain" ? "go" : ""}${normalized}${match[4]}`;
          edits.set(index, after);
        });
      }
      if (edits.size > 0) {
        const start = Math.max(0, Math.min(...edits.keys()) - 2);
        const end = Math.min(text.length, Math.max(...edits.keys()) + 3);
        // Intervening declarations are context, never removed and re-added.
        const hunk = text.slice(start, end).flatMap((line, offset) => {
          const after = edits.get(start + offset);
          return after === undefined ? [` ${line}`] : [`-${line}`, `+${after}`];
        });
        patches.push({ path, diff: [`--- a/${path}`, `+++ b/${path}`, `@@ -${start + 1},${end - start} +${start + 1},${end - start} @@`, ...hunk].join("\n") });
      }
      for (const finding of findings) {
        const index = (finding.location.line ?? 0) - 1;
        if (index >= 0 && edits.has(index)) continue;
        const reason = refusalReason(index >= 0 ? text[index] : undefined);
        if (reason !== undefined) refuse?.(finding, reason);
      }
    }
    return patches;
  },
};

/** Why the line still holds the finding's value, or undefined when the directive is already at or above the target. */
function refusalReason(line: string | undefined): string | undefined {
  if (line === undefined) return "The finding names no line to rewrite.";
  const match = DIRECTIVE.exec(line);
  if (!match) return "The line is not a `go` or `toolchain` directive.";
  if (!version(match[3]!.replace(/^go/, ""))) return "The directive value is not a literal Go version.";
  return undefined;
}

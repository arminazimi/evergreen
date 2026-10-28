import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import semver from "semver";

import { renderDiff } from "../agent-instructions.js";
import { parseGoMod } from "../detectors/go/parse-go-mod.js";
import type { FilePatch, Fixer } from "./index.js";

const VERSION = /^\d+\.\d+(?:\.\d+)?$/;
const DIRECTIVE = /^(\s*(go|toolchain)\s+)((?:go)?\d+\.\d+(?:\.\d+)?)(\s*(?:\/\/.*)?\r?)$/;

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
 */
async function compatibleDependencies(root: string, path: string, contents: string, target: string): Promise<boolean> {
  const code = contents.replace(/\/\/[^\n]*/g, "");
  if (/^\s*(?:replace|exclude)\b/m.test(code)) return false;
  const requirements = parseGoMod(code).filter((item) => item.kind === "require");
  if (requirements.length === 0) return !/^\s*require\b/m.test(code);
  const vendor = await readInside(root, resolve(dirname(path), "vendor/modules.txt"));
  if (vendor === undefined) return false;
  const modules = new Set<string>();
  let module: string | undefined;
  for (const line of vendor.split(/\r?\n/)) {
    if (line.startsWith("# ")) {
      const header = /^# (\S+) (v\S+)$/.exec(line);
      if (!header) return false;
      module = `${header[1]} ${header[2]}`;
    } else if (line.startsWith("## ")) {
      const floor = /(?:^|[; ])go (\S+)/.exec(line)?.[1];
      const normalized = floor && version(floor);
      if (!module || !normalized || semver.gt(normalized, target)) return false;
      modules.add(module);
    }
  }
  return requirements.every((item) => modules.has(`${item.module} ${item.value}`));
}

/** Raise only go.mod directive values to an explicit supported replacement, never resolving modules or running Go. */
export const goModFixer: Fixer = {
  id: "go-mod",
  async plan(result) {
    const targets = new Map<string, string>();
    for (const finding of result.findings) {
      if (!finding.ruleId.startsWith("go.runtime.") || basename(finding.location.path) !== "go.mod") continue;
      const target = /^Go (\d+\.\d+(?:\.\d+)?) or later$/.exec(finding.replacement ?? "")?.[1];
      if (!target || !version(target)) continue;
      const previous = targets.get(finding.location.path);
      if (!previous || semver.gt(version(target)!, version(previous)!)) targets.set(finding.location.path, target);
    }
    const patches: FilePatch[] = [];
    for (const [path, target] of targets) {
      const absolute = resolve(result.root, path);
      const before = await readInside(result.root, absolute);
      if (!before?.endsWith("\n")) continue;
      const declarations = parseGoMod(before);
      const go = declarations.filter((item) => item.kind === "go");
      const toolchain = declarations.filter((item) => item.kind === "toolchain");
      const normalized = version(target)!;
      if (go.length !== 1 || toolchain.length > 1) continue;
      const floor = version(go[0]!.value);
      if (!floor || semver.gt(floor, normalized) || toolchain.some((item) => !version(item.value.replace(/^go/, "")))) continue;
      if (!await compatibleDependencies(result.root, absolute, before, normalized)) continue;
      const lines = new Set(declarations.filter((item) => item.kind !== "require").map((item) => item.line));
      const after = before.split("\n").map((line, index) => {
        const match = lines.has(index + 1) && DIRECTIVE.exec(line);
        const current = match && version(match[3]!.replace(/^go/, ""));
        if (!match || !current || !semver.lt(current, normalized)) return line;
        return `${match[1]}${match[2] === "toolchain" ? "go" : ""}${normalized}${match[4]}`;
      }).join("\n");
      if (after !== before) patches.push({ path, diff: renderDiff(path, before.slice(0, -1), after.slice(0, -1)) });
    }
    return patches;
  },
};

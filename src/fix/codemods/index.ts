import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { renderDiff } from "../../agent-instructions.js";
import type { Finding } from "../../domain.js";
import type { FilePatch, Fixer } from "../index.js";

/** A package whose successor exports the same API under a new name, so replacing the module specifier is the whole migration. */
export interface RenameCodemod {
  ruleId: string;
  from: string;
  to: string;
}

/**
 * The npm replacements that are a pure rename of the import specifier. Replacements that change the API, such as
 * `request` to `fetch`, are not codemods: they need judgment and stay with the migration packet.
 */
export const renameCodemods: RenameCodemod[] = [
  { ruleId: "npm.package.boom.deprecated", from: "boom", to: "@hapi/boom" },
  { ruleId: "npm.package.cryptiles.deprecated", from: "cryptiles", to: "@hapi/cryptiles" },
  { ruleId: "npm.package.sntp.deprecated", from: "sntp", to: "@hapi/sntp" },
  { ruleId: "npm.package.koa-router.deprecated", from: "koa-router", to: "@koa/router" },
  { ruleId: "npm.package.sourcemap-codec.deprecated", from: "sourcemap-codec", to: "@jridgewell/sourcemap-codec" },
];

/**
 * Rewrites the module specifier of every `import`, `require`, and dynamic `import()` the usage analysis found for a
 * deprecated package, in place of the successor the rule names. It edits source files only: the dependency
 * declaration is left to the migration, because choosing a version needs the network. Subpath imports such as
 * `koa-router/types` are left alone.
 */
export const renameCodemodsFixer: Fixer = {
  id: "codemods",
  async plan(result) {
    const edits = new Map<string, Map<number, RenameCodemod>>();
    for (const finding of result.findings) {
      const codemod = renameCodemods.find((candidate) => candidate.ruleId === finding.ruleId);
      if (!codemod || !isTrusted(finding, codemod)) continue;
      for (const usage of finding.usages ?? []) {
        if (usage.kind !== "import" || usage.location.line === undefined) continue;
        const lines = edits.get(usage.location.path) ?? new Map();
        lines.set(usage.location.line, codemod);
        edits.set(usage.location.path, lines);
      }
    }

    const patches: FilePatch[] = [];
    for (const [path, lines] of [...edits].sort(([a], [b]) => a.localeCompare(b))) {
      const absolute = resolve(result.root, path);
      const inside = relative(resolve(result.root), absolute);
      if (inside.startsWith("..") || isAbsolute(inside)) continue;
      const before = await readFile(absolute, "utf8");
      const text = before.split("\n").map((line, index) => {
        const codemod = lines.get(index + 1);
        return codemod ? renameSpecifier(line, codemod) : line;
      }).join("\n");
      // renderDiff treats the text after the last newline as a line; dropping the newline keeps git apply from seeing a phantom one.
      if (text !== before && before.endsWith("\n")) patches.push({ path, diff: renderDiff(path, before.slice(0, -1), text.slice(0, -1)) });
    }
    return patches;
  },
};

/** The codemod applies only while the rule still names the successor it was written for. */
function isTrusted(finding: Finding, codemod: RenameCodemod): boolean {
  return finding.replacement === codemod.to;
}

/** Replaces the quoted specifier `from` on `line`; a longer specifier that merely starts with it never matches. */
function renameSpecifier(line: string, codemod: RenameCodemod): string {
  const quoted = new RegExp(`(["'\`])${escape(codemod.from)}\\1`, "g");
  return line.replace(quoted, (_, quote: string) => `${quote}${codemod.to}${quote}`);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

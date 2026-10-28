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

interface Usage {
  path: string;
  line: number;
}

interface Tracked {
  finding: Finding;
  codemod: RenameCodemod;
  usages: Usage[];
}

/**
 * Rewrites the module specifier of every `import`, `require`, and dynamic `import()` the usage analysis found for a
 * deprecated package, in place of the successor the rule names. It edits source files only: the dependency
 * declaration is left to the migration, because choosing a version needs the network. Subpath imports such as
 * `koa-router/types` are left alone.
 */
export const renameCodemodsFixer: Fixer = {
  id: "codemods",
  async plan(result, refuse) {
    const edits = new Map<string, Map<number, RenameCodemod>>();
    const tracked: Tracked[] = [];
    for (const finding of result.findings) {
      const codemod = renameCodemods.find((candidate) => candidate.ruleId === finding.ruleId);
      if (!codemod) continue;
      if (!isTrusted(finding, codemod)) {
        refuse?.(finding, "The rule no longer names the successor this codemod was written for.");
        continue;
      }
      const usages = (finding.usages ?? []).flatMap((usage) =>
        usage.kind === "import" && usage.location.line !== undefined ? [{ path: usage.location.path, line: usage.location.line }] : []);
      if (usages.length === 0) {
        refuse?.(finding, "No `import` statement was found to rename.");
        continue;
      }
      tracked.push({ finding, codemod, usages });
      for (const usage of usages) {
        const lines = edits.get(usage.path) ?? new Map();
        lines.set(usage.line, codemod);
        edits.set(usage.path, lines);
      }
    }

    const patches: FilePatch[] = [];
    const originals = new Map<string, string[]>();
    const updated = new Map<string, string[]>();
    const failures = new Map<string, string>();
    for (const [path, lines] of [...edits].sort(([a], [b]) => a.localeCompare(b))) {
      const absolute = resolve(result.root, path);
      const inside = relative(resolve(result.root), absolute);
      if (inside.startsWith("..") || isAbsolute(inside)) {
        failures.set(path, "The path resolves outside the repository.");
        continue;
      }
      const before = await readFile(absolute, "utf8").catch(() => undefined);
      if (before === undefined) {
        failures.set(path, "The source file could not be read.");
        continue;
      }
      if (!before.endsWith("\n")) {
        failures.set(path, "The source file does not end with a newline.");
        continue;
      }
      const original = before.split("\n");
      const text = original.map((line, index) => {
        const codemod = lines.get(index + 1);
        return codemod ? renameSpecifier(line, codemod) : line;
      }).join("\n");
      originals.set(path, original);
      updated.set(path, text.split("\n"));
      // renderDiff treats the text after the last newline as a line; dropping the newline keeps git apply from seeing a phantom one.
      if (text !== before) patches.push({ path, diff: renderDiff(path, before.slice(0, -1), text.slice(0, -1)) });
    }

    for (const { finding, codemod, usages } of tracked) {
      const changed = usages.some((usage) => updated.get(usage.path)?.[usage.line - 1] !== originals.get(usage.path)?.[usage.line - 1]);
      if (changed) continue;
      const reason = usages.map((usage) => failures.get(usage.path)).find((failure) => failure !== undefined)
        ?? refusalReason(usages, originals, codemod);
      refuse?.(finding, reason);
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

/** Why no import specifier was renamed: a subpath import names the package but is not the package itself. */
function refusalReason(usages: Usage[], originals: Map<string, string[]>, codemod: RenameCodemod): string {
  const subpath = new RegExp(`(["'\`])${escape(codemod.from)}/`);
  const namesSubpath = usages.some((usage) => subpath.test(originals.get(usage.path)?.[usage.line - 1] ?? ""));
  return namesSubpath
    ? "The import is a subpath of the deprecated package, not the package itself."
    : "The import specifier did not match the rename.";
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

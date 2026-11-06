import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { builtInDetectors as detectors } from "../src/detectors/index.js";
import type { SourceLanguage } from "../src/domain.js";
import { scanRepository } from "../src/engine/index.js";
import { planFixReport } from "../src/fix/index.js";
import { renderPatches } from "../src/fix/index.js";
import type { FilePatch, FixerPatch, FixRefusal } from "../src/fix/index.js";
import { grammarFor, parseSource } from "../src/usage/tree-sitter.js";

const execute = promisify(execFile);
const roots: string[] = [];

/** What a codemod planned over a temporary repository. */
export interface CodemodPlan {
  root: string;
  patches: FixerPatch[];
  refusals: FixRefusal[];
}

/** Removes every repository a test file created; pass it straight to `after`. */
export async function cleanup(): Promise<void> {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
}

/** Writes the given files under a new temporary repository and keeps it for `cleanup`. */
export async function repository(files: Record<string, string>, prefix = "evergreen-codemod"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

/** Scans a temporary repository and plans one fixer over it. */
export async function plan(files: Record<string, string>, fixer: string): Promise<CodemodPlan> {
  const root = await repository(files, `evergreen-${fixer}`);
  const result = await scanRepository(root, detectors, { noCache: true });
  const report = await planFixReport(result);
  return {
    root,
    patches: report.patches.filter((patch) => patch.fixer === fixer),
    refusals: report.refusals.filter((refusal) => refusal.fixer === fixer),
  };
}

/** Normalizes line endings so a fixture compares the same on every platform. */
export function normalized(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/** Applies every planned patch with `git apply`, as the direct fixer tests need. */
export async function applyPatches(root: string, patches: FilePatch[]): Promise<void> {
  await writeFile(join(root, "fix.patch"), renderPatches(patches));
  await execute("git", ["init", "-q"], { cwd: root });
  await execute("git", ["config", "core.autocrlf", "false"], { cwd: root });
  await execute("git", ["apply", "--check", "fix.patch"], { cwd: root });
  await execute("git", ["apply", "fix.patch"], { cwd: root });
}

/** Applies a planned diff with `git apply`. */
export async function applyDiff(root: string, diff: string): Promise<void> {
  const patch = join(root, "fix.patch");
  await writeFile(patch, `${diff}\n`);
  await execute("git", ["apply", "--check", patch], { cwd: root });
  await execute("git", ["apply", patch], { cwd: root });
}

/** Applies a planned diff with `git apply` and returns the normalized text of `file`. */
export async function apply(root: string, diff: string, file = "app.py"): Promise<string> {
  await applyDiff(root, diff);
  return normalized(await readFile(join(root, file), "utf8"));
}

/** Asserts that the text parses without errors in the given language. */
export async function assertParses(source: string, language: SourceLanguage = "python"): Promise<void> {
  const grammar = grammarFor(language, language === "python" ? "app.py" : "index.ts");
  assert.ok(grammar);
  const tree = await parseSource(grammar, source);
  assert.ok(tree);
  assert.equal(tree.rootNode.hasError, false);
  tree.delete();
}

import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { AgentFileError, renderDiff } from "./agent-instructions.js";
import type { Severity } from "./domain.js";

const execute = promisify(execFile);

export const HOOK_BEGIN = "# >>> evergreen pre-push >>>";
export const HOOK_END = "# <<< evergreen pre-push <<<";

export interface InitHooksOptions {
  /** The repository root. */
  root: string;
  /** The lowest severity that blocks a push. */
  gate: Severity;
  /** Report what would change, including a diff, and write nothing. */
  dryRun?: boolean;
}

export interface InitHooksResult {
  /** `managed` means a hook manager owns hooks here, so nothing was written and `snippet` says what to add. */
  change: "created" | "added" | "updated" | "unchanged" | "managed";
  file: string;
  written: boolean;
  /** A unified diff of the change; empty when nothing changes. */
  diff: string;
  /** For `managed`: the hook manager and the lines to add to its configuration. */
  manager?: string;
  snippet?: string;
}

/** The block kept in `.git/hooks/pre-push`. Only a policy failure (exit 1) blocks the push; a missing install or a scan error does not. */
export function hookBlock(gate: Severity, chain = false): string {
  return [
    HOOK_BEGIN,
    ...(chain ? ["evergreen_input=$(cat)"] : []),
    "# Managed by `evergreen init --hooks`. Bypass once with `git push --no-verify` or `EVERGREEN_SKIP=1 git push`.",
    'if [ -z "$EVERGREEN_SKIP" ]; then',
    `  npx --no-install evergreen-deprecation scan . --fail-on ${gate} --format compact`,
    "  evergreen_status=$?",
    '  if [ "$evergreen_status" -eq 1 ]; then',
    '    echo "Evergreen found a lifecycle risk at or above \\"' + gate + '\\". Push blocked; bypass with --no-verify or EVERGREEN_SKIP=1." >&2',
    "    exit 1",
    "  fi",
    "fi",
    // A global hooks path replaces each repository's own hooks, so hand over to the repository's pre-push.
    ...(chain
      ? [
          'evergreen_repo_hook="$(git rev-parse --git-common-dir 2>/dev/null)/hooks/pre-push"',
          'if [ -x "$evergreen_repo_hook" ]; then',
          '  printf \'%s\\n\' "$evergreen_input" | "$evergreen_repo_hook" "$@" || exit $?',
          "fi",
        ]
      : []),
    HOOK_END,
  ].join("\n");
}

export function withHookBlock(existing: string | undefined, gate: Severity, chain = false): { text: string; change: "created" | "added" | "updated" | "unchanged" } {
  const block = hookBlock(gate, chain);
  if (existing === undefined || existing.trim() === "") return { text: `#!/bin/sh\n\n${block}\n`, change: "created" };
  const begin = existing.indexOf(HOOK_BEGIN);
  const end = existing.indexOf(HOOK_END);
  if (begin !== -1 && end > begin) {
    const text = `${existing.slice(0, begin)}${block}${existing.slice(end + HOOK_END.length)}`;
    return { text, change: text === existing ? "unchanged" : "updated" };
  }
  return { text: existing, change: "added" };
}

async function read(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

const exists = (path: string) => lstat(path).then(() => true, () => false);

/** Installs the Evergreen pre-push block, leaving hook managers and foreign hooks alone. */
export async function initHooks(options: InitHooksOptions): Promise<InitHooksResult> {
  const root = resolve(options.root);
  const info = await lstat(root).catch(() => undefined);
  if (!info?.isDirectory()) throw new AgentFileError(`${root} is not a directory.`);

  const command = `npx --no-install evergreen-deprecation scan . --fail-on ${options.gate} --format compact`;
  if (await exists(resolve(root, ".husky"))) {
    return { change: "managed", file: ".husky/pre-push", written: false, diff: "", manager: "husky", snippet: command };
  }
  for (const name of ["lefthook.yml", "lefthook.yaml", ".lefthook.yml", ".lefthook.yaml"]) {
    if (await exists(resolve(root, name))) {
      const snippet = `pre-push:\n  commands:\n    evergreen:\n      run: ${command}`;
      return { change: "managed", file: name, written: false, diff: "", manager: "lefthook", snippet };
    }
  }

  let hooksDirectory: string;
  try {
    const { stdout } = await execute("git", ["rev-parse", "--git-path", "hooks"], { cwd: root });
    hooksDirectory = resolve(root, stdout.trim());
  } catch {
    throw new AgentFileError(`${root} is not inside a Git repository, so there is no hook to install.`);
  }
  const path = resolve(hooksDirectory, "pre-push");
  const file = ".git/hooks/pre-push";
  const before = await read(path);
  const update = withHookBlock(before, options.gate);
  if (update.change === "added") {
    throw new AgentFileError(`${path} already exists and is not managed by Evergreen, so it was not changed. Add this line to it yourself:\n  ${command}`);
  }
  const diff = update.change === "unchanged" ? "" : renderDiff(file, before ?? "", update.text);
  if (update.change === "unchanged" || options.dryRun) return { change: update.change, file, written: false, diff };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, update.text);
  await chmod(path, 0o755);
  return { change: update.change, file, written: true, diff };
}

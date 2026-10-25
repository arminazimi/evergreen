import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { renderPatches, type FilePatch } from "./index.js";

const execute = promisify(execFile);

export const FIX_BRANCH = "evergreen/fix";
export const FIX_COMMIT_MESSAGE = "chore: apply Evergreen lifecycle fixes";

export interface BranchResult {
  branch: string;
  commit: string;
  files: string[];
}

async function git(root: string, args: string[], input?: string): Promise<string> {
  const child = execute("git", args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  if (input !== undefined) child.child.stdin?.end(input);
  try {
    return (await child).stdout;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(stderr || (error as Error).message);
  }
}

/**
 * Applies the patches on a new local branch and commits them, so the fix can be reviewed and thrown away with
 * `git branch -D`. It refuses a repository with uncommitted changes, never touches a remote, and restores the
 * original checkout if the patches do not apply.
 */
export async function applyOnBranch(root: string, patches: FilePatch[], branch: string = FIX_BRANCH): Promise<BranchResult> {
  try {
    await git(root, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    throw new Error("--branch needs a git repository.");
  }
  if ((await git(root, ["status", "--porcelain", "--untracked-files=all"])).trim() !== "") {
    throw new Error("--branch needs a clean working tree; commit or stash your changes first.");
  }
  try {
    await git(root, ["check-ref-format", "--branch", branch]);
  } catch {
    throw new Error(`"${branch}" is not a valid branch name.`);
  }
  if ((await git(root, ["branch", "--list", branch])).trim() !== "") {
    throw new Error(`Branch "${branch}" already exists; delete it or review it first.`);
  }

  const original = (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  const originalRef = original === "HEAD" ? (await git(root, ["rev-parse", "HEAD"])).trim() : original;
  const files = [...new Set(patches.map((patch) => patch.path))].sort();
  await git(root, ["checkout", "-q", "-b", branch]);
  try {
    await git(root, ["apply", "--whitespace=nowarn", "-"], renderPatches(patches));
    await git(root, ["add", "--", ...files]);
    await git(root, ["commit", "-q", "-m", FIX_COMMIT_MESSAGE]);
  } catch (error) {
    await git(root, ["reset", "-q", "--hard"]);
    await git(root, ["checkout", "-q", originalRef]);
    await git(root, ["branch", "-q", "-D", branch]);
    throw error;
  }
  return { branch, commit: (await git(root, ["rev-parse", "--short", "HEAD"])).trim(), files };
}

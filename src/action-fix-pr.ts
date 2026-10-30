/**
 * Keeps one pull request with every deterministic fix the fixers can apply. Everything before the
 * push is local: the scan and the patches never use the network. Only the push and the GitHub API
 * calls that create, update, or close the pull request leave the runner.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { builtInDetectors } from "./detectors/index.js";
import type { Finding, ScanResult, VerificationCommand } from "./domain.js";
import { scanRepository } from "./engine.js";
import { planFixReport, renderPatches } from "./fix/index.js";
import type { FilePatch } from "./fix/index.js";
import { FIX_COMMIT_MESSAGE } from "./fix/git.js";
import { verifyFix } from "./fix/verify.js";
import { ATTRIBUTION_LINE } from "./github-action.js";

const execute = promisify(execFile);

/** The branch the fix pull request lives on. Every run force-pushes it; the pull request is found by this head. */
export const FIX_PR_BRANCH = "evergreen/fixes";
export const FIX_PR_TITLE = "Evergreen: apply deterministic lifecycle fixes";

const BOT_NAME = "github-actions[bot]";
const BOT_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";

export interface FixPullRequestTarget {
  /** The scanned repository root; the scan result's root is used when this is left out. */
  root?: string;
  /** owner/name */
  repository: string;
  token: string;
  /** API origin, for example https://api.github.com. */
  apiUrl?: string;
  /** The branch the pull request targets, normally the repository's default branch. */
  baseBranch: string;
  /** The branch the fixes are committed to; defaults to `evergreen/fixes`. */
  branch?: string;
  /** Add the "Scanned by Evergreen" line to the pull request body (default true). */
  attribution?: boolean;
}

export type FixPullRequestStatus = "opened" | "updated" | "closed" | "nothing";

export interface FixPullRequestOutcome {
  status: FixPullRequestStatus;
  /** How many findings the applied patches resolved. */
  fixes: number;
  number?: number;
  url?: string;
}

interface GitHubTarget {
  apiUrl: string;
  repository: string;
  token: string;
}

interface PullRequest {
  number: number;
  state: "open" | "closed";
  merged_at?: string | null;
  html_url?: string;
  head?: { ref?: string };
}

async function githubRequest(target: GitHubTarget, method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${target.apiUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${target.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`GitHub API ${method} ${path} failed with ${response.status}`);
  return response.json();
}

/** The one pull request whose head is the fixes branch, open or closed, so a re-run updates it instead of adding another. */
async function findPullRequest(target: GitHubTarget, branch: string): Promise<PullRequest | undefined> {
  const owner = target.repository.split("/")[0] ?? "";
  const query = new URLSearchParams({ state: "all", head: `${owner}:${branch}`, sort: "created", direction: "desc", per_page: "100" });
  const pulls = (await githubRequest(target, "GET", `/repos/${target.repository}/pulls?${query.toString()}`)) as PullRequest[];
  const ours = pulls.filter((pull) => pull.head?.ref === branch);
  return ours.find((pull) => pull.state === "open") ?? ours[0];
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

/** Commits the patches on the fixes branch. The runner's checkout is clean, so a dirty tree means something else is wrong. */
async function applyFixesOnBranch(root: string, branch: string, patches: FilePatch[]): Promise<void> {
  if ((await git(root, ["status", "--porcelain", "--untracked-files=all"])).trim() !== "") {
    throw new Error("fix-pr needs a clean working tree; the checkout has uncommitted changes.");
  }
  const files = [...new Set(patches.map((patch) => patch.path))].sort();
  await git(root, ["checkout", "-q", "-B", branch]);
  await git(root, ["apply", "--whitespace=nowarn", "-"], renderPatches(patches));
  await git(root, ["add", "--", ...files]);
  await git(root, ["-c", `user.name=${BOT_NAME}`, "-c", `user.email=${BOT_EMAIL}`, "commit", "-q", "-m", FIX_COMMIT_MESSAGE]);
}

async function pushBranch(root: string, branch: string): Promise<void> {
  await git(root, ["push", "--force", "origin", `HEAD:refs/heads/${branch}`]);
}

const cell = (text: string): string => text.replace(/\r?\n/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").trim();

const location = (finding: Finding): string => `${finding.location.path}${finding.location.line ? `:${finding.location.line}` : ""}`;

/**
 * The pull request body: one row per applied fix with the location it changed and the evidence it cites,
 * then the verification commands Evergreen prints and never runs.
 */
export function renderFixPullRequestBody(fixed: readonly Finding[], commands: readonly VerificationCommand[], files: readonly string[], attribution: boolean): string {
  const count = fixed.length;
  const summary = count > 0
    ? `This pull request applies **${count}** deterministic lifecycle fix${count === 1 ? "" : "es"} found by Evergreen.`
    : `This pull request applies deterministic lifecycle changes to **${files.length}** file${files.length === 1 ? "" : "s"}.`;
  const lines = [
    "## Evergreen lifecycle fixes",
    "",
    `${summary} It is updated on every scheduled run and closed when nothing is left to fix.`,
    "",
  ];

  if (fixed.length > 0) {
    lines.push("| Finding | Location | Evidence |", "|---|---|---|");
    for (const finding of fixed) {
      const source = finding.sources[0];
      lines.push(`| ${cell(finding.title)} | \`${cell(location(finding))}\` | ${source ? `[${cell(source.title)}](${source.url})` : "—"} |`);
    }
    lines.push("");
  } else if (files.length > 0) {
    lines.push("Changed files:", "");
    for (const file of files) lines.push(`- \`${file}\``);
    lines.push("");
  }

  if (commands.length > 0) {
    lines.push("### Verify", "", "Evergreen did not run these commands:", "");
    for (const command of commands) lines.push(`- \`${command.command}\` — ${command.purpose}`);
    lines.push("");
  }
  if (attribution) lines.push(ATTRIBUTION_LINE, "");
  return lines.join("\n");
}

/**
 * Opens or updates the one fix pull request. With nothing to fix it closes an open fix pull request instead of
 * opening an empty one; with fixes it commits them to the fixes branch, force-pushes it, and creates or refreshes
 * the pull request. A closed pull request is reopened when fixes come back, and a merged one is not: the next
 * run opens a new pull request from the same branch.
 */
export async function publishFixPullRequest(result: ScanResult, target: FixPullRequestTarget): Promise<FixPullRequestOutcome> {
  const root = target.root ?? result.root;
  const branch = target.branch ?? FIX_PR_BRANCH;
  const github: GitHubTarget = {
    apiUrl: target.apiUrl ?? "https://api.github.com",
    repository: target.repository,
    token: target.token,
  };
  const patches = (await planFixReport(result)).patches;
  if (patches.length === 0) {
    const existing = await findPullRequest(github, branch);
    if (existing?.state === "open") {
      await githubRequest(github, "PATCH", `/repos/${github.repository}/pulls/${existing.number}`, { state: "closed" });
      return { status: "closed", fixes: 0, number: existing.number, ...(existing.html_url ? { url: existing.html_url } : {}) };
    }
    return { status: "nothing", fixes: 0 };
  }

  await applyFixesOnBranch(root, branch, patches);
  const verification = verifyFix(result, await scanRepository(root, builtInDetectors));
  const files = [...new Set(patches.map((patch) => patch.path))].sort();
  const body = renderFixPullRequestBody(verification.resolved, verification.commands, files, target.attribution ?? true);
  await pushBranch(root, branch);

  const existing = await findPullRequest(github, branch);
  // A closed pull request is reopened, but a merged one cannot be: the next run opens a new pull request instead.
  if (existing && (existing.state === "open" || !existing.merged_at)) {
    await githubRequest(github, "PATCH", `/repos/${github.repository}/pulls/${existing.number}`, {
      title: FIX_PR_TITLE,
      body,
      ...(existing.state === "open" ? {} : { state: "open" }),
    });
    return { status: "updated", fixes: verification.resolved.length, number: existing.number, ...(existing.html_url ? { url: existing.html_url } : {}) };
  }

  const created = (await githubRequest(github, "POST", `/repos/${github.repository}/pulls`, {
    title: FIX_PR_TITLE,
    head: branch,
    base: target.baseBranch,
    body,
  })) as { number: number; html_url?: string };
  return { status: "opened", fixes: verification.resolved.length, number: created.number, ...(created.html_url ? { url: created.html_url } : {}) };
}

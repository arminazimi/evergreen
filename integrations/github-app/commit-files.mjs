// Creates the onboarding branch and opens a pull request with the proposed files.
// Never force-updates an existing evergreen/onboarding tip that we did not just create.

import { ONBOARDING_BRANCH, ONBOARDING_PULL_REQUEST_TITLE } from "./pr-body.mjs";

/**
 * @param {{
 *   github: ReturnType<import("./github-api.mjs").createGitHubClient>,
 *   owner: string,
 *   repo: string,
 *   baseBranch: string,
 *   body: string,
 *   files: Record<string, string>,
 * }} input
 */
export async function commitFilesAndOpenPullRequest(input) {
  const { github, owner, repo, baseBranch, body, files } = input;
  const head = `${owner}:${ONBOARDING_BRANCH}`;
  const open = await github.listOpenPulls(owner, repo, head);
  if (open.length > 0) {
    return { status: "skipped", reason: "pr-exists", pullRequestUrl: open[0].html_url };
  }

  const baseSha = await github.getRefSha(owner, repo, `heads/${baseBranch}`);
  const baseCommit = await github.getCommit(owner, repo, baseSha);
  const entries = [];
  for (const [path, content] of Object.entries(files)) {
    entries.push({ path, sha: await github.createBlob(owner, repo, content) });
  }
  const treeSha = await github.createTree(owner, repo, baseCommit.tree.sha, entries);
  const commitSha = await github.createCommit(owner, repo, {
    message: ONBOARDING_PULL_REQUEST_TITLE,
    tree: treeSha,
    parents: [baseSha],
  });

  const branch = await ensureBranch(github, owner, repo, commitSha);
  if (!branch.created) {
    return { status: "skipped", reason: branch.reason };
  }

  const pull = await github.createPullRequest(owner, repo, {
    title: ONBOARDING_PULL_REQUEST_TITLE,
    body,
    head: ONBOARDING_BRANCH,
    base: baseBranch,
  });
  return { status: "opened", pullRequestUrl: pull.html_url, number: pull.number };
}

/**
 * Creates `evergreen/onboarding` at `commitSha`. If the branch already exists, skips —
 * we must not force-push over commits we did not create.
 */
export async function ensureBranch(github, owner, repo, commitSha) {
  try {
    await github.createRef(owner, repo, `refs/heads/${ONBOARDING_BRANCH}`, commitSha);
    return { created: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("422") && !message.includes("Reference already exists")) throw error;
    return { created: false, reason: "branch-exists" };
  }
}

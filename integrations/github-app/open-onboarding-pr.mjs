// Opens one onboarding pull request for a repository selected during app install.
// Skips when `.github/workflows/evergreen.yml` is already present. Stateless: temp dir is removed.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONFIG_FILE_NAME } from "../../dist/src/config.js";
import { CI_WORKFLOW_FILE } from "../../dist/src/init.js";
import { ONBOARDING_BADGE_FILE, proposeOnboarding } from "../../dist/src/onboarding.js";

import { commitFilesAndOpenPullRequest } from "./commit-files.mjs";
import { materializeRepository } from "./materialize.mjs";
import { onboardingPullRequestBody } from "./pr-body.mjs";

/**
 * @param {{
 *   owner: string,
 *   repo: string,
 *   github: {
 *     getFileText: Function,
 *     getRepository: Function,
 *   },
 *   propose?: typeof proposeOnboarding,
 * }} input
 */
export async function openOnboardingPullRequest(input) {
  const fullName = `${input.owner}/${input.repo}`;
  const propose = input.propose ?? proposeOnboarding;
  const existing = await input.github.getFileText(input.owner, input.repo, CI_WORKFLOW_FILE);
  if (existing !== undefined) {
    return { status: "skipped", reason: "already-onboarded", repository: fullName };
  }

  const repository = await input.github.getRepository(input.owner, input.repo);
  const baseBranch = repository.default_branch;
  const root = await mkdtemp(join(tmpdir(), "evergreen-onboard-"));
  try {
    await materializeRepository({
      root,
      getFile: (path) => input.github.getFileText(input.owner, input.repo, path, baseBranch),
    });
    const proposal = await propose({ root, repository: fullName });
    const files = await filesForCommit(root, proposal.files);
    const body = onboardingPullRequestBody({
      repository: fullName,
      stacks: proposal.stacks,
      files: Object.keys(files).sort(),
    });
    const result = await commitFilesAndOpenPullRequest({
      github: input.github,
      owner: input.owner,
      repo: input.repo,
      baseBranch,
      body,
      files,
    });
    return { ...result, repository: fullName, files: Object.keys(files).sort(), stacks: proposal.stacks };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** Turns the proposal map into commit paths; merges the badge into README.md. */
async function filesForCommit(root, proposalFiles) {
  const files = { ...proposalFiles };
  const badge = files[ONBOARDING_BADGE_FILE];
  delete files[ONBOARDING_BADGE_FILE];
  if (typeof badge === "string" && badge.length > 0) {
    files["README.md"] = await mergeBadge(root, badge);
  }
  // Keep workflow and config even if somehow missing from the proposal.
  if (files[CI_WORKFLOW_FILE] === undefined || files[CONFIG_FILE_NAME] === undefined) {
    throw new Error("onboarding proposal missing workflow or config");
  }
  return files;
}

async function mergeBadge(root, snippet) {
  const current = await readFile(join(root, "README.md"), "utf8").catch(() =>
    readFile(join(root, "readme.md"), "utf8").catch(() => ""),
  );
  if (current.includes(snippet.trim())) return current.endsWith("\n") ? current : `${current}\n`;
  if (current.length === 0) return `${snippet.trim()}\n`;
  return `${current.replace(/\s*$/, "")}\n\n${snippet.trim()}\n`;
}

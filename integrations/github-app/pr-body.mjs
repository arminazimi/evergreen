// Pull request body for the onboarding branch: what landed and how to undo it.

import { CONFIG_FILE_NAME } from "../../dist/src/config.js";
import { CI_WORKFLOW_FILE } from "../../dist/src/init.js";

/**
 * Markdown body for the onboarding pull request.
 * @param {{ repository: string, stacks: readonly string[], files: readonly string[] }} input
 */
export function onboardingPullRequestBody(input) {
  const stacks =
    input.stacks.length > 0
      ? input.stacks.map((stack) => `\`${stack}\``).join(", ")
      : "none detected (workflow and config still apply)";
  const fileList = input.files.map((path) => `- \`${path}\``).join("\n");
  return [
    "## Evergreen onboarding",
    "",
    `This pull request adds a pinned Evergreen GitHub Action workflow and config for **${input.repository}**.`,
    `Detected stacks: ${stacks}.`,
    "",
    "### What this adds",
    "",
    fileList,
    "",
    "The first workflow run on this pull request proposes a baseline so existing findings do not fail the gate.",
    "Scans still run in *this* repository's Actions; the app does not store your code.",
    "",
    "### How to remove it",
    "",
    "1. Close or decline this pull request, or",
    `2. After merge, delete \`${CI_WORKFLOW_FILE}\` and \`${CONFIG_FILE_NAME}\`, remove any Evergreen badge line from \`README.md\`, and uninstall the Evergreen GitHub App from the repository settings.`,
    "",
    "Uninstalling the app stops future onboarding pull requests; it does not delete files already merged.",
    "",
  ].join("\n");
}

/** Title used for every onboarding pull request. */
export const ONBOARDING_PULL_REQUEST_TITLE = "Add Evergreen lifecycle scan";

/** Branch the app opens against the repository default branch. */
export const ONBOARDING_BRANCH = "evergreen/onboarding";

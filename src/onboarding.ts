import { lstat } from "node:fs/promises";
import { resolve } from "node:path";

import { badgeSnippet } from "./badge.js";
import { CONFIG_FILE_NAME } from "./config.js";
import type { Severity } from "./domain.js";
import { CI_WORKFLOW_FILE } from "./init.js";
import { VERSION } from "./version.js";
import { discoverNpmWorkspaces, discoverPythonWorkspaces } from "./workspaces.js";

/**
 * Commit SHA for `actions/checkout` at the major used by Evergreen's own workflows.
 * Kept in sync with `.github/workflows/ci.yml` and the bundled SHA map (`v7.0.1`).
 */
export const CHECKOUT_ACTION_SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
export const CHECKOUT_ACTION_TAG = "v7";

/**
 * Commit SHA for the published `arminazimi/evergreen` Action at {@link VERSION}.
 * Kept in sync with `.github/workflows/org-scan.yml` on each release.
 */
export const EVERGREEN_ACTION_SHA = "a0225978d6fae230468cf7efd47d4b1b3a4cbc33";

/** Virtual path for the README badge markup; the caller merges it into README, it is not a whole file. */
export const ONBOARDING_BADGE_FILE = "README.badge.md";

export type OnboardingStack = "go" | "monorepo" | "node" | "python";

export interface OnboardingInput {
  /** Absolute or relative repository root to inspect. */
  root: string;
  /** `owner/name` for the README badge snippet. */
  repository: string;
  /** Severity gate for the workflow and config; defaults to `high`. */
  gate?: Severity;
}

/**
 * Proposed onboarding files as a path → contents map. Never written by this module: the caller
 * (the onboarding app) decides what to commit. Keys are {@link CI_WORKFLOW_FILE},
 * {@link CONFIG_FILE_NAME}, and {@link ONBOARDING_BADGE_FILE}.
 */
export type OnboardingFileMap = Record<string, string>;

export interface OnboardingProposal {
  /** Stacks detected from repository manifests; sorted, unique. */
  stacks: OnboardingStack[];
  /** Files the onboarding pull request may add. */
  files: OnboardingFileMap;
}

async function exists(path: string): Promise<boolean> {
  return (await lstat(path).catch(() => undefined)) !== undefined;
}

/**
 * Detects Node, Python, Go, and monorepo shapes from repository files only. No network and no
 * execution of repository contents. A monorepo is a workspace declaration (npm/yarn/pnpm/lerna or
 * uv), not merely more than one language.
 */
export async function detectOnboardingStacks(root: string): Promise<OnboardingStack[]> {
  const stacks = new Set<OnboardingStack>();
  if (await exists(resolve(root, "package.json"))) stacks.add("node");
  if (await exists(resolve(root, "go.mod"))) stacks.add("go");
  if (
    (await exists(resolve(root, "pyproject.toml"))) ||
    (await exists(resolve(root, "requirements.txt"))) ||
    (await exists(resolve(root, "setup.py")))
  ) {
    stacks.add("python");
  }
  const [npmWorkspaces, pythonWorkspaces] = await Promise.all([
    discoverNpmWorkspaces(root),
    discoverPythonWorkspaces(root),
  ]);
  if (npmWorkspaces.length > 0 || pythonWorkspaces.length > 0) stacks.add("monorepo");
  return [...stacks].sort();
}

/** GitHub Actions workflow with full SHA pins (and version comments), matching init's shape. */
export function pinnedCiWorkflow(gate: Severity): string {
  return (
    [
      "name: Evergreen",
      "",
      "on:",
      "  pull_request:",
      "  push:",
      "    branches: [main]",
      "",
      "permissions:",
      "  contents: read",
      "",
      "jobs:",
      "  lifecycle:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      `      - uses: actions/checkout@${CHECKOUT_ACTION_SHA} # ${CHECKOUT_ACTION_TAG}`,
      `      - uses: arminazimi/evergreen@${EVERGREEN_ACTION_SHA} # v${VERSION}`,
      "        with:",
      "          baseline: .evergreen-baseline.json",
      `          fail-on-severity: ${gate}`,
    ].join("\n") + "\n"
  );
}

/** `.evergreen.json` for the detected stacks: baseline + gate, plus ignore paths when known. */
export function onboardingConfig(stacks: readonly OnboardingStack[], gate: Severity): string {
  const ignore = ignoreForStacks(stacks);
  const config: Record<string, unknown> = {
    $schema: "https://github.com/arminazimi/evergreen/schemas/config.v1.schema.json",
    schemaVersion: "evergreen.config.v1",
    failOn: gate,
    baseline: [".evergreen-baseline.json"],
  };
  if (ignore.length > 0) config.ignore = ignore;
  return `${JSON.stringify(config, null, 2)}\n`;
}

function ignoreForStacks(stacks: readonly OnboardingStack[]): string[] {
  const ignore = new Set<string>();
  // Language stacks do not need ignore entries: detectors already skip dependency and venv trees.
  // A monorepo still benefits from excluding common generated package output that sits outside those skips.
  if (stacks.includes("monorepo")) {
    ignore.add("**/dist/");
    ignore.add("**/build/");
    ignore.add("**/coverage/");
  }
  return [...ignore].sort();
}

/**
 * Pure proposal of the Evergreen workflow, config, and README badge snippet for a repository.
 * Reuses the workflow shape and path from `init`, pins third-party and first-party actions to SHAs,
 * and never writes files or uses the network.
 */
export async function proposeOnboarding(input: OnboardingInput): Promise<OnboardingProposal> {
  const root = resolve(input.root);
  if (!(await lstat(root).catch(() => undefined))?.isDirectory()) {
    throw new Error(`${root} is not a directory.`);
  }
  const gate = input.gate ?? "high";
  const stacks = await detectOnboardingStacks(root);
  const files: OnboardingFileMap = {
    [CI_WORKFLOW_FILE]: pinnedCiWorkflow(gate),
    [CONFIG_FILE_NAME]: onboardingConfig(stacks, gate),
    [ONBOARDING_BADGE_FILE]: badgeSnippet(input.repository, "markdown"),
  };
  return { stacks, files };
}

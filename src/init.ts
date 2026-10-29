import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { AgentFileError, renderDiff } from "./agent-instructions.js";
import type { Severity } from "./domain.js";
import { updateAgentFile } from "./init-agents.js";
import type { AgentFileName } from "./init-agents.js";
import { initHooks } from "./init-hooks.js";
import type { InitHooksResult } from "./init-hooks.js";
import { findPackageFile, readBoundedFile } from "./package-files.js";
import { planSetup } from "./setup.js";
import type { SetupEntry } from "./setup.js";
import { VERSION } from "./version.js";

export const CI_WORKFLOW_FILE = ".github/workflows/evergreen.yml";

const GITLAB_INCLUDE_SNIPPET = "include:\n  - component: $CI_SERVER_FQDN/<group>/<project>/evergreen@<version>";

const SITE_STARTER_DIRECTORY = "examples/starters/slipway";

/** A `gem` line that declares the Slipway theme; a commented-out line never matches because the pattern anchors on `gem`. */
const SLIPWAY_THEME_GEM = /^\s*gem\s+["']slipway(?:-theme)?["']/m;

/** The GitHub Actions workflow `init` generates for a detected GitHub Actions repository. */
export function ciWorkflow(gate: Severity): string {
  return [
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
    "      - uses: actions/checkout@v7",
    `      - uses: arminazimi/evergreen@v${VERSION}`,
    "        with:",
    "          baseline: .evergreen-baseline.json",
    `          fail-on-severity: ${gate}`,
  ].join("\n") + "\n";
}

export type InitStepKind = "ci" | "hooks" | "agents";
export type InitStepChange = InitHooksResult["change"] | "advice";

export interface InitStep {
  kind: InitStepKind;
  file: string;
  change: InitStepChange;
  /** A unified diff of the change; empty for advice, managed, and unchanged steps. */
  diff: string;
  /** For "advice" and "managed": the text the user adds to the file themselves (the GitLab include or a hook-manager block). */
  snippet?: string;
  /** For "managed": the hook manager that owns the hooks here. */
  manager?: string;
  /** The front matter a file created for an agent host needs. */
  prefix?: string;
  /** Agent hosts that read this file; empty for the fallback AGENTS.md. */
  hosts: string[];
}

/** A site stack `init` recognizes, and the starter files this package ships for it. */
export interface SiteStarterSuggestion {
  /** "Slipway" when the Gemfile names the Slipway theme; "Jekyll" for every other Jekyll site. */
  stack: "Jekyll" | "Slipway";
  /** The starter directory inside this package: `examples/starters/slipway/`. */
  directory: string;
  /** The exact command that copies the starter into the repository root. */
  command: string;
}

export interface InitSetupPlan {
  /** The absolute repository root the plan was built for. */
  root: string;
  /** The CI provider labels detected ("GitHub Actions", "GitLab CI/CD"); none when empty. */
  detectedCi: string[];
  /** Agent host labels detected (Claude Code, Codex, …); empty when none. */
  detectedAgents: string[];
  /** The Jekyll or Slipway site detected; undefined for every other repository. */
  site?: SiteStarterSuggestion;
  steps: InitStep[];
}

export interface InitSetupInput {
  root: string;
  gate: Severity;
  /** The agent file to create when no host is detected; the default is AGENTS.md. */
  file?: AgentFileName;
}

export interface InitSetupResult {
  /** Every step in the plan, after writing: unchanged and advice steps pass through as they are. */
  steps: InitStep[];
  /** Every path that was actually written. */
  written: string[];
}

async function exists(path: string): Promise<boolean> {
  return (await lstat(path).catch(() => undefined)) !== undefined;
}

function toHookStep(result: InitHooksResult): InitStep {
  return {
    kind: "hooks",
    file: result.file,
    change: result.change,
    diff: result.diff,
    hosts: [],
    ...(result.manager ? { manager: result.manager } : {}),
    ...(result.snippet ? { snippet: result.snippet } : {}),
  };
}

function toAgentStep(entry: SetupEntry): InitStep {
  return {
    kind: "agents",
    file: entry.file,
    change: entry.change,
    diff: entry.diff,
    hosts: entry.hosts,
    ...(entry.prefix ? { prefix: entry.prefix } : {}),
  };
}

async function fallbackAgentEntry(root: string, file?: AgentFileName): Promise<SetupEntry> {
  const result = await updateAgentFile(root, file ?? "AGENTS.md", { dryRun: true });
  return { file: result.file, change: result.change, diff: result.diff, hosts: [] };
}

/**
 * Detects a Jekyll site by `_config.yml` plus a `Gemfile`, and Slipway when the Gemfile declares the Slipway theme.
 * The files are read as text and never executed, and nothing is copied: the plan carries the command for the starter
 * files this package ships. Returns undefined for every other repository.
 */
async function planSiteStarter(root: string): Promise<SiteStarterSuggestion | undefined> {
  if (!(await exists(resolve(root, "_config.yml")))) return undefined;
  const gemfile = await readBoundedFile(resolve(root, "Gemfile")).catch(() => undefined);
  if (gemfile === undefined) return undefined;
  const directory = dirname(await findPackageFile(`${SITE_STARTER_DIRECTORY}/README.md`, import.meta.url));
  return {
    stack: gemfile.contents !== undefined && SLIPWAY_THEME_GEM.test(gemfile.contents) ? "Slipway" : "Jekyll",
    directory,
    command: `cp -R ${JSON.stringify(directory)}/. ${JSON.stringify(root)}`,
  };
}

/** The lines `init` prints for a detected site stack: the stack, the exact copy command, and that nothing was copied. */
export function siteSuggestion(site: SiteStarterSuggestion): string {
  return `Detected a ${site.stack} site. Evergreen ships a starter for it; copy it with:\n\n  ${site.command}\n\nNothing was copied.\n`;
}

/**
 * Works out what `evergreen init` would offer and change in a repository, without writing anything: the CI provider it
 * detects (GitHub Actions gets a workflow, GitLab CI/CD gets the component include to add by hand), the Git pre-push
 * hook, and the Evergreen section for the agent hosts it detects (defaulting to AGENTS.md when none are found).
 * A Jekyll or Slipway site also gets the command that copies the starter files, which `init` never runs itself.
 * A damaged Evergreen marker in any agent file fails the plan, like `setup` does.
 */
export async function planInitSetup(input: InitSetupInput): Promise<InitSetupPlan> {
  const root = resolve(input.root);
  if (!(await lstat(root).catch(() => undefined))?.isDirectory()) throw new AgentFileError(`${root} is not a directory.`);

  const steps: InitStep[] = [];
  const detectedCi = new Set<string>();

  if (await exists(resolve(root, ".gitlab-ci.yml"))) {
    detectedCi.add("GitLab CI/CD");
    steps.push({ kind: "ci", file: ".gitlab-ci.yml", change: "advice", diff: "", snippet: GITLAB_INCLUDE_SNIPPET, hosts: [] });
  }
  if (await exists(resolve(root, ".github"))) {
    detectedCi.add("GitHub Actions");
    const path = resolve(root, CI_WORKFLOW_FILE);
    const before = (await readFile(path, "utf8").catch(() => undefined)) ?? undefined;
    const target = ciWorkflow(input.gate);
    const change: InitStepChange = before === undefined ? "created" : before === target ? "unchanged" : "updated";
    steps.push({
      kind: "ci",
      file: CI_WORKFLOW_FILE,
      change,
      diff: change === "unchanged" ? "" : renderDiff(CI_WORKFLOW_FILE, before ?? "", target),
      hosts: [],
    });
  }

  const hooks = await initHooks({ root, gate: input.gate, dryRun: true }).catch(() => undefined);
  if (hooks !== undefined) steps.push(toHookStep(hooks)); // no Git repository, so there is no hook to offer

  const agents = await planSetup(root);
  const entries = agents.entries.length > 0 ? agents.entries : [await fallbackAgentEntry(root, input.file)];
  for (const entry of entries) steps.push(toAgentStep(entry));

  const site = await planSiteStarter(root);
  return { root, detectedCi: [...detectedCi], detectedAgents: agents.detected, steps, ...(site ? { site } : {}) };
}

/** One-line summary of what a plan writes, used for the confirmation prompt. */
export function planSummary(plan: InitSetupPlan): string {
  const touches: string[] = [];
  const writableSteps = plan.steps.filter((step) => step.change === "created" || step.change === "added" || step.change === "updated");
  if (writableSteps.some((step) => step.kind === "ci")) touches.push(`CI at ${plan.detectedCi.join(" and ")}`);
  if (writableSteps.some((step) => step.kind === "hooks")) touches.push("the Git pre-push hook");
  const files = [...new Set(writableSteps.filter((step) => step.kind === "agents").map((step) => step.file))];
  if (files.length > 0) touches.push(`the Evergreen section in ${listAnd(files)}`);
  return touches.length === 0 ? "Nothing to write." : `This writes ${listAnd(touches)}. No network access is used.`;
}

function listAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

const WRITABLE = new Set<InitStepChange>(["created", "added", "updated"]);

/** True when the plan has at least one step that writes a file. */
export function hasWritables(plan: InitSetupPlan): boolean {
  return plan.steps.some((step) => WRITABLE.has(step.change));
}

/** Applies a plan from `planInitSetup`: writes the workflow, installs the hook, and updates the agent files. */
export async function applyInitSetup(options: { plan: InitSetupPlan; gate: Severity }): Promise<InitSetupResult> {
  const written: string[] = [];
  const steps: InitStep[] = [];
  for (const step of options.plan.steps) {
    if (!WRITABLE.has(step.change)) {
      steps.push(step);
      continue;
    }
    const root = options.plan.root;
    if (step.kind === "ci") {
      const path = resolve(root, CI_WORKFLOW_FILE);
      const before = (await readFile(path, "utf8").catch(() => undefined)) ?? undefined;
      const target = ciWorkflow(options.gate);
      if (before === target) {
        steps.push({ ...step, change: "unchanged", diff: "" });
        continue;
      }
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, target);
      steps.push({ ...step, change: before === undefined ? "created" : "updated", diff: renderDiff(CI_WORKFLOW_FILE, before ?? "", target) });
      written.push(CI_WORKFLOW_FILE);
      continue;
    }
    if (step.kind === "hooks") {
      const result = await initHooks({ root, gate: options.gate });
      steps.push(toHookStep(result));
      if (result.written) written.push(result.file);
      continue;
    }
    const result = await updateAgentFile(root, step.file, step.prefix ? { createPrefix: step.prefix } : {});
    steps.push(toAgentStep({ ...result, hosts: step.hosts }));
    if (result.written) written.push(result.file);
  }
  return { steps, written };
}

export interface InitAgentOptions {
  /** The repository root. */
  root: string;
  /** Report what would change, including a diff, and write nothing. */
  dryRun?: boolean;
  /** Fallback file when no host is detected; defaults to AGENTS.md. */
  file?: AgentFileName;
}

export interface InitAgentResult {
  detected: string[];
  entries: SetupEntry[];
  written: string[];
}

/**
 * Detects whichever agent host the repository uses (Claude Code, Codex, Cursor, Copilot,
 * Windsurf, Cline, Aider, and others) and writes or updates the matching instruction file
 * without overwriting user content. If no host is detected, it falls back to AGENTS.md.
 */
export async function initAgent(options: InitAgentOptions): Promise<InitAgentResult> {
  const root = resolve(options.root);
  if (!(await lstat(root).catch(() => undefined))?.isDirectory()) throw new AgentFileError(`${root} is not a directory.`);

  const plan = await planSetup(root);
  const detected = plan.detected;
  const entries: SetupEntry[] =
    plan.entries.length > 0 ? plan.entries : [await fallbackAgentEntry(root, options.file)];

  if (options.dryRun) {
    return { detected, entries, written: [] };
  }

  const written: string[] = [];
  for (const entry of entries) {
    if (entry.change === "unchanged") continue;
    const result = await updateAgentFile(root, entry.file, entry.prefix ? { createPrefix: entry.prefix } : {});
    if (result.written) written.push(result.file);
  }
  return { detected, entries, written };
}

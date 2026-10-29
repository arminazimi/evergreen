import { spawnSync } from "node:child_process";
import { lstat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { AgentFileError } from "./agent-instructions.js";
import { updateAgentFile } from "./init-agents.js";
import type { InitAgentsResult } from "./init-agents.js";

interface Host {
  id: string;
  label: string;
  /** Files or folders whose presence means the repository is configured for this host. */
  markers: string[];
  /** The instruction file that host reads, given which markers were found. */
  file: (found: string[]) => string;
  /** Front matter a newly created file needs. */
  createPrefix?: string;
  /**
   * The `--agent` value for `npx skills add` when this host supports the portable Skill.
   * Omitted for hosts that do not.
   */
  skillAgent?: string;
}

const CURSOR_FRONT_MATTER = "---\ndescription: Check a dependency with Evergreen before adding it\nalwaysApply: true\n---\n\n";
const WINDSURF_FRONT_MATTER = "---\ntrigger: always_on\ndescription: Check a dependency with Evergreen before adding it\n---\n\n";

const SKILL_SOURCE = "arminazimi/evergreen";
const SKILL_NAME = "evergreen-deprecation";

const HOSTS: Host[] = [
  { id: "claude-code", label: "Claude Code", markers: [".claude", "CLAUDE.md"], file: () => "CLAUDE.md", skillAgent: "claude-code" },
  { id: "codex", label: "Codex", markers: [".codex"], file: () => "AGENTS.md", skillAgent: "codex" },
  { id: "cursor", label: "Cursor", markers: [".cursor", ".cursorrules"], file: () => ".cursor/rules/evergreen.mdc", createPrefix: CURSOR_FRONT_MATTER, skillAgent: "cursor" },
  { id: "gemini-cli", label: "Gemini CLI", markers: [".gemini", "GEMINI.md"], file: () => "GEMINI.md", skillAgent: "gemini-cli" },
  { id: "copilot", label: "GitHub Copilot", markers: [".github/copilot-instructions.md", ".github/instructions"], file: () => ".github/copilot-instructions.md", skillAgent: "github-copilot" },
  {
    id: "kilo",
    label: "Kilo Code",
    markers: [".kilo", ".kilocode", "kilo.jsonc", "kilo.json"],
    file: (found) => (found.includes(".kilocode") && !found.includes(".kilo") ? ".kilocode/rules/evergreen.md" : ".kilo/rules/evergreen.md"),
  },
  {
    id: "windsurf",
    label: "Windsurf",
    markers: [".windsurf", ".windsurfrules"],
    file: () => ".windsurf/rules/evergreen.md",
    createPrefix: WINDSURF_FRONT_MATTER,
  },
  {
    id: "cline",
    label: "Cline",
    markers: [".cline", ".clinerules"],
    file: (found) => (found.includes(".cline") && !found.includes(".clinerules") ? ".cline/rules/evergreen.md" : ".clinerules/evergreen.md"),
  },
  {
    id: "aider",
    label: "Aider",
    markers: [".aider.conf.yml", ".aider"],
    file: () => "CONVENTIONS.md",
  },
];

export interface SetupEntry extends Omit<InitAgentsResult, "written"> {
  /** The hosts that read this file; several can share one, such as AGENTS.md. */
  hosts: string[];
  prefix?: string;
}

/** One Skill install to offer for a detected host that supports Skills. */
export interface SetupSkillOffer {
  /** Host label shown to the user, such as `Cursor`. */
  host: string;
  /** The skills CLI `--agent` value. */
  agent: string;
  /** Exact shell command to install the Skill for this host. */
  command: string;
}

export interface SetupPlan {
  /** Hosts whose configuration was found, in a fixed order. */
  detected: string[];
  entries: SetupEntry[];
  /** Skill installs for detected hosts that support the portable Skill. */
  skills: SetupSkillOffer[];
}

/** Result of running the offered Skill installs. */
export interface SetupSkillInstallResult {
  /** Host labels whose install exited 0. */
  installed: string[];
  /** Host labels whose install failed, with the stderr (or a short reason). */
  failed: { host: string; detail: string }[];
}

/** Injectable runner for Skill installs; tests pass a stub so dry-run and consent paths never use the network. */
export type SkillInstallRunner = (
  args: string[],
  options: { cwd: string },
) => { status: number | null; stdout: string; stderr: string };

async function exists(path: string): Promise<boolean> {
  return (await lstat(path).catch(() => undefined)) !== undefined;
}

/** Exact argv after `npx` for installing the Skill for one skills-CLI agent target. */
export function skillInstallArgs(agent: string): string[] {
  return ["skills", "add", SKILL_SOURCE, "--agent", agent, "--skill", SKILL_NAME, "--yes"];
}

/** Exact shell command shown to the user for one skills-CLI agent target. */
export function skillInstallCommand(agent: string): string {
  return ["npx", ...skillInstallArgs(agent)].join(" ");
}

function defaultSkillInstallRunner(args: string[], options: { cwd: string }): { status: number | null; stdout: string; stderr: string } {
  // Tests set this so CLI integration never reaches the network; production leaves it unset.
  if (process.env.EVERGREEN_SETUP_SKILL_INSTALL === "0") {
    return { status: 0, stdout: "", stderr: "" };
  }
  const result = spawnSync("npx", args, {
    cwd: options.cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/**
 * Works out what `setup` would change without writing anything. It only adds or refreshes the marked Evergreen section
 * (see `init --agents`), so existing rules in these files are kept byte for byte. A damaged marker in any file fails the
 * whole plan before anything is written. Hosts that support Skills also get an install command in `skills`.
 */
export async function planSetup(rootInput: string): Promise<SetupPlan> {
  const root = resolve(rootInput);
  if (!(await lstat(root).catch(() => undefined))?.isDirectory()) throw new AgentFileError(`${root} is not a directory.`);

  const detected: string[] = [];
  const skills: SetupSkillOffer[] = [];
  const targets = new Map<string, { hosts: string[]; prefix?: string }>();
  for (const host of HOSTS) {
    const found: string[] = [];
    for (const marker of host.markers) if (await exists(join(root, marker))) found.push(marker);
    if (found.length === 0) continue;
    detected.push(host.label);
    if (host.skillAgent) {
      skills.push({ host: host.label, agent: host.skillAgent, command: skillInstallCommand(host.skillAgent) });
    }
    const file = host.file(found);
    const target = targets.get(file) ?? { hosts: [], ...(host.createPrefix ? { prefix: host.createPrefix } : {}) };
    target.hosts.push(host.label);
    targets.set(file, target);
  }

  const entries: SetupEntry[] = [];
  for (const [file, target] of targets) {
    const result = await updateAgentFile(root, file, { dryRun: true, ...(target.prefix ? { createPrefix: target.prefix } : {}) });
    entries.push({ file: result.file, change: result.change, diff: result.diff, hosts: target.hosts, ...(target.prefix ? { prefix: target.prefix } : {}) });
  }
  return { detected, entries, skills };
}

/** Writes the entries of a plan that change something. */
export async function applySetup(rootInput: string, plan: SetupPlan): Promise<string[]> {
  const root = resolve(rootInput);
  const written: string[] = [];
  for (const entry of plan.entries) {
    if (entry.change === "unchanged") continue;
    await updateAgentFile(root, entry.file, entry.prefix ? { createPrefix: entry.prefix } : {});
    written.push(entry.file);
  }
  return written;
}

/**
 * Runs each offered Skill install. Call only after consent (`--yes`); dry-run must never call this.
 * The runner is injectable so tests never hit the network.
 */
export function installSetupSkills(
  plan: SetupPlan,
  options: { cwd?: string; run?: SkillInstallRunner } = {},
): SetupSkillInstallResult {
  const cwd = resolve(options.cwd ?? ".");
  const run = options.run ?? defaultSkillInstallRunner;
  const installed: string[] = [];
  const failed: { host: string; detail: string }[] = [];
  for (const offer of plan.skills) {
    const result = run(skillInstallArgs(offer.agent), { cwd });
    if (result.status === 0) {
      installed.push(offer.host);
      continue;
    }
    const detail = (result.stderr.trim() || result.stdout.trim() || `exit ${result.status ?? "null"}`).slice(0, 500);
    failed.push({ host: offer.host, detail });
  }
  return { installed, failed };
}

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
}

const CURSOR_FRONT_MATTER = "---\ndescription: Check a dependency with Evergreen before adding it\nalwaysApply: true\n---\n\n";

const HOSTS: Host[] = [
  { id: "claude-code", label: "Claude Code", markers: [".claude", "CLAUDE.md"], file: () => "CLAUDE.md" },
  { id: "codex", label: "Codex", markers: [".codex"], file: () => "AGENTS.md" },
  { id: "cursor", label: "Cursor", markers: [".cursor", ".cursorrules"], file: () => ".cursor/rules/evergreen.mdc", createPrefix: CURSOR_FRONT_MATTER },
  { id: "gemini-cli", label: "Gemini CLI", markers: [".gemini", "GEMINI.md"], file: () => "GEMINI.md" },
  { id: "copilot", label: "GitHub Copilot", markers: [".github/copilot-instructions.md", ".github/instructions"], file: () => ".github/copilot-instructions.md" },
  {
    id: "kilo",
    label: "Kilo Code",
    markers: [".kilo", ".kilocode", "kilo.jsonc", "kilo.json"],
    file: (found) => (found.includes(".kilocode") && !found.includes(".kilo") ? ".kilocode/rules/evergreen.md" : ".kilo/rules/evergreen.md"),
  },
];

export interface SetupEntry extends Omit<InitAgentsResult, "written"> {
  /** The hosts that read this file; several can share one, such as AGENTS.md. */
  hosts: string[];
  prefix?: string;
}

export interface SetupPlan {
  /** Hosts whose configuration was found, in a fixed order. */
  detected: string[];
  entries: SetupEntry[];
}

async function exists(path: string): Promise<boolean> {
  return (await lstat(path).catch(() => undefined)) !== undefined;
}

/**
 * Works out what `setup` would change without writing anything. It only adds or refreshes the marked Evergreen section
 * (see `init --agents`), so existing rules in these files are kept byte for byte. A damaged marker in any file fails the
 * whole plan before anything is written.
 */
export async function planSetup(rootInput: string): Promise<SetupPlan> {
  const root = resolve(rootInput);
  if (!(await lstat(root).catch(() => undefined))?.isDirectory()) throw new AgentFileError(`${root} is not a directory.`);

  const detected: string[] = [];
  const targets = new Map<string, { hosts: string[]; prefix?: string }>();
  for (const host of HOSTS) {
    const found: string[] = [];
    for (const marker of host.markers) if (await exists(join(root, marker))) found.push(marker);
    if (found.length === 0) continue;
    detected.push(host.label);
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
  return { detected, entries };
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

import process from "node:process";

import { AgentFileError } from "../agent-instructions.js";
import { applySetup, installSetupSkills, planSetup } from "../setup.js";
import type { SetupEntry, SetupPlan } from "../setup.js";
import type { CliCommand, CommandContext } from "./types.js";

const USAGE = "Usage: evergreen setup [path] [--yes] [--dry-run]";

/** What `setup` accepts besides a path. */
const FLAGS = new Set(["--yes", "-y", "--dry-run"]);

/** The line printed for each planned change to one instruction file. */
const CHANGE_VERBS: Readonly<Record<SetupEntry["change"], string>> = {
  created: "create",
  added: "add the Evergreen section to",
  updated: "update the Evergreen section in",
  unchanged: "leave unchanged",
};

/** The flags and the single path, or `undefined` when the arguments are not `setup`'s. */
function readChoice(args: readonly string[]): { root: string; dryRun: boolean; yes: boolean } | undefined {
  const positional = args.filter((argument) => !argument.startsWith("-"));
  if (args.some((argument) => argument.startsWith("-") && !FLAGS.has(argument)) || positional.length > 1)
    return undefined;
  return {
    root: positional[0] ?? ".",
    dryRun: args.includes("--dry-run"),
    yes: args.includes("--yes") || args.includes("-y"),
  };
}

/** Prints the detected hosts, one verb line per instruction file with its diff, and the Skill offers. */
function printPlan(plan: SetupPlan): void {
  process.stdout.write(`Detected: ${plan.detected.join(", ")}\n\n`);
  for (const entry of plan.entries) {
    const verb = CHANGE_VERBS[entry.change];
    process.stdout.write(
      `${entry.change === "unchanged" ? "Already current:" : `Would ${verb}`} ${entry.file} (${entry.hosts.join(", ")})\n`,
    );
    if (entry.diff) process.stdout.write(`\n${entry.diff}\n\n`);
  }
  if (plan.skills.length > 0) {
    process.stdout.write("\nSkill install (supported hosts):\n");
    for (const offer of plan.skills) process.stdout.write(`  ${offer.host}: ${offer.command}\n`);
  }
}

/**
 * The answer to "may I write this?" when the caller gave no `--yes`. A return value other than `undefined` is the
 * exit code to hand back: a usage error with nobody to ask, or the plain refusal of a "no".
 */
async function confirmWrite(ctx: CommandContext): Promise<number | undefined> {
  if (!process.stdin.isTTY)
    return ctx.fail(
      "usage",
      "Confirmation needed: pass --yes to write these changes, or --dry-run to only print them.",
    );
  const readline = await import("node:readline/promises");
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question("Apply these changes? [y/N] ");
  prompt.close();
  if (/^y(es)?$/i.test(answer.trim())) return undefined;
  process.stdout.write("Nothing was written.\n");
  return 0;
}

/**
 * Skill install uses the network; only with `--yes`, never in dry-run, never on interactive file confirm alone.
 * Without `--yes` the command is only shown.
 */
function installSkills(plan: SetupPlan, root: string, yes: boolean, ctx: CommandContext): number {
  if (plan.skills.length === 0) return 0;
  if (!yes) {
    process.stdout.write("Pass --yes to install the Skill, or run the command above.\n");
    return 0;
  }
  const result = installSetupSkills(plan, { cwd: root });
  if (result.installed.length > 0) process.stdout.write(`Installed the Skill for ${result.installed.join(", ")}.\n`);
  for (const failure of result.failed)
    process.stderr.write(`Skill install failed for ${failure.host}: ${failure.detail}\n`);
  if (result.failed.length > 0)
    return ctx.fail("internal", `Skill install failed for ${result.failed.map((item) => item.host).join(", ")}.`);
  return 0;
}

/** `setup`: adds the Evergreen section to the instruction file of every detected agent host, and offers the Skill. */
export const command: CliCommand = {
  name: "setup",
  flags: ["--yes", "--dry-run"],
  example: "evergreen setup --dry-run",
  usage: ["  evergreen setup [path] [--yes] [--dry-run]"],
  usageSlots: [54],
  async run(args, ctx) {
    const choice = readChoice(args);
    if (!choice) return ctx.fail("usage", USAGE);
    const { root, dryRun, yes } = choice;
    try {
      const plan = await planSetup(root);
      if (plan.entries.length === 0) {
        process.stdout.write(
          "No agent host configuration found (looked for Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Kilo Code, Windsurf, Cline, and Aider).\nRun `evergreen init --agents` to add the section to AGENTS.md or CLAUDE.md.\n",
        );
        return 0;
      }
      printPlan(plan);
      const filesNeedWrite = plan.entries.some((entry) => entry.change !== "unchanged");
      if (!filesNeedWrite && plan.skills.length === 0) {
        process.stdout.write("Nothing to change.\n");
        return 0;
      }
      if (dryRun) {
        process.stdout.write("Dry run: nothing was written.\n");
        return 0;
      }
      if (filesNeedWrite && !yes) {
        const refused = await confirmWrite(ctx);
        if (refused !== undefined) return refused;
      }
      if (filesNeedWrite) {
        const written = await applySetup(root, plan);
        process.stdout.write(`Updated ${written.join(", ")}.\n`);
      } else {
        process.stdout.write("Instruction files are already current.\n");
      }
      return installSkills(plan, root, yes, ctx);
    } catch (error) {
      if (error instanceof AgentFileError) return ctx.fail("parse", error.message);
      throw error;
    }
  },
};

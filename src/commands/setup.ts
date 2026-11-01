import process from "node:process";

import { AgentFileError } from "../agent-instructions.js";
import { applySetup, installSetupSkills, planSetup } from "../setup.js";
import type { CliCommand } from "./types.js";

/** `setup`: adds the Evergreen section to the instruction file of every detected agent host, and offers the Skill. */
export const command: CliCommand = {
  name: "setup",
  flags: ["--yes", "--dry-run"],
  example: "evergreen setup --dry-run",
  usage: ["  evergreen setup [path] [--yes] [--dry-run]"],
  usageSlots: [54],
  async run(args, ctx) {
    const usage = "Usage: evergreen setup [path] [--yes] [--dry-run]";
    const flags = new Set(["--yes", "-y", "--dry-run"]);
    const positional = args.filter((argument) => !argument.startsWith("-"));
    if (args.some((argument) => argument.startsWith("-") && !flags.has(argument)) || positional.length > 1) return ctx.fail("usage", usage);
    const dryRun = args.includes("--dry-run");
    const yes = args.includes("--yes") || args.includes("-y");
    const root = positional[0] ?? ".";
    try {
      const plan = await planSetup(root);
      if (plan.entries.length === 0) {
        process.stdout.write("No agent host configuration found (looked for Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Kilo Code, Windsurf, Cline, and Aider).\nRun `evergreen init --agents` to add the section to AGENTS.md or CLAUDE.md.\n");
        return 0;
      }
      process.stdout.write(`Detected: ${plan.detected.join(", ")}\n\n`);
      for (const entry of plan.entries) {
        const verb = { created: "create", added: "add the Evergreen section to", updated: "update the Evergreen section in", unchanged: "leave unchanged" }[entry.change];
        process.stdout.write(`${verb === "leave unchanged" ? "Already current:" : `Would ${verb}`} ${entry.file} (${entry.hosts.join(", ")})\n`);
        if (entry.diff) process.stdout.write(`\n${entry.diff}\n\n`);
      }
      if (plan.skills.length > 0) {
        process.stdout.write("\nSkill install (supported hosts):\n");
        for (const offer of plan.skills) process.stdout.write(`  ${offer.host}: ${offer.command}\n`);
      }
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
        if (!process.stdin.isTTY) return ctx.fail("usage", "Confirmation needed: pass --yes to write these changes, or --dry-run to only print them.");
        const readline = await import("node:readline/promises");
        const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await prompt.question("Apply these changes? [y/N] ");
        prompt.close();
        if (!/^y(es)?$/i.test(answer.trim())) {
          process.stdout.write("Nothing was written.\n");
          return 0;
        }
      }
      if (filesNeedWrite) {
        const written = await applySetup(root, plan);
        process.stdout.write(`Updated ${written.join(", ")}.\n`);
      } else {
        process.stdout.write("Instruction files are already current.\n");
      }
      // Skill install uses the network; only with `--yes`, never in dry-run, never on interactive file confirm alone.
      if (plan.skills.length > 0 && yes) {
        const result = installSetupSkills(plan, { cwd: root });
        if (result.installed.length > 0) process.stdout.write(`Installed the Skill for ${result.installed.join(", ")}.\n`);
        for (const failure of result.failed) process.stderr.write(`Skill install failed for ${failure.host}: ${failure.detail}\n`);
        if (result.failed.length > 0) return ctx.fail("internal", `Skill install failed for ${result.failed.map((item) => item.host).join(", ")}.`);
      } else if (plan.skills.length > 0) {
        process.stdout.write("Pass --yes to install the Skill, or run the command above.\n");
      }
      return 0;
    } catch (error) {
      if (error instanceof AgentFileError) return ctx.fail("parse", error.message);
      throw error;
    }
  },
};

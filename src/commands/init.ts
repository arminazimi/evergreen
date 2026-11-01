import process from "node:process";

import { AgentFileError } from "../agent-instructions.js";
import type { Severity } from "../domain.js";
import { severityValues } from "../domain.js";
import { initAgents } from "../init-agents.js";
import type { AgentFileName } from "../init-agents.js";
import { initHooks } from "../init-hooks.js";
import { initPersonal } from "../init-personal.js";
import { planInitSetup, applyInitSetup, hasWritables, initAgent, planSummary, siteSuggestion } from "../init.js";
import type { InitStep } from "../init.js";
import type { CliCommand, CommandContext } from "./types.js";

/** `init` with no flags asks what to set up (guided); `init --agents`, `--hooks`, and `--personal` do one thing without asking. */
export const command: CliCommand = {
  name: "init",
  flags: ["--agents", "--hooks", "--personal", "--file", "--fail-on", "--yes", "--dry-run"],
  example: "evergreen init --hooks --dry-run",
  usage: [
    "  evergreen init [path] [--file AGENTS.md|CLAUDE.md] [--fail-on <severity>] [--yes] [--dry-run]   # ask what to set up; apply the defaults for CI, the pre-push hook, and agents",
    "  evergreen init agent [path] [--file AGENTS.md|CLAUDE.md] [--dry-run]   # detect agent host and write matching config",
    "  evergreen init --agents [path] [--file AGENTS.md|CLAUDE.md] [--dry-run]",
    "  evergreen init --hooks [path] [--fail-on <severity>] [--dry-run]   # git pre-push hook; combine with --agents",
    "  evergreen init --personal [--fail-on <severity>] [--yes] [--dry-run]   # global config and pre-push hook for every repository",
  ],
  usageSlots: [49, 50, 51, 52, 53],
  run(args, ctx) {
    return runInit(args, ctx);
  },
};

async function confirmOnTerminal(summary: string, defaultYes = false): Promise<boolean> {
  if (!process.stdin.isTTY) throw new AgentFileError("Confirmation needs a terminal; pass --yes to confirm, or --dry-run to preview.");
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${summary}\nContinue? [${defaultYes ? "Y" : "y"}/N${defaultYes ? "]" : "] "}`)).trim();
    return defaultYes ? !/^n(o)?$/i.test(answer) : /^y(es)?$/i.test(answer);
  } finally {
    rl.close();
  }
}

async function runInit(args: string[], ctx: CommandContext): Promise<number> {
  const usage = "Usage: evergreen init [agent] [--agents] [--hooks] [--personal] [path] [--file AGENTS.md|CLAUDE.md] [--fail-on <severity>] [--yes] [--dry-run]\n";
  if (args[0] === "agent") {
    const agentUsage = "Usage: evergreen init agent [path] [--file AGENTS.md|CLAUDE.md] [--dry-run]\n";
    const agentArgs = args.slice(1);
    const dryRun = agentArgs.includes("--dry-run");
    const fileIndex = agentArgs.indexOf("--file");
    const fileValue = fileIndex === -1 ? undefined : agentArgs[fileIndex + 1];
    if (fileIndex !== -1 && fileValue !== "AGENTS.md" && fileValue !== "CLAUDE.md") {
      return ctx.fail("usage", "--file must be AGENTS.md or CLAUDE.md.", agentUsage);
    }
    const flags = new Set(["--dry-run", "--file"]);
    const positional = agentArgs.filter((argument, index) => !flags.has(argument) && (fileIndex === -1 || index !== fileIndex + 1) && !argument.startsWith("-"));
    const unknown = agentArgs.filter((argument) => argument.startsWith("-") && !flags.has(argument));
    if (unknown.length > 0 || positional.length > 1) return ctx.fail("usage", agentUsage.trimEnd());
    const root = positional[0] ?? ".";
    try {
      const result = await initAgent({ root, dryRun, ...(fileValue ? { file: fileValue as AgentFileName } : {}) });
      for (const entry of result.entries) {
        if (entry.change === "unchanged") {
          process.stdout.write(`${entry.file} already has the current Evergreen section; nothing to change.\n`);
        } else {
          const verb = entry.change === "created" ? "create" : entry.change === "added" ? "add the Evergreen section to" : "update the Evergreen section in";
          process.stdout.write(dryRun ? `Would ${verb} ${entry.file}:\n\n${entry.diff}\n` : `${entry.change === "created" ? "Created" : entry.change === "added" ? "Added the Evergreen section to" : "Updated the Evergreen section in"} ${entry.file}.\n`);
        }
      }
      return 0;
    } catch (error) {
      if (error instanceof AgentFileError) return ctx.fail("parse", error.message);
      throw error;
    }
  }
  const agents = args.includes("--agents");
  const hooks = args.includes("--hooks");
  const personal = args.includes("--personal");
  const guided = !agents && !hooks && !personal;
  if (personal && (agents || hooks)) return ctx.fail("usage", "--personal cannot be combined with --agents or --hooks.", usage);
  const fileIndex = args.indexOf("--file");
  const fileValue = fileIndex === -1 ? undefined : args[fileIndex + 1];
  if (fileIndex !== -1 && (!agents && !guided || fileValue !== "AGENTS.md" && fileValue !== "CLAUDE.md")) {
    return ctx.fail("usage", "--file must be AGENTS.md or CLAUDE.md, and needs --agents or the guided init.", usage);
  }
  const gateIndex = args.indexOf("--fail-on");
  const gate = gateIndex === -1 ? "high" : args[gateIndex + 1];
  if (gateIndex !== -1 && ((!(hooks || personal) && !guided) || !severityValues.includes(gate as Severity))) {
    return ctx.fail("usage", `--fail-on needs the guided init, --hooks or --personal, and a severity (${severityValues.join(", ")}).`, usage);
  }
  const flags = new Set(["--agents", "--hooks", "--personal", "--yes", "-y", "--dry-run", "--file", "--fail-on"]);
  const positional = args.filter((argument, index) => !flags.has(argument) && index !== fileIndex + 1 && index !== gateIndex + 1 && !argument.startsWith("-"));
  const unknown = args.filter((argument) => argument.startsWith("-") && !flags.has(argument));
  if (unknown.length > 0 || positional.length > 1 || (personal && positional.length > 0)) return ctx.fail("usage", usage.trimEnd());
  const dryRun = args.includes("--dry-run");
  const root = positional[0] ?? ".";
  try {
    if (guided) return await guidedInit(ctx, { root, gate: gate as Severity, dryRun, ...(fileValue !== undefined ? { file: fileValue as AgentFileName } : {}), yes: args.includes("--yes") || args.includes("-y") });
    if (personal) {
      const yes = args.includes("--yes") || args.includes("-y");
      const result = await initPersonal({ gate: gate as Severity, dryRun, confirm: yes ? async () => true : confirmOnTerminal });
      if (result.change === "unchanged") process.stdout.write("The global Evergreen config and pre-push hook are already current; nothing to change.\n");
      else if (result.change === "declined") process.stdout.write("Nothing was changed.\n");
      else if (dryRun) process.stdout.write(`Would write the global config and pre-push hook in ${result.hooksDirectory}:\n\n${result.diff}\n`);
      else process.stdout.write(`Wrote ${result.configFile} and the pre-push hook in ${result.hooksDirectory}; every repository now blocks a push at ${gate} or above.\nBypass it once with \`git push --no-verify\` or \`EVERGREEN_SKIP=1 git push\`.\n`);
      return 0;
    }
    if (agents) {
      const result = await initAgents({ root, dryRun, ...(fileValue ? { file: fileValue as AgentFileName } : {}) });
      if (result.change === "unchanged") process.stdout.write(`${result.file} already has the current Evergreen section; nothing to change.\n`);
      else {
        const verb = result.change === "created" ? "create" : result.change === "added" ? "add the Evergreen section to" : "update the Evergreen section in";
        process.stdout.write(dryRun ? `Would ${verb} ${result.file}:\n\n${result.diff}\n` : `${result.change === "created" ? "Created" : result.change === "added" ? "Added the Evergreen section to" : "Updated the Evergreen section in"} ${result.file}.\n`);
      }
    }
    if (hooks) {
      const result = await initHooks({ root, gate: gate as Severity, dryRun });
      if (result.change === "managed") {
        process.stdout.write(`${result.manager} manages the Git hooks here, so Evergreen did not write one. Add this to ${result.file}:\n\n${result.snippet}\n`);
      } else if (result.change === "unchanged") process.stdout.write(`${result.file} already has the current Evergreen hook; nothing to change.\n`);
      else {
        const verb = result.change === "created" ? "create" : "update";
        process.stdout.write(dryRun ? `Would ${verb} ${result.file}:\n\n${result.diff}\n` : `${result.change === "created" ? "Created" : "Updated"} ${result.file}; it blocks a push at ${gate} or above.\n`);
      }
      if (result.change !== "managed") process.stdout.write("Bypass it once with `git push --no-verify` or `EVERGREEN_SKIP=1 git push`.\n");
    }
    return 0;
  } catch (error) {
    if (error instanceof AgentFileError) return ctx.fail("parse", error.message);
    throw error;
  }
}

/**
 * `init` with no flags: detects the CI provider and agent hosts, and applies what it finds (the GitHub Actions
 * workflow, the pre-push hook, the Evergreen agent section) after one confirmation that defaults to yes.
 */
async function guidedInit(ctx: CommandContext, options: { root: string; gate: Severity; dryRun?: boolean; file?: AgentFileName; yes?: boolean }): Promise<number> {
  if (!options.yes && !options.dryRun && !process.stdin.isTTY) {
    return ctx.fail("usage", "Confirmation needed: pass --yes to write these changes, or --dry-run to only print them.");
  }
  const plan = await planInitSetup({ root: options.root, gate: options.gate, ...(options.file ? { file: options.file } : {}) });
  process.stdout.write(`Detected: ${plan.detectedCi.length > 0 ? plan.detectedCi.join(" and ") : "no CI"}; ${plan.detectedAgents.length > 0 ? plan.detectedAgents.join(", ") : "no agent hosts"}\n`);
  if (plan.site) process.stdout.write(siteSuggestion(plan.site));
  if (options.dryRun) {
    printGuidedSteps(plan.steps, options.dryRun === true, options.gate);
    process.stdout.write("Dry run: nothing was written.\n");
    return 0;
  }
  if (!hasWritables(plan)) {
    printGuidedSteps(plan.steps, false, options.gate);
    return 0;
  }
  if (!options.yes && !(await confirmOnTerminal(planSummary(plan), true))) {
    process.stdout.write("Nothing was changed.\n");
    return 0;
  }
  const result = await applyInitSetup({ plan, gate: options.gate });
  printGuidedSteps(result.steps, false, options.gate);
  return 0;
}

function printGuidedSteps(steps: InitStep[], dryRun: boolean, gate: Severity): void {
  for (const step of steps) {
    if (step.change === "advice") {
      process.stdout.write(`Add this to ${step.file} to scan with the Evergreen GitLab component:\n\n${step.snippet}\n`);
      continue;
    }
    if (step.change === "managed") {
      process.stdout.write(`${step.manager} manages the Git hooks here, so Evergreen did not write one. Add this to ${step.file}:\n\n${step.snippet}\n`);
      continue;
    }
    const future = { created: "Would create", added: "Would add the Evergreen section to", updated: "Would update" };
    const past = { created: "Created", added: "Added the Evergreen section to", updated: "Updated" };
    if (step.change === "unchanged") {
      const noun = step.kind === "agents" ? "section" : step.kind === "ci" ? "workflow" : "hook";
      process.stdout.write(`${step.file} already has the current Evergreen ${noun}; nothing to change.\n`);
      continue;
    }
    const verb = dryRun ? future[step.change as keyof typeof future] : past[step.change as keyof typeof past];
    const tail = step.kind === "ci" ? "; it scans pull requests and pushes to main." : step.kind === "hooks" ? `; it blocks a push at ${gate} or above.` : ".";
    process.stdout.write(`${verb} ${step.file}${tail}\n`);
    if (dryRun && step.diff) process.stdout.write(`\n${step.diff}\n`);
    if (step.kind === "hooks") process.stdout.write("Bypass it once with `git push --no-verify` or `EVERGREEN_SKIP=1 git push`.\n");
  }
}

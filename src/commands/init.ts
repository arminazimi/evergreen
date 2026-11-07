import process from "node:process";

import { AgentFileError } from "../agent-instructions.js";
import type { Severity } from "../domain.js";
import { severityValues } from "../domain.js";
import { initAgents, initClaudeHooks, initCodexHooks } from "../init-agents.js";
import type { AgentFileName } from "../init-agents.js";
import { initHooks } from "../init-hooks.js";
import type { InitHooksResult } from "../init-hooks.js";
import { initPersonal } from "../init-personal.js";
import { planInitSetup, applyInitSetup, hasWritables, initAgent, planSummary, siteSuggestion } from "../init.js";
import type { InitStep } from "../init.js";
import type { CliCommand, CommandContext } from "./types.js";

/** `init` with no flags asks what to set up (guided); `init --agents`, `--hooks`, and `--personal` do one thing without asking. */
export const command: CliCommand = {
  name: "init",
  flags: ["--agents", "--hooks", "--personal", "--hooks-for", "--file", "--fail-on", "--yes", "--dry-run"],
  example: "evergreen init --hooks --dry-run",
  usage: [
    "  evergreen init [path] [--file AGENTS.md|CLAUDE.md] [--fail-on <severity>] [--yes] [--dry-run]   # ask what to set up; apply the defaults for CI, the pre-push hook, and agents",
    "  evergreen init agent [path] [--file AGENTS.md|CLAUDE.md] [--dry-run]   # detect agent host and write matching config",
    "  evergreen init --agents [path] [--file AGENTS.md|CLAUDE.md] [--dry-run]",
    "  evergreen init --hooks [path] [--fail-on <severity>] [--dry-run]   # git pre-push hook; combine with --agents",
    "  evergreen init --personal [--fail-on <severity>] [--yes] [--dry-run]   # global config and pre-push hook for every repository",
    "  evergreen init --hooks-for claude-code|codex [path] [--dry-run]   # post-edit hook in .claude/settings.json or .codex/hooks.json",
  ],
  usageSlots: [49, 50, 51, 52, 53],
  run(args, ctx) {
    return runInit(args, ctx);
  },
};

async function confirmOnTerminal(summary: string, defaultYes = false): Promise<boolean> {
  if (!process.stdin.isTTY)
    throw new AgentFileError("Confirmation needs a terminal; pass --yes to confirm, or --dry-run to preview.");
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (
      await rl.question(`${summary}\nContinue? [${defaultYes ? "Y" : "y"}/N${defaultYes ? "]" : "] "}`)
    ).trim();
    return defaultYes ? !/^n(o)?$/i.test(answer) : /^y(es)?$/i.test(answer);
  } finally {
    rl.close();
  }
}

const initUsage =
  "Usage: evergreen init [agent] [--agents] [--hooks] [--personal] [--hooks-for claude-code|codex] [path] [--file AGENTS.md|CLAUDE.md] [--fail-on <severity>] [--yes] [--dry-run]\n";
const agentUsage = "Usage: evergreen init agent [path] [--file AGENTS.md|CLAUDE.md] [--dry-run]\n";

/** The `init` flags that choose what to set up, and the operands and values they take. */
interface InitOptions {
  readonly agents: boolean;
  readonly hooks: boolean;
  readonly personal: boolean;
  readonly hooksFor: string | undefined;
  readonly guided: boolean;
  readonly dryRun: boolean;
  readonly yes: boolean;
  readonly root: string;
  readonly gate: string | undefined;
  readonly file: string | undefined;
}

/** One agent instruction file and what the run did to it, as both `init agent` and `init --agents` report it. */
interface AgentSectionChange {
  readonly file: string;
  readonly change: "created" | "added" | "updated" | "unchanged";
  readonly diff: string;
}

/** The line `init` prints for one agent-section file, in the tense the run needs. */
function agentSectionReport(change: AgentSectionChange, dryRun: boolean): string {
  if (change.change === "unchanged")
    return `${change.file} already has the current Evergreen section; nothing to change.\n`;
  const verb =
    change.change === "created"
      ? "create"
      : change.change === "added"
        ? "add the Evergreen section to"
        : "update the Evergreen section in";
  if (dryRun) return `Would ${verb} ${change.file}:\n\n${change.diff}\n`;
  const done =
    change.change === "created"
      ? "Created"
      : change.change === "added"
        ? "Added the Evergreen section to"
        : "Updated the Evergreen section in";
  return `${done} ${change.file}.\n`;
}

/** `init agent`: detect the agent host and write the matching config. */
async function runInitAgent(args: readonly string[], ctx: CommandContext): Promise<number> {
  const agentArgs = args.slice(1);
  const dryRun = agentArgs.includes("--dry-run");
  const fileIndex = agentArgs.indexOf("--file");
  const fileValue = fileIndex === -1 ? undefined : agentArgs[fileIndex + 1];
  if (fileIndex !== -1 && fileValue !== "AGENTS.md" && fileValue !== "CLAUDE.md") {
    return ctx.fail("usage", "--file must be AGENTS.md or CLAUDE.md.", agentUsage);
  }
  const flags = new Set(["--dry-run", "--file"]);
  const positional = agentArgs.filter(
    (argument, index) =>
      !flags.has(argument) && (fileIndex === -1 || index !== fileIndex + 1) && !argument.startsWith("-"),
  );
  const unknown = agentArgs.filter((argument) => argument.startsWith("-") && !flags.has(argument));
  if (unknown.length > 0 || positional.length > 1) return ctx.fail("usage", agentUsage.trimEnd());
  try {
    const result = await initAgent({
      root: positional[0] ?? ".",
      dryRun,
      ...(fileValue ? { file: fileValue as AgentFileName } : {}),
    });
    for (const entry of result.entries) process.stdout.write(agentSectionReport(entry, dryRun));
    return 0;
  } catch (error) {
    if (error instanceof AgentFileError) return ctx.failError(error);
    throw error;
  }
}

/** The flags that choose what `init` sets up, and the host named by `--hooks-for`. */
function initFlags(args: readonly string[]) {
  const agents = args.includes("--agents");
  const hooks = args.includes("--hooks");
  const personal = args.includes("--personal");
  const hooksForIndex = args.indexOf("--hooks-for");
  const hooksFor = hooksForIndex === -1 ? undefined : args[hooksForIndex + 1];
  return { agents, hooks, personal, hooksFor, hooksForIndex, guided: !agents && !hooks && !personal && !hooksFor };
}

/** The `--file` and `--fail-on` values and where they sit in `args`. */
function initValueOptions(args: readonly string[]) {
  const fileIndex = args.indexOf("--file");
  const gateIndex = args.indexOf("--fail-on");
  return {
    fileIndex,
    fileValue: fileIndex === -1 ? undefined : args[fileIndex + 1],
    gateIndex,
    gate: gateIndex === -1 ? "high" : args[gateIndex + 1],
  };
}

type InitFlags = ReturnType<typeof initFlags>;
type InitValues = ReturnType<typeof initValueOptions>;

/** Flag combinations that cannot mean one thing, in the order `init` refuses them. */
function initCombinationProblem(flags: InitFlags, ctx: CommandContext): number | undefined {
  if (flags.hooksForIndex !== -1 && flags.hooksFor !== "claude-code" && flags.hooksFor !== "codex")
    return ctx.fail("usage", "--hooks-for needs a host: claude-code or codex.", initUsage);
  if (flags.personal && (flags.agents || flags.hooks || flags.hooksFor))
    return ctx.fail("usage", "--personal cannot be combined with --agents, --hooks, or --hooks-for.", initUsage);
  return undefined;
}

/** A `--file` or `--fail-on` used where `init` does not accept it. */
function initValueProblem(flags: InitFlags, values: InitValues, ctx: CommandContext): number | undefined {
  if (
    values.fileIndex !== -1 &&
    ((!flags.agents && !flags.guided) || (values.fileValue !== "AGENTS.md" && values.fileValue !== "CLAUDE.md"))
  ) {
    return ctx.fail(
      "usage",
      "--file must be AGENTS.md or CLAUDE.md, and needs --agents or the guided init.",
      initUsage,
    );
  }
  if (
    values.gateIndex !== -1 &&
    ((!(flags.hooks || flags.personal) && !flags.guided) || !severityValues.includes(values.gate as Severity))
  ) {
    return ctx.fail(
      "usage",
      `--fail-on needs the guided init, --hooks or --personal, and a severity (${severityValues.join(", ")}).`,
      initUsage,
    );
  }
  return undefined;
}

/** The path operand and the unknown flags, skipping the values `init`'s options take. */
function initWords(args: readonly string[], flags: InitFlags, values: InitValues) {
  const known = new Set([
    "--agents",
    "--hooks",
    "--personal",
    "--hooks-for",
    "--yes",
    "-y",
    "--dry-run",
    "--file",
    "--fail-on",
  ]);
  const positional = args.filter(
    (argument, index) =>
      !known.has(argument) &&
      index !== values.fileIndex + 1 &&
      index !== values.gateIndex + 1 &&
      (flags.hooksForIndex === -1 || index !== flags.hooksForIndex + 1) &&
      !argument.startsWith("-"),
  );
  const unknown = args.filter((argument) => argument.startsWith("-") && !known.has(argument));
  return { positional, unknown };
}

/** Operands and flags as `init` accepts them, or the exit code of the first refusal it hits. */
function parseInitOptions(args: string[], ctx: CommandContext): InitOptions | number {
  const flags = initFlags(args);
  const values = initValueOptions(args);
  const combination = initCombinationProblem(flags, ctx);
  if (combination !== undefined) return combination;
  const value = initValueProblem(flags, values, ctx);
  if (value !== undefined) return value;
  const { positional, unknown } = initWords(args, flags, values);
  if (unknown.length > 0 || positional.length > 1 || (flags.personal && positional.length > 0))
    return ctx.fail("usage", initUsage.trimEnd());
  return {
    agents: flags.agents,
    hooks: flags.hooks,
    personal: flags.personal,
    hooksFor: flags.hooksFor,
    guided: flags.guided,
    dryRun: args.includes("--dry-run"),
    yes: args.includes("--yes") || args.includes("-y"),
    root: positional[0] ?? ".",
    gate: values.gate,
    file: values.fileValue,
  };
}

/** `init --personal`: the global config and pre-push hook for every repository. */
async function runPersonalInit(options: InitOptions): Promise<number> {
  const result = await initPersonal({
    gate: options.gate as Severity,
    dryRun: options.dryRun,
    confirm: options.yes ? async () => true : confirmOnTerminal,
  });
  if (result.change === "unchanged")
    process.stdout.write("The global Evergreen config and pre-push hook are already current; nothing to change.\n");
  else if (result.change === "declined") process.stdout.write("Nothing was changed.\n");
  else if (options.dryRun)
    process.stdout.write(
      `Would write the global config and pre-push hook in ${result.hooksDirectory}:\n\n${result.diff}\n`,
    );
  else
    process.stdout.write(
      `Wrote ${result.configFile} and the pre-push hook in ${result.hooksDirectory}; every repository now blocks a push at ${options.gate} or above.\nBypass it once with \`git push --no-verify\` or \`EVERGREEN_SKIP=1 git push\`.\n`,
    );
  return 0;
}

/** What `init --hooks` did to the pre-push hook, plus the bypass note for a hook it wrote. */
function printHooksResult(result: InitHooksResult, dryRun: boolean, gate: string | undefined): void {
  if (result.change === "managed") {
    process.stdout.write(
      `${result.manager} manages the Git hooks here, so Evergreen did not write one. Add this to ${result.file}:\n\n${result.snippet}\n`,
    );
  } else if (result.change === "unchanged")
    process.stdout.write(`${result.file} already has the current Evergreen hook; nothing to change.\n`);
  else {
    const verb = result.change === "created" ? "create" : "update";
    process.stdout.write(
      dryRun
        ? `Would ${verb} ${result.file}:\n\n${result.diff}\n`
        : `${result.change === "created" ? "Created" : "Updated"} ${result.file}; it blocks a push at ${gate} or above.\n`,
    );
  }
  if (result.change !== "managed")
    process.stdout.write("Bypass it once with `git push --no-verify` or `EVERGREEN_SKIP=1 git push`.\n");
}

/** Runs whichever setup the parsed options ask for and prints what it changed. */
async function applyInit(options: InitOptions, ctx: CommandContext): Promise<number> {
  try {
    if (options.guided)
      return await guidedInit(ctx, {
        root: options.root,
        gate: options.gate as Severity,
        dryRun: options.dryRun,
        ...(options.file !== undefined ? { file: options.file as AgentFileName } : {}),
        yes: options.yes,
      });
    if (options.personal) return await runPersonalInit(options);
    if (options.agents) {
      const result = await initAgents({
        root: options.root,
        dryRun: options.dryRun,
        ...(options.file ? { file: options.file as AgentFileName } : {}),
      });
      process.stdout.write(agentSectionReport(result, options.dryRun));
    }
    if (options.hooks)
      printHooksResult(
        await initHooks({ root: options.root, gate: options.gate as Severity, dryRun: options.dryRun }),
        options.dryRun,
        options.gate,
      );
    if (options.hooksFor === "claude-code" || options.hooksFor === "codex")
      await applyHooksFor(options.hooksFor, options.root, options.dryRun);
    return 0;
  } catch (error) {
    if (error instanceof AgentFileError) return ctx.failError(error);
    throw error;
  }
}

async function runInit(args: string[], ctx: CommandContext): Promise<number> {
  if (args[0] === "agent") return runInitAgent(args, ctx);
  const options = parseInitOptions(args, ctx);
  if (typeof options === "number") return options;
  return applyInit(options, ctx);
}

/** Runs the host's post-edit hook setup and prints its result; one shape for every `--hooks-for` host. */
async function applyHooksFor(hooksFor: string, root: string, dryRun: boolean): Promise<void> {
  const codex = hooksFor === "codex";
  const result = codex ? await initCodexHooks({ root, dryRun }) : await initClaudeHooks({ root, dryRun });
  if (result.change === "unchanged") {
    process.stdout.write(`${result.file} already has the current Evergreen post-edit hook; nothing to change.\n`);
    return;
  }
  const verb = result.change === "created" ? "create" : "update";
  if (dryRun) {
    process.stdout.write(`Would ${verb} ${result.file}:\n\n${result.diff}\n`);
    return;
  }
  const done = codex
    ? "Codex now runs Evergreen after apply_patch."
    : "Claude Code now runs Evergreen after Write, Edit, and MultiEdit.";
  process.stdout.write(`${result.change === "created" ? "Created" : "Updated"} ${result.file}; ${done}\n`);
}

/**
 * `init` with no flags: detects the CI provider and agent hosts, and applies what it finds (the GitHub Actions
 * workflow, the pre-push hook, the Evergreen agent section) after one confirmation that defaults to yes.
 */
async function guidedInit(
  ctx: CommandContext,
  options: { root: string; gate: Severity; dryRun?: boolean; file?: AgentFileName; yes?: boolean },
): Promise<number> {
  if (!options.yes && !options.dryRun && !process.stdin.isTTY) {
    return ctx.fail(
      "usage",
      "Confirmation needed: pass --yes to write these changes, or --dry-run to only print them.",
    );
  }
  const plan = await planInitSetup({
    root: options.root,
    gate: options.gate,
    ...(options.file ? { file: options.file } : {}),
  });
  process.stdout.write(
    `Detected: ${plan.detectedCi.length > 0 ? plan.detectedCi.join(" and ") : "no CI"}; ${plan.detectedAgents.length > 0 ? plan.detectedAgents.join(", ") : "no agent hosts"}\n`,
  );
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
      process.stdout.write(
        `Add this to ${step.file} to scan with the Evergreen GitLab component:\n\n${step.snippet}\n`,
      );
      continue;
    }
    if (step.change === "managed") {
      process.stdout.write(
        `${step.manager} manages the Git hooks here, so Evergreen did not write one. Add this to ${step.file}:\n\n${step.snippet}\n`,
      );
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
    const tail =
      step.kind === "ci"
        ? "; it scans pull requests and pushes to main."
        : step.kind === "hooks"
          ? `; it blocks a push at ${gate} or above.`
          : ".";
    process.stdout.write(`${verb} ${step.file}${tail}\n`);
    if (dryRun && step.diff) process.stdout.write(`\n${step.diff}\n`);
    if (step.kind === "hooks")
      process.stdout.write("Bypass it once with `git push --no-verify` or `EVERGREEN_SKIP=1 git push`.\n");
  }
}

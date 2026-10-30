#!/usr/bin/env node
// Turns an `evergreen plan --json` document into one printed worktree command per task.
//
//   node dist/src/cli.js plan examples/demo --json | node examples/plan-dispatch/dispatch.mjs
//
// It prints only. It never runs git, never starts an agent, and never opens the network.
// A host that wants parallel sessions creates each worktree itself and runs the migrate-finding
// prompt inside that tree with the task's finding id.

import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

/** The MCP prompt a host runs for one task. */
export const MIGRATE_FINDING_PROMPT = "migrate-finding";

/**
 * Directory for a task's worktree: the branch name with `/` turned into `-`, under `.worktrees/`.
 * Printed only; the host creates the directory when it runs the command.
 */
export function worktreePathForBranch(branch) {
  return `.worktrees/${String(branch).replaceAll("/", "-")}`;
}

/** One `git worktree add -b <branch> <path>` line a host can copy. */
export function worktreeAddCommand(branch) {
  return `git worktree add -b ${branch} ${worktreePathForBranch(branch)}`;
}

/**
 * Render every task in wave order. Tasks in the same wave are listed one after another so a host
 * can start them together; waves are separated by a `# Wave N` header.
 */
export function renderDispatch(plan) {
  if (!plan || plan.schema !== "evergreen.plan.v1") {
    throw new Error('Expected an evergreen.plan.v1 document (pipe `evergreen plan --json` into this script).');
  }
  if (!Array.isArray(plan.waves) || !Array.isArray(plan.items)) {
    throw new Error("Plan is missing waves or items.");
  }

  const byId = new Map(plan.items.map((item) => [item.id, item]));
  const waves = [];

  for (const wave of plan.waves) {
    const ids = wave?.itemIds;
    if (!Array.isArray(ids) || ids.length === 0) continue;
    const lines = [`# Wave ${wave.index}`];
    for (const id of ids) {
      const item = byId.get(id);
      if (!item) throw new Error(`Plan wave ${wave.index} references unknown item id: ${id}`);
      if (!item.branch) throw new Error(`Plan item ${id} is missing a branch.`);
      if (lines.length > 1) lines.push("");
      lines.push(worktreeAddCommand(item.branch));
      lines.push(MIGRATE_FINDING_PROMPT);
    }
    waves.push(lines.join("\n"));
  }

  return waves.length === 0 ? "" : `${waves.join("\n\n")}\n`;
}

/** Parse JSON text from `evergreen plan --json` and return the dispatch text. */
export function dispatchFromJson(text) {
  let plan;
  try {
    plan = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON on stdin: ${error instanceof Error ? error.message : String(error)}`);
  }
  return renderDispatch(plan);
}

function readStdin() {
  return readFileSync(0, "utf8");
}

export function main(stdinText = readStdin(), write = (text) => process.stdout.write(text)) {
  write(dispatchFromJson(stdinText));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

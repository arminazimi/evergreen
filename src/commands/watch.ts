import process from "node:process";
import { resolve } from "node:path";

import { builtInDetectors } from "../detectors/index.js";
import { addWatched, listWatched, removeWatched, renderWatchText, runWatch } from "../watch.js";
import { afterGates } from "./runtime.js";
import type { CliCommand, CommandContext } from "./types.js";

const USAGE_TEXT = "Usage: evergreen watch add|remove <path> | list [--json] | [run] [--weekly] [--json]";

/**
 * A failure the watch command reports as a parse error. A programming error (a `TypeError`, or anything that is not an
 * `Error`) is not a user mistake, so it propagates instead of being reported.
 */
export function reportOrRethrow(error: unknown, ctx: CommandContext): number {
  if (error instanceof Error && !(error instanceof TypeError)) return ctx.fail("parse", error.message);
  throw error;
}

/** `add` and `remove`: one path operand, and a line naming what the list now holds. */
async function registerWatched(subcommand: "add" | "remove", operands: string[], ctx: CommandContext): Promise<number> {
  const [path] = operands;
  if (!path || operands.length > 1 || path.startsWith("-")) return ctx.fail("usage", USAGE_TEXT);
  const changed = subcommand === "add" ? await addWatched(path) : await removeWatched(path);
  const words = {
    add: { changed: "Now watching", unchanged: "Already watching" },
    remove: { changed: "Stopped watching", unchanged: "Was not watching" },
  }[subcommand];
  const project = resolve(path);
  process.stdout.write(`${changed ? words.changed : words.unchanged} ${project}\n`);
  return 0;
}

/** `list`: the registered projects, one per line, or the empty-list advice. */
async function listProjects(operands: string[], json: boolean, ctx: CommandContext): Promise<number> {
  if (operands.length > 0) return ctx.fail("usage", USAGE_TEXT);
  const projects = await listWatched();
  const empty = "No projects are watched. Add one with `evergreen watch add <path>`.";
  process.stdout.write(
    json ? `${JSON.stringify({ projects }, null, 2)}\n` : `${projects.length === 0 ? empty : projects.join("\n")}\n`,
  );
  return 0;
}

/** `run`: re-scan the registered projects and print only what changed since the last digest. */
async function runDigest(operands: string[], json: boolean, ctx: CommandContext): Promise<number> {
  if (operands.some((argument) => argument !== "--weekly")) return ctx.fail("usage", USAGE_TEXT);
  const digest = await runWatch(builtInDetectors, { weekly: operands.includes("--weekly") });
  process.stdout.write(`${json ? JSON.stringify(digest, null, 2) : renderWatchText(digest)}\n`);
  return 0;
}

/** One row per `watch` subcommand, including the bare `run` the parser defaults to. */
// A Map, not an object: a plain object answers for inherited names such as `constructor` and `toString`.
const SUBCOMMANDS: ReadonlyMap<string, (operands: string[], json: boolean, ctx: CommandContext) => Promise<number>> =
  new Map([
    ["add", (operands, _json, ctx) => registerWatched("add", operands, ctx)],
    ["remove", (operands, _json, ctx) => registerWatched("remove", operands, ctx)],
    ["list", listProjects],
    ["run", runDigest],
  ]);

/** `watch`: keeps a list of projects and prints only the findings that are new since the last digest. */
export const command: CliCommand = {
  name: "watch",
  flags: ["--weekly", "--json"],
  example: "evergreen watch add ~/code/my-app",
  usage: [
    "  evergreen watch add|remove <path>   # register a project for the digest",
    "  evergreen watch [run] [--weekly] [--json]   # re-scan registered projects, print only what changed",
    "  evergreen watch list [--json]",
  ],
  usageSlots: [46, 47, 48],
  completion: { subcommands: ["add", "remove", "run", "list"], extraWords: ["--weekly", "--json"] },
  run(args, ctx) {
    return afterGates("watch", args, ctx, async (state) => {
      const rest = args.filter(
        (argument, index) => argument !== "--json" && argument !== "--format" && args[index - 1] !== "--format",
      );
      const [subcommand = "run", ...operands] = rest;
      const action = SUBCOMMANDS.get(subcommand);
      if (!action) return ctx.fail("usage", USAGE_TEXT);
      try {
        return await action(operands, state.json, ctx);
      } catch (error) {
        return reportOrRethrow(error, ctx);
      }
    });
  },
};

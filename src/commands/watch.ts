import process from "node:process";
import { resolve } from "node:path";

import { builtInDetectors } from "../detectors/index.js";
import { addWatched, listWatched, removeWatched, renderWatchText, runWatch } from "../watch.js";
import { afterGates } from "./runtime.js";
import type { CliCommand } from "./types.js";

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
      const usageText = "Usage: evergreen watch add|remove <path> | list [--json] | [run] [--weekly] [--json]";
      const rest = args.filter(
        (argument, index) => argument !== "--json" && argument !== "--format" && args[index - 1] !== "--format",
      );
      const [subcommand = "run", ...operands] = rest;
      try {
        if (subcommand === "add" || subcommand === "remove") {
          const [path] = operands;
          if (!path || operands.length > 1 || path.startsWith("-")) return ctx.fail("usage", usageText);
          const changed = subcommand === "add" ? await addWatched(path) : await removeWatched(path);
          const done = subcommand === "add" ? "Now watching" : "Stopped watching";
          const already = subcommand === "add" ? "Already watching" : "Was not watching";
          const project = resolve(path);
          process.stdout.write(`${changed ? done : already} ${project}\n`);
          return 0;
        }
        if (subcommand === "list") {
          if (operands.length > 0) return ctx.fail("usage", usageText);
          const projects = await listWatched();
          process.stdout.write(
            state.json
              ? `${JSON.stringify({ projects }, null, 2)}\n`
              : `${projects.length === 0 ? "No projects are watched. Add one with `evergreen watch add <path>`." : projects.join("\n")}\n`,
          );
          return 0;
        }
        const weekly = operands.includes("--weekly");
        if (subcommand !== "run" || operands.some((argument) => argument !== "--weekly"))
          return ctx.fail("usage", usageText);
        const digest = await runWatch(builtInDetectors, { weekly });
        process.stdout.write(`${state.json ? JSON.stringify(digest, null, 2) : renderWatchText(digest)}\n`);
        return 0;
      } catch (error) {
        if (error instanceof Error && !(error instanceof TypeError)) return ctx.fail("parse", error.message);
        throw error;
      }
    });
  },
};

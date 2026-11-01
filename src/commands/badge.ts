import { spawnSync } from "node:child_process";
import process from "node:process";
import { basename, resolve } from "node:path";

import { badgeSnippet, isBadgeSnippetFormat, renderBadgeEndpoint, repositoryFromRemote } from "../badge.js";
import { builtInDetectors } from "../detectors/index.js";
import { scanRepository } from "../engine.js";
import type { CliCommand } from "./types.js";

/** `badge`: prints README markup for the badge a repository publishes from its badge branch. */
export const command: CliCommand = {
  name: "badge",
  flags: ["--snippet", "--repo", "--branch", "--shields"],
  example: "evergreen badge . --snippet markdown",
  usage: [
    "  evergreen badge [path] --snippet <markdown|html|rst> [--repo <owner/name>] [--branch <name>]   # print README markup for the published badge",
    "  evergreen badge [path] --shields   # print shields.io endpoint JSON for the current scan",
  ],
  usageSlots: [24, 25],
  async run(args, ctx) {
    const usageText =
      "Usage: evergreen badge [path] --snippet <markdown|html|rst> [--repo <owner/name>] [--branch <name>]\n       evergreen badge [path] --shields";
    const operands: string[] = [];
    let snippet: string | undefined;
    let repository: string | undefined;
    let branch = "evergreen-badge";
    let shields = false;
    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index]!;
      if (argument === "--shields") {
        shields = true;
        continue;
      }
      if (argument === "--snippet" || argument === "--repo" || argument === "--branch") {
        const value = args[index + 1];
        if (value === undefined) return ctx.fail("usage", usageText);
        if (argument === "--snippet") snippet = value;
        else if (argument === "--repo") repository = value;
        else branch = value;
        index += 1;
        continue;
      }
      if (argument.startsWith("-")) return ctx.fail("usage", usageText);
      operands.push(argument);
    }
    if (operands.length > 1) return ctx.fail("usage", usageText);
    const path = operands[0] ?? ".";
    if (shields) {
      if (snippet !== undefined || repository !== undefined || branch !== "evergreen-badge") return ctx.fail("usage", usageText);
      const project = resolve(path);
      try {
        process.stdout.write(`${renderBadgeEndpoint(await scanRepository(project, builtInDetectors, {}))}\n`);
        return 0;
      } catch (error) {
        return ctx.fail("parse", (error as Error).message);
      }
    }
    if (!snippet || !isBadgeSnippetFormat(snippet)) return ctx.fail("usage", usageText);
    let owner = repository;
    if (!owner) {
      const remote = spawnSync("git", ["-C", path, "remote", "get-url", "origin"], { encoding: "utf8" });
      owner = remote.status === 0 ? repositoryFromRemote(remote.stdout) : undefined;
    }
    if (!owner) return ctx.fail("usage", `Could not read a GitHub repository from ${path}. Pass --repo <owner/name>.`);
    try {
      process.stdout.write(`${badgeSnippet(owner, snippet, branch)}\n`);
      return 0;
    } catch (error) {
      return ctx.fail("usage", (error as Error).message);
    }
  },
};

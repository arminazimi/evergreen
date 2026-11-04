import { spawnSync } from "node:child_process";
import process from "node:process";
import { resolve } from "node:path";

import { badgeSnippet, isBadgeSnippetFormat, renderBadgeEndpoint, repositoryFromRemote } from "../badge.js";
import { builtInDetectors } from "../detectors/index.js";
import { scanRepository } from "../engine.js";
import type { CliCommand, CommandContext } from "./types.js";

/** Indexed CLI argument; the loop bound already guarantees the index is in range. */
function argumentAt(args: readonly string[], index: number): string {
  const value = args[index];
  if (value === undefined) throw new Error(`missing argument at index ${index}`);
  return value;
}

const badgeUsage =
  "Usage: evergreen badge [path] --snippet <markdown|html|rst> [--repo <owner/name>] [--branch <name>]\n       evergreen badge [path] --shields";

/** The badge branch a repository publishes from unless `--branch` names another. */
const defaultBadgeBranch = "evergreen-badge";

interface BadgeOptions {
  readonly path: string;
  readonly snippet: string | undefined;
  readonly repository: string | undefined;
  readonly branch: string;
  readonly shields: boolean;
}

/** Operands and flags as badge accepts them; returns a usage failure when they do not fit. */
function parseBadgeArgs(args: readonly string[], ctx: CommandContext): BadgeOptions | number {
  const operands: string[] = [];
  let snippet: string | undefined;
  let repository: string | undefined;
  let branch = defaultBadgeBranch;
  let shields = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = argumentAt(args, index);
    if (argument === "--shields") {
      shields = true;
      continue;
    }
    if (argument === "--snippet" || argument === "--repo" || argument === "--branch") {
      const value = args[index + 1];
      if (value === undefined) return ctx.fail("usage", badgeUsage);
      if (argument === "--snippet") snippet = value;
      else if (argument === "--repo") repository = value;
      else branch = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) return ctx.fail("usage", badgeUsage);
    operands.push(argument);
  }
  if (operands.length > 1) return ctx.fail("usage", badgeUsage);
  return { path: operands[0] ?? ".", snippet, repository, branch, shields };
}

/** shields.io endpoint JSON for the scan of `path`. */
async function printBadgeEndpoint(path: string, ctx: CommandContext): Promise<number> {
  const project = resolve(path);
  try {
    process.stdout.write(`${renderBadgeEndpoint(await scanRepository(project, builtInDetectors, {}))}\n`);
    return 0;
  } catch (error) {
    return ctx.fail("parse", (error as Error).message);
  }
}

/** The `owner/name` the badge points at: `--repo` when given, else the repository's git remote. */
function badgeOwner(options: BadgeOptions): string | undefined {
  if (options.repository) return options.repository;
  const remote = spawnSync("git", ["-C", options.path, "remote", "get-url", "origin"], { encoding: "utf8" });
  return remote.status === 0 ? repositoryFromRemote(remote.stdout) : undefined;
}

/** README markup for the badge the repository publishes from its badge branch. */
function printBadgeSnippet(options: BadgeOptions, ctx: CommandContext): number {
  const snippet = options.snippet;
  if (!snippet || !isBadgeSnippetFormat(snippet)) return ctx.fail("usage", badgeUsage);
  const owner = badgeOwner(options);
  if (!owner)
    return ctx.fail("usage", `Could not read a GitHub repository from ${options.path}. Pass --repo <owner/name>.`);
  try {
    process.stdout.write(`${badgeSnippet(owner, snippet, options.branch)}\n`);
    return 0;
  } catch (error) {
    return ctx.fail("usage", (error as Error).message);
  }
}

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
    const options = parseBadgeArgs(args, ctx);
    if (typeof options === "number") return options;
    if (options.shields) {
      if (options.snippet !== undefined || options.repository !== undefined || options.branch !== defaultBadgeBranch) {
        return ctx.fail("usage", badgeUsage);
      }
      return printBadgeEndpoint(options.path, ctx);
    }
    return printBadgeSnippet(options, ctx);
  },
};

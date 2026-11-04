import { spawnSync } from "node:child_process";
import process from "node:process";
import { basename, resolve } from "node:path";

import { applyAsOf } from "../as-of.js";
import { repositoryFromRemote } from "../badge.js";
import { builtInDetectors } from "../detectors/index.js";
import { scanRepository } from "../engine.js";
import { buildGlanceFacts, renderGlance } from "../glance.js";
import { isIsoDate } from "../registry.js";
import type { CliCommand, CommandContext } from "./types.js";

/** Indexed CLI argument; the loop bound already guarantees the index is in range. */
function argumentAt(args: readonly string[], index: number): string {
  const value = args[index];
  if (value === undefined) throw new Error(`missing argument at index ${index}`);
  return value;
}

const glanceUsage = "Usage: evergreen glance [path] [--as-of <YYYY-MM-DD>] [--json]";

/** Operands and `--as-of` as glance accepts them; returns a usage failure when the arguments do not fit. */
function parseGlanceArgs(
  args: readonly string[],
  ctx: CommandContext,
): { readonly operands: string[]; readonly asOf: string | undefined } | number {
  const operands: string[] = [];
  let asOf: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = argumentAt(args, index);
    if (argument === "--as-of") {
      asOf = args[index + 1];
      if (asOf === undefined) return ctx.fail("usage", glanceUsage);
      index += 1;
      continue;
    }
    if (argument === "--json") continue;
    if (argument.startsWith("-")) return ctx.fail("usage", glanceUsage);
    operands.push(argument);
  }
  if (operands.length > 1) return ctx.fail("usage", glanceUsage);
  if (asOf !== undefined && !isIsoDate(asOf))
    return ctx.fail("usage", "--as-of must be a date (YYYY-MM-DD).", `\n${glanceUsage}`);
  return { operands, asOf };
}

/** Scans `project`, builds the facts, and prints the card or the JSON document. */
async function printGlance(project: string, asOf: string | undefined, json: boolean): Promise<void> {
  const scanned = await scanRepository(project, builtInDetectors, {});
  const result = asOf === undefined ? scanned : await applyAsOf(scanned, asOf);
  const remote = spawnSync("git", ["-C", project, "remote", "get-url", "origin"], { encoding: "utf8" });
  const repository = (remote.status === 0 ? repositoryFromRemote(remote.stdout) : undefined) ?? basename(project);
  const facts = buildGlanceFacts(result, { repository, asOf: asOf ?? new Date().toISOString().slice(0, 10) });
  const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  process.stdout.write(
    `${json ? JSON.stringify(facts, null, 2) : renderGlance(facts, { columns: process.stdout.columns, color })}\n`,
  );
}

/** `glance`: a one-screen neofetch-style summary card of the repository's lifecycle state. */
export const command: CliCommand = {
  name: "glance",
  flags: ["--as-of", "--json"],
  example: "evergreen glance . --as-of 2026-11-01",
  usage: [
    "  evergreen glance [path] [--as-of <YYYY-MM-DD>] [--json]   # one-screen summary: the mark beside ecosystems, findings, deadlines, and data age",
  ],
  usageSlots: [18],
  async run(args, ctx) {
    const parsed = parseGlanceArgs(args, ctx);
    if (typeof parsed === "number") return parsed;
    const project = resolve(parsed.operands[0] ?? ".");
    try {
      await printGlance(project, parsed.asOf, args.includes("--json"));
      return 0;
    } catch (error) {
      return ctx.fail("parse", (error as Error).message);
    }
  },
};

import process from "node:process";
import { basename, resolve } from "node:path";

import { DiffError } from "../diff.js";
import { builtInDetectors } from "../detectors/index.js";
import { buildWrapped, parseWrappedYear, playWrapped, renderWrappedText, writeWrappedSvg } from "../wrapped.js";
import type { CliCommand, CommandContext } from "./types.js";

const usageText = "Usage: evergreen wrapped [path] [--year <YYYY>] [--svg <file>] [--json]";

/** Indexed CLI argument; the loop bound already guarantees the index is in range. */
function argumentAt(args: readonly string[], index: number): string {
  const value = args[index];
  if (value === undefined) throw new Error(`missing argument at index ${index}`);
  return value;
}

interface ParsedWrapped {
  readonly operands: string[];
  readonly year: string | undefined;
  readonly svg: string | undefined;
  readonly json: boolean;
}

/** Operands and flags as wrapped accepts them; returns a usage failure when the arguments do not fit. */
function parseWrappedArgs(args: readonly string[], ctx: CommandContext): ParsedWrapped | number {
  const operands: string[] = [];
  let year: string | undefined;
  let svg: string | undefined;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = argumentAt(args, index);
    if (argument === "--year") {
      year = args[index + 1];
      if (year === undefined || year.startsWith("-")) return ctx.fail("usage", usageText);
      index += 1;
      continue;
    }
    if (argument === "--svg") {
      svg = args[index + 1];
      if (svg === undefined || svg.startsWith("-")) return ctx.fail("usage", usageText);
      index += 1;
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--no-animation") continue;
    if (argument.startsWith("-")) return ctx.fail("usage", usageText);
    operands.push(argument);
  }
  if (operands.length > 1) return ctx.fail("usage", usageText);
  if (json && svg !== undefined) return ctx.fail("usage", "--json cannot be combined with --svg.", `\n${usageText}`);
  return { operands, year, svg, json };
}

/** `wrapped`: a year-in-review of findings fixed and introduced, as terminal cards or a shareable SVG. */
export const command: CliCommand = {
  name: "wrapped",
  flags: ["--year", "--svg", "--json", "--no-animation"],
  example: "evergreen wrapped . --year 2025",
  usage: [
    "  evergreen wrapped [path] [--year <YYYY>] [--svg <file>] [--json]   # year-in-review cards: fixed, introduced, net, oldest ended, top owners, next deadline",
  ],
  async run(args, ctx) {
    const parsed = parseWrappedArgs(args, ctx);
    if (typeof parsed === "number") return parsed;
    const project = resolve(parsed.operands[0] ?? ".");
    try {
      const year = parseWrappedYear(parsed.year, Number(new Date().toISOString().slice(0, 4)));
      const result = await buildWrapped(project, builtInDetectors, { year });
      if (parsed.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return 0;
      }
      if (parsed.svg !== undefined) {
        await writeWrappedSvg(result, resolve(parsed.svg), basename(project));
        return 0;
      }
      if (args.includes("--no-animation") || !process.stdout.isTTY) {
        process.stdout.write(`${renderWrappedText(result)}\n`);
        return 0;
      }
      await playWrapped(result);
      return 0;
    } catch (error) {
      // Shared git/archive helpers throw DiffError; WrappedError extends it for year parsing.
      if (error instanceof DiffError) return ctx.failError(error);
      throw error;
    }
  },
};

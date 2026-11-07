import process from "node:process";
import { basename, resolve } from "node:path";

import { builtInDetectors } from "../detectors/index.js";
import { scanRepository } from "../engine/index.js";
import {
  buildTimelapse,
  parseTimelapseRange,
  playTimelapse,
  renderTimelapseJson,
  renderTimelapseText,
  TimelapseError,
  writeTimelapseSvg,
} from "../timelapse.js";
import type { CliCommand, CommandContext } from "./types.js";

const usageText = "Usage: evergreen timelapse [path] [--from <YYYY-MM>] [--to <YYYY-MM>] [--svg <file>] [--json]";

/** Indexed CLI argument; the loop bound already guarantees the index is in range. */
function argumentAt(args: readonly string[], index: number): string {
  const value = args[index];
  if (value === undefined) throw new Error(`missing argument at index ${index}`);
  return value;
}

interface ParsedTimelapse {
  readonly operands: string[];
  readonly from: string | undefined;
  readonly to: string | undefined;
  readonly svg: string | undefined;
  readonly json: boolean;
  readonly noAnimation: boolean;
}

/** Read `--flag <value>`; returns undefined when the value is missing or looks like another flag. */
function takeValue(args: readonly string[], index: number): string | undefined {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("-")) return undefined;
  return value;
}

/** Operands and flags as timelapse accepts them; returns a usage failure when the arguments do not fit. */
function parseTimelapseArgs(args: readonly string[], ctx: CommandContext): ParsedTimelapse | number {
  const operands: string[] = [];
  let from: string | undefined;
  let to: string | undefined;
  let svg: string | undefined;
  let json = false;
  let noAnimation = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = argumentAt(args, index);
    if (argument === "--from" || argument === "--to" || argument === "--svg") {
      const value = takeValue(args, index);
      if (value === undefined) return ctx.fail("usage", usageText);
      if (argument === "--from") from = value;
      else if (argument === "--to") to = value;
      else svg = value;
      index += 1;
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--no-animation") {
      noAnimation = true;
      continue;
    }
    if (argument.startsWith("-")) return ctx.fail("usage", usageText);
    operands.push(argument);
  }
  if (operands.length > 1) return ctx.fail("usage", usageText);
  if (json && svg !== undefined) return ctx.fail("usage", "--json cannot be combined with --svg.", `\n${usageText}`);
  return { operands, from, to, svg, json, noAnimation };
}

/** `timelapse`: month-by-month aging of findings as terminal frames, SVG, or JSON. */
export const command: CliCommand = {
  name: "timelapse",
  flags: ["--from", "--to", "--svg", "--json", "--no-animation"],
  example: "evergreen timelapse . --from 2026-11 --to 2028-10",
  usage: [
    "  evergreen timelapse [path] [--from <YYYY-MM>] [--to <YYYY-MM>] [--svg <file>] [--json]   # month-by-month aging: files turn red as deadlines pass",
  ],
  async run(args, ctx) {
    const parsed = parseTimelapseArgs(args, ctx);
    if (typeof parsed === "number") return parsed;
    const project = resolve(parsed.operands[0] ?? ".");
    try {
      const range = parseTimelapseRange(parsed.from, parsed.to);
      const scanned = await scanRepository(project, builtInDetectors);
      const frames = await buildTimelapse(scanned, range.from, range.to);
      if (parsed.json) {
        process.stdout.write(renderTimelapseJson(frames));
        return 0;
      }
      if (parsed.svg !== undefined) {
        await writeTimelapseSvg(frames, resolve(parsed.svg), basename(project));
        return 0;
      }
      if (parsed.noAnimation || !process.stdout.isTTY) {
        process.stdout.write(`${renderTimelapseText(frames)}\n`);
        return 0;
      }
      return await playTimelapse(frames);
    } catch (error) {
      if (error instanceof TimelapseError) return ctx.fail("usage", error.message, `\n${usageText}`);
      throw error;
    }
  },
};

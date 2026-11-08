import process from "node:process";

import { DEFAULT_MINIMUM_SUPPORT_DAYS, recommendVersion, renderRecommendText } from "../recommend.js";
import type { CliCommand } from "./types.js";

const USAGE = "Usage: evergreen recommend <product|purl> [--min-days <n>] [--as-of <YYYY-MM-DD>] [--json]";

/** Reads `--flag value` out of the arguments, returning the value and the remaining arguments. */
function takeOption(args: readonly string[], flag: string): { value?: string; rest: string[]; missing: boolean } {
  const index = args.indexOf(flag);
  if (index === -1) return { rest: [...args], missing: false };
  const value = args[index + 1];
  const rest = args.filter((_, position) => position !== index && position !== index + 1);
  return value === undefined || value.startsWith("-") ? { rest, missing: true } : { value, rest, missing: false };
}

/** `recommend`: which release line of a product to write today, from the bundled lifecycle data only. */
export const command: CliCommand = {
  name: "recommend",
  flags: ["--min-days", "--as-of", "--json"],
  example: "evergreen recommend node",
  usage: [
    `  evergreen recommend <product|purl> [--min-days <n>] [--as-of <date>] [--json]   # which release line to write today (default ${DEFAULT_MINIMUM_SUPPORT_DAYS} days of support)`,
  ],
  async run(args, ctx) {
    const days = takeOption(args, "--min-days");
    const asOf = takeOption(days.rest, "--as-of");
    const operands = asOf.rest.filter((argument) => argument !== "--json");
    if (days.missing || asOf.missing || operands.length !== 1 || operands.some((argument) => argument.startsWith("-")))
      return ctx.fail("usage", USAGE);
    const [name] = operands;
    if (name === undefined) return ctx.fail("usage", USAGE);
    if (days.value !== undefined && !/^\d+$/.test(days.value))
      return ctx.fail("usage", "--min-days must be a non-negative whole number.", "", "invalid-argument");
    try {
      const result = await recommendVersion({
        name,
        ...(days.value === undefined ? {} : { minimumSupportDays: Number(days.value) }),
        ...(asOf.value === undefined ? {} : { asOf: asOf.value }),
      });
      process.stdout.write(`${ctx.jsonErrors ? JSON.stringify(result, null, 2) : renderRecommendText(result)}\n`);
      return 0;
    } catch (error) {
      return ctx.failError(error);
    }
  },
};

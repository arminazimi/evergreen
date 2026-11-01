import process from "node:process";

import { renderUsageText, summarizeUsage, usageLogPath } from "../usage-log.js";
import type { CliCommand } from "./types.js";

/** `usage`: summarizes the local check log, which exists only when `EVERGREEN_USAGE_LOG` turned it on. */
export const command: CliCommand = {
  name: "usage",
  flags: ["--file", "--json"],
  example: "evergreen usage --json",
  usage: ["  evergreen usage [--file <path>] [--json]"],
  usageSlots: [40],
  async run(args, ctx) {
    const usageText = "Usage: evergreen usage [--file <path>] [--json]";
    const fileIndex = args.indexOf("--file");
    const fileValue = fileIndex === -1 ? undefined : args[fileIndex + 1];
    const rest = fileIndex === -1 ? args : args.filter((argument, index) => index !== fileIndex && index !== fileIndex + 1);
    if ((fileIndex !== -1 && (!fileValue || fileValue.startsWith("-"))) || rest.some((argument) => argument !== "--json")) return ctx.fail("usage", usageText);
    const file = fileValue ?? usageLogPath();
    if (!file) {
      process.stdout.write("Usage logging is off. Set EVERGREEN_USAGE_LOG=1 (or a file path) to record dependency checks locally, then run `evergreen usage`. Nothing leaves this machine.\n");
      return 0;
    }
    const summary = await summarizeUsage(file);
    process.stdout.write(`${args.includes("--json") ? JSON.stringify(summary, null, 2) : renderUsageText(summary)}\n`);
    return 0;
  },
};

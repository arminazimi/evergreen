import process from "node:process";

import { lookupProduct, renderLookupText } from "@velella/ebb/lookup";
import type { CliCommand } from "./types.js";

/** `lookup`: resolves a product name and version against the bundled lifecycle rules. */
export const command: CliCommand = {
  name: "lookup",
  flags: ["--json"],
  example: "evergreen lookup node 18",
  usage: [
    "  evergreen lookup <product> [version] [--json]   # support status, end-of-life date, and evidence for a product",
  ],
  usageSlots: [19],
  async run(args, ctx) {
    const usageText = "Usage: evergreen lookup <product> [version] [--json]";
    const operands = args.filter((argument) => argument !== "--json");
    if (operands.length === 0 || operands.length > 3 || operands.some((argument) => argument.startsWith("-")))
      return ctx.fail("usage", usageText);
    const last = operands[operands.length - 1];
    if (last === undefined) return ctx.fail("usage", usageText);
    const dated = operands.length > 1 && /^v?\d/.test(last);
    const version = dated ? last.replace(/^v/i, "") : undefined;
    const name = (dated ? operands.slice(0, -1) : operands).join(" ");
    try {
      const result = await lookupProduct(name, version);
      process.stdout.write(`${ctx.jsonErrors ? JSON.stringify(result, null, 2) : renderLookupText(result)}\n`);
      return 0;
    } catch (error) {
      return ctx.fail("usage", (error as Error).message);
    }
  },
};

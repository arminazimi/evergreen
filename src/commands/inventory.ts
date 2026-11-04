import { InventoryUsageError, inventoryCommand } from "../inventory/command.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "inventory",
  flags: ["--format", "--json", "--fail-on", "--redact"],
  example: "evergreen inventory lambda.json",
  usage: [
    "  evergreen inventory <file>... [--format auto|<importer-id>] [--json] [--fail-on <severity|none>] [--redact]   # lifecycle of what a cloud or cluster export names; reads files only",
  ],
  usageSlots: [20],
  async run(args, ctx) {
    try {
      return await inventoryCommand(args);
    } catch (error) {
      if (error instanceof InventoryUsageError) return ctx.fail("usage", error.message);
      throw error;
    }
  },
};

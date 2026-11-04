import process from "node:process";

import { guardCommand, GuardUsageError } from "../guard.js";
import { afterGates } from "./runtime.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "guard",
  flags: ["--fail-on", "--force", "--data-version"],
  example: "evergreen guard npm install request",
  usage: [
    "  evergreen guard [--fail-on <severity|none>] [--force] npm install <package>...   # check first; flags after npm go to npm",
  ],
  usageSlots: [39],
  run(args, ctx) {
    return afterGates("guard", args, ctx, async () => {
      try {
        const result = await guardCommand(args, { report: (output) => process.stderr.write(`${output}\n`) });
        return result.exitCode;
      } catch (error) {
        if (error instanceof GuardUsageError) return ctx.fail("usage", error.message);
        throw error;
      }
    });
  },
};

import process from "node:process";
import { resolve } from "node:path";

import { builtInDetectors } from "../detectors/index.js";
import { DiffError, diffRefs, renderDiffText } from "../diff.js";
import { afterGates } from "./runtime.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "diff",
  flags: ["--json", "--data-version"],
  example: "evergreen diff main..HEAD",
  usage: [
    "  evergreen diff <base>..<head> [path] [--json]   # findings a change introduced or fixed; exit 1 only when it introduced some",
  ],
  usageSlots: [26],
  run(args, ctx) {
    return afterGates("diff", args, ctx, async (state) => {
      const range = state.positional[0];
      if (!range) return ctx.fail("usage", "Missing range. Use evergreen diff <base>..<head>.", `\n${ctx.help}`);
      try {
        const result = await diffRefs(resolve(state.positional[1] ?? "."), range, builtInDetectors);
        process.stdout.write(`${state.json ? JSON.stringify(result, null, 2) : renderDiffText(result)}\n`);
        return result.introduced.length > 0 ? ctx.exitCodes.policy : 0;
      } catch (error) {
        if (error instanceof DiffError) return ctx.failError(error);
        throw error;
      }
    });
  },
};

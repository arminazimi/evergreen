import process from "node:process";
import { resolve } from "node:path";

import { RollupError, renderRollupHtml, renderRollupText, rollupFiles } from "../rollup.js";
import { afterGates } from "./runtime.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "rollup",
  flags: ["--owners", "--json", "--html", "--format"],
  example: "evergreen rollup reports/*.json --owners owners.json --html",
  usage: [
    "  evergreen rollup <report.json>... [--owners <file>] [--json | --html]   # merge saved scan reports by product and owner; reads files only",
  ],
  usageSlots: [31],
  run(args, ctx) {
    return afterGates("rollup", args, ctx, async (state) => {
      const ownersIndex = state.args.indexOf("--owners");
      const ownersFile = ownersIndex === -1 ? undefined : state.args[ownersIndex + 1];
      if (ownersIndex !== -1 && (!ownersFile || ownersFile.startsWith("-")))
        return ctx.fail("usage", "--owners needs a file.");
      const html = state.args.includes("--html") || state.format === "html";
      try {
        const result = await rollupFiles(
          state.positional.map((path) => resolve(path)),
          ownersFile && resolve(ownersFile),
        );
        process.stdout.write(
          `${state.json ? JSON.stringify(result, null, 2) : html ? renderRollupHtml(result) : renderRollupText(result)}\n`,
        );
        return 0;
      } catch (error) {
        if (error instanceof RollupError) return ctx.failError(error);
        throw error;
      }
    });
  },
};

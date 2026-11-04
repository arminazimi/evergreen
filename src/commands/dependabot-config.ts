import process from "node:process";
import { resolve } from "node:path";

import { bundledRules } from "../check-dependency.js";
import { buildDependabotConfig } from "../dependabot-config.js";
import { builtInDetectors } from "../detectors/index.js";
import { scanRepository } from "../engine.js";
import { afterGates } from "./runtime.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "dependabot-config",
  flags: ["--data-version"],
  example: "evergreen dependabot-config .",
  usage: [
    "  evergreen dependabot-config [path]   # print a dependabot.yml that groups updates for deprecated packages; does not write files",
  ],
  usageSlots: [33],
  run(args, ctx) {
    return afterGates("dependabot-config", args, ctx, async (state) => {
      if (state.positional.length > 1) return ctx.fail("usage", "Usage: evergreen dependabot-config [path]");
      const result = await scanRepository(resolve(state.pathArgument), builtInDetectors, { noCache: state.noCache });
      process.stdout.write(buildDependabotConfig(result, await bundledRules()));
      return 0;
    });
  },
};

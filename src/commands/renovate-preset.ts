import process from "node:process";
import { resolve } from "node:path";

import { builtInDetectors } from "../detectors/index.js";
import { bundledRules } from "@velella/ebb/bundled-rules";
import { buildRenovatePreset } from "../renovate-preset.js";
import { scanRepository } from "../engine/index.js";
import { afterGates } from "./runtime.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "renovate-preset",
  flags: ["--data-version"],
  example: "evergreen renovate-preset .",
  usage: [
    "  evergreen renovate-preset [path]   # print Renovate packageRules for replacements and runtime pins; does not edit config",
  ],
  usageSlots: [32],
  run(args, ctx) {
    return afterGates("renovate-preset", args, ctx, async (state) => {
      if (state.positional.length > 1) return ctx.fail("usage", "Usage: evergreen renovate-preset [path]");
      const result = await scanRepository(resolve(state.pathArgument), builtInDetectors, { noCache: state.noCache });
      const preset = buildRenovatePreset(result.findings, await bundledRules());
      process.stdout.write(`${JSON.stringify(preset, null, 2)}\n`);
      return 0;
    });
  },
};

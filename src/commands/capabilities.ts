import { getCapabilityManifest, renderCapabilitiesText } from "../capabilities.js";
import { afterGates } from "./runtime.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "capabilities",
  flags: ["--json"],
  example: "evergreen capabilities --json",
  usage: ["  evergreen capabilities [--json]"],
  usageSlots: [64],
  run(args, ctx) {
    return afterGates("capabilities", args, ctx, async (state) => {
      const manifest = getCapabilityManifest();
      process.stdout.write(`${state.json ? JSON.stringify(manifest, null, 2) : renderCapabilitiesText(manifest)}\n`);
      return 0;
    });
  },
};

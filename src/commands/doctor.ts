import process from "node:process";

import { diagnoseEnvironment, renderDoctorText } from "../doctor.js";
import { afterGates } from "./runtime.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "doctor",
  flags: ["--system", "--json", "--data-version"],
  example: "evergreen doctor --system",
  usage: ["  evergreen doctor [path] [--system] [--json]"],
  usageSlots: [62],
  run(args, ctx) {
    return afterGates("doctor", args, ctx, async (state) => {
      const result = await diagnoseEnvironment(state.pathArgument, { system: state.args.includes("--system") });
      process.stdout.write(`${state.json ? JSON.stringify(result, null, 2) : renderDoctorText(result)}\n`);
      return result.summary.failed > 0 ? ctx.exitCodes.policy : 0;
    });
  },
};

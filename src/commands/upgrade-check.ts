import { upgradeCheck } from "../upgrade/command.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "upgrade-check",
  flags: ["--to", "--json"],
  example: "evergreen upgrade-check --to nodejs@22",
  usage: [
    "  evergreen upgrade-check --to <runtime@version> [path] [--json]   # dependencies whose declared support excludes the target runtime",
  ],
  usageSlots: [23],
  run(args) {
    return upgradeCheck(args);
  },
};

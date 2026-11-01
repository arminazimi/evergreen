import { runScanPipeline } from "./runtime.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "report-issue",
  flags: ["--output", "--data-version"],
  example: "evergreen report-issue <finding-id> . --output issue.md",
  usage: ["  evergreen report-issue <finding-id> [path] [--output <file>]"],
  usageSlots: [63],
  run(args, ctx) {
    return runScanPipeline("report-issue", args, ctx);
  },
};

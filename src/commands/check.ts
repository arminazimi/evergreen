import process from "node:process";

import { checkDependency, CheckDependencyError } from "../check-dependency.js";
import type { Severity } from "../domain.js";
import { severityValues } from "../domain.js";
import { renderCheckText } from "../reporters.js";
import { afterGates } from "./runtime.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "check",
  flags: ["--fail-on", "--json", "--format", "--data-version"],
  example: "evergreen check pkg:npm/request@2.88.2",
  usage: ["  evergreen check <purl> [--fail-on <severity|none>] [--json]"],
  usageSlots: [37],
  run(args, ctx) {
    return afterGates("check", args, ctx, async (state) => {
      const purl = state.positional[0];
      if (!purl) return ctx.fail("usage", "Missing package URL, for example pkg:npm/request@2.88.2.", `\n${ctx.help}`);
      const gate = state.optionValue("--fail-on") ?? state.config?.failOn ?? "high";
      if (gate !== "none" && !severityValues.includes(gate as Severity)) {
        return ctx.fail("usage", `Unknown severity for --fail-on: ${gate} (expected none, ${severityValues.join(", ")}).`);
      }
      try {
        const check = await checkDependency(purl);
        process.stdout.write(`${state.json ? JSON.stringify(check, null, 2) : renderCheckText(check)}\n`);
        const rank = (severity: Severity) => severityValues.indexOf(severity);
        return check.status === "affected" && gate !== "none" && rank(check.severity!) >= rank(gate as Severity) ? ctx.exitCodes.policy : 0;
      } catch (error) {
        if (error instanceof CheckDependencyError) return ctx.fail("parse", error.message);
        throw error;
      }
    });
  },
};

import process from "node:process";

import { defaultRuleFiles, lintRuleFiles, renderRuleLintText } from "../rule-lint.js";
import { renderRuleTestText, RuleTestError, testRule } from "../rule-test.js";
import type { CliCommand } from "./types.js";

/** `rules lint` checks registry files; `rules test` runs one rule against its match and clean fixtures. */
export const command: CliCommand = {
  name: "rules",
  flags: [],
  example: "evergreen rules lint",
  usage: [
    "  evergreen rules lint [file...]   # check lifecycle rules for problems before CI does; exits 1 on any problem",
    "  evergreen rules test <id>   # run a rule against tests/fixtures/<id>/match and clean; exits 1 on a failed fixture",
  ],
  usageSlots: [57, 58],
  async run(args, ctx) {
    const [subcommand, ...rest] = args;
    if (subcommand === "lint") {
      if (rest.some((argument) => argument.startsWith("-")))
        return ctx.fail("usage", "Usage: evergreen rules lint [file...]");
      let files: string[];
      try {
        files = rest.length > 0 ? rest : await defaultRuleFiles();
      } catch (error) {
        return ctx.fail(
          "usage",
          `No registry directory here (${(error as Error).message}). Run evergreen rules lint from the repository root, or pass rule files.`,
        );
      }
      const result = await lintRuleFiles(files);
      process.stdout.write(`${renderRuleLintText(result)}\n`);
      return result.issues.length === 0 ? 0 : ctx.exitCodes.policy;
    }
    if (subcommand === "test") {
      const ruleId = rest[0];
      if (rest.length !== 1 || ruleId === undefined || ruleId.startsWith("-"))
        return ctx.fail("usage", "Usage: evergreen rules test <rule-id>");
      try {
        const result = await testRule(ruleId);
        process.stdout.write(`${renderRuleTestText(result)}\n`);
        return result.passed ? 0 : ctx.exitCodes.policy;
      } catch (error) {
        if (error instanceof RuleTestError) return ctx.fail("usage", error.message);
        throw error;
      }
    }
    return ctx.fail("usage", "Usage: evergreen rules <lint|test> ...");
  },
};

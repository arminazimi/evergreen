import type { CliCommand } from "./types.js";

/** Creates the match and clean fixtures of a rule that @velella/ebb defines. The generator lives in tools/. */
export const command: CliCommand = {
  name: "new-rule",
  flags: ["--ecosystem"],
  example: "evergreen new-rule npm.package.sample.deprecated",
  usage: ["  evergreen new-rule <id> [--ecosystem <slug>]   # create match/clean fixtures for a rule Ebb defines"],
  usageSlots: [56],
  async run(args, ctx) {
    const usage = "Usage: evergreen new-rule <id> [--ecosystem <slug>]";
    let id: string | undefined;
    let ecosystem: string | undefined;
    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index];
      if (argument === undefined) continue;
      if (argument === "--ecosystem") {
        const value = args[index + 1];
        if (!value || value.startsWith("-")) return ctx.fail("usage", usage);
        ecosystem = value;
        index += 1;
      } else if (argument.startsWith("-") || id !== undefined) {
        return ctx.fail("usage", usage);
      } else {
        id = argument;
      }
    }
    if (id === undefined) return ctx.fail("usage", usage);
    let scaffold: typeof import("../../tools/scaffold/index.js");
    try {
      scaffold = await import("../../tools/scaffold/index.js");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
        return ctx.fail(
          "usage",
          "new-rule is for contributors: run it from a checkout of the Evergreen repository after npm run build.",
          "",
          "scaffold-failed",
        );
      }
      throw error;
    }
    try {
      process.stdout.write(
        `${scaffold.renderRuleScaffoldResult(await scaffold.scaffoldRule(id, ecosystem ? { ecosystem } : {}))}\n`,
      );
      return 0;
    } catch (error) {
      if (error instanceof scaffold.ScaffoldError) return ctx.failError(error);
      throw error;
    }
  },
};

import type { CliCommand } from "./types.js";

/** Creates a detector skeleton. The generator lives in the repository's tools, so this works in a checkout only. */
export const command: CliCommand = {
  name: "new-detector",
  flags: ["--ecosystem"],
  example: "evergreen new-detector my-lang --ecosystem my-lang",
  usage: ["  evergreen new-detector <id> [--ecosystem <slug>]"],
  usageSlots: [55],
  async run(args, ctx) {
    const ecosystemIndex = args.indexOf("--ecosystem");
    const ecosystem = ecosystemIndex === -1 ? undefined : args[ecosystemIndex + 1];
    const ecosystemValueIndex = ecosystemIndex === -1 ? -1 : ecosystemIndex + 1;
    const id = args.find((argument, index) => !argument.startsWith("-") && index !== ecosystemValueIndex);
    if (!id || (ecosystemIndex !== -1 && (!ecosystem || ecosystem.startsWith("-")))) {
      return ctx.fail("usage", "Usage: evergreen new-detector <id> [--ecosystem <slug>]");
    }
    let scaffold: typeof import("../../tools/scaffold/index.js");
    try {
      scaffold = await import("../../tools/scaffold/index.js");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
        return ctx.fail(
          "usage",
          "new-detector is for contributors: run it from a checkout of the Evergreen repository after npm run build.",
          "",
          "scaffold-failed",
        );
      }
      throw error;
    }
    try {
      process.stdout.write(
        `${scaffold.renderScaffoldResult(await scaffold.scaffoldDetector(id, ecosystem ? { ecosystem } : {}))}\n`,
      );
      return 0;
    } catch (error) {
      if (error instanceof scaffold.ScaffoldError) return ctx.failError(error);
      throw error;
    }
  },
};

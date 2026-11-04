import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "completions",
  flags: [],
  example: "evergreen completions zsh > ~/.zfunc/_evergreen",
  usage: ["  evergreen completions <bash|zsh|fish>   # print a shell completion script"],
  usageSlots: [65],
  completion: { subcommands: ["bash", "zsh", "fish"] },
  async run(args, ctx) {
    const { isCompletionShell, renderCompletions } = await import("../completions.js");
    if (args.length !== 1 || !isCompletionShell(args[0]))
      return ctx.fail("usage", "Usage: evergreen completions <bash|zsh|fish>");
    process.stdout.write(renderCompletions(args[0]));
    return 0;
  },
};

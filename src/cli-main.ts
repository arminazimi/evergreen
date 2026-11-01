import process from "node:process";

import { commands } from "./commands/index.generated.js";
import { bindContext, createCommandContext, fail } from "./commands/runtime.js";
import { renderHelp } from "./completions.js";
import { unexpectedFailure } from "./errors.js";
import { VERSION } from "./version.js";

export { EXIT_CODES } from "./commands/types.js";

const HELP = renderHelp(commands);

async function main(rawArgs: string[]): Promise<number> {
  const ctx = createCommandContext(rawArgs, HELP);
  bindContext(ctx);
  const args = rawArgs.filter((argument) => argument !== "--debug");
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  const name = args[0];
  const command = commands.find((candidate) => candidate.name === name);
  if (!command) return ctx.fail("usage", `Unknown command: ${name ?? ""}`, `\n${HELP}`);
  return command.run(args.slice(1), ctx);
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  const { message, appendix } = unexpectedFailure(error, process.argv.includes("--debug"));
  process.exitCode = fail("internal", message, appendix);
}

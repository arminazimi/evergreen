import process from "node:process";

import { commands } from "./commands/index.generated.js";
import { bindContext, createCommandContext, fail } from "./commands/runtime.js";
import { renderHelp } from "./completions.js";
import { unexpectedFailure } from "./errors.js";
import { VERSION } from "./version.js";

const HELP = renderHelp(commands);

/** Dispatches one CLI invocation and returns its exit code. Exported so tests can drive the shipping commands in process. */
export async function main(rawArgs: readonly string[]): Promise<number> {
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

/**
 * The process entry: runs one command and renders an unexpected failure the same way for every caller.
 * Returns the exit code, which the executable assigns to `process.exitCode`.
 */
export async function run(rawArgs: readonly string[] = process.argv.slice(2)): Promise<number> {
  try {
    return await main(rawArgs);
  } catch (error) {
    const { message, appendix } = unexpectedFailure(error, rawArgs.includes("--debug"));
    return fail("internal", message, appendix);
  }
}

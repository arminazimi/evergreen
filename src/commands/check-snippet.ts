import process from "node:process";

import { checkSnippet, SnippetInputError } from "../check-snippet.js";
import { renderFindingText } from "../reporters.js";
import { afterGates } from "./runtime.js";
import type { CliCommand, CommandContext } from "./types.js";

const SNIPPET_USAGE = "Usage: evergreen check-snippet --path <path> [--json]   # the snippet content arrives on stdin";

/** The snippet path from the arguments, or the exit code of the usage failure. */
export function snippetPathFrom(args: readonly string[], ctx: CommandContext): string | number {
  let snippetPath: string | undefined;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) continue;
    if (argument === "--path") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-"))
        return ctx.fail(
          "usage",
          "--path needs the intended repository-relative path of the snippet.",
          `\n${SNIPPET_USAGE}`,
        );
      snippetPath = value;
      index += 1;
    } else if (argument !== "--json") {
      return ctx.fail("usage", SNIPPET_USAGE);
    }
  }
  if (!snippetPath)
    return ctx.fail(
      "usage",
      "Missing --path, the intended repository-relative path of the snippet.",
      `\n${SNIPPET_USAGE}`,
    );
  return snippetPath;
}

export function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise<string>((resolveSnippet, rejectSnippet) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolveSnippet(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", rejectSnippet);
  });
}

export const command: CliCommand = {
  name: "check-snippet",
  flags: ["--path", "--json"],
  example: "evergreen check-snippet --path Dockerfile < Dockerfile.new",
  usage: [
    "  evergreen check-snippet --path <path> [--json]   # check one snippet from stdin before writing it; reads no repository",
  ],
  usageSlots: [38],
  run(args, ctx) {
    return afterGates("check-snippet", args, ctx, async (state) => {
      const snippetPath = snippetPathFrom(state.args, ctx);
      if (typeof snippetPath === "number") return snippetPath;
      if (process.stdin.isTTY)
        return ctx.fail(
          "usage",
          "check-snippet reads the snippet content from stdin. Pipe it, for example: cat Dockerfile | evergreen check-snippet --path Dockerfile.",
        );
      try {
        const check = await checkSnippet({ path: snippetPath, content: await readStream(process.stdin) });
        const text = state.json
          ? JSON.stringify(check, null, 2)
          : [check.message, ...check.findings.map(renderFindingText)].join("\n\n");
        process.stdout.write(`${text}\n`);
        return 0;
      } catch (error) {
        if (error instanceof SnippetInputError) return ctx.failError(error);
        throw error;
      }
    });
  },
};

import process from "node:process";

import { checkSnippet, SnippetInputError } from "../check-snippet.js";
import { renderFindingText } from "../reporters.js";
import { afterGates } from "./runtime.js";
import type { CliCommand } from "./types.js";

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
      const snippetUsage =
        "Usage: evergreen check-snippet --path <path> [--json]   # the snippet content arrives on stdin";
      let snippetPath: string | undefined;
      for (let index = 1; index < state.args.length; index += 1) {
        const argument = state.args[index];
        if (argument === undefined) continue;
        if (argument === "--path") {
          const value = state.args[index + 1];
          if (value === undefined || value.startsWith("-"))
            return ctx.fail(
              "usage",
              "--path needs the intended repository-relative path of the snippet.",
              `\n${snippetUsage}`,
            );
          snippetPath = value;
          index += 1;
        } else if (argument !== "--json") {
          return ctx.fail("usage", snippetUsage);
        }
      }
      if (!snippetPath)
        return ctx.fail(
          "usage",
          "Missing --path, the intended repository-relative path of the snippet.",
          `\n${snippetUsage}`,
        );
      if (process.stdin.isTTY)
        return ctx.fail(
          "usage",
          "check-snippet reads the snippet content from stdin. Pipe it, for example: cat Dockerfile | evergreen check-snippet --path Dockerfile.",
        );
      try {
        const content = await new Promise<string>((resolveSnippet, rejectSnippet) => {
          const chunks: Buffer[] = [];
          process.stdin.on("data", (chunk) => chunks.push(chunk));
          process.stdin.on("end", () => resolveSnippet(Buffer.concat(chunks).toString("utf8")));
          process.stdin.on("error", rejectSnippet);
        });
        const check = await checkSnippet({ path: snippetPath, content });
        const text = state.json
          ? JSON.stringify(check, null, 2)
          : [check.message, ...check.findings.map(renderFindingText)].join("\n\n");
        process.stdout.write(`${text}\n`);
        return 0;
      } catch (error) {
        if (error instanceof SnippetInputError) return ctx.fail("usage", error.message);
        throw error;
      }
    });
  },
};

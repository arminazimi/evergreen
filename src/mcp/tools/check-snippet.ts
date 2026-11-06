import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { EvergreenAgentTools } from "../../agent-tools.js";
import { checkSnippet } from "../../check-snippet.js";
import { failure, registerMcpTool, success } from "../tool-support.js";

/** Registers `check_snippet`: one intended file, checked in an isolated temporary directory. */
export function registerCheckSnippet(server: McpServer, tools: EvergreenAgentTools): void {
  registerMcpTool(server, tools, {
    name: "check_snippet",
    title: "Check snippet",
    description:
      "Check one file snippet before writing it: pass the intended repository-relative path and the exact content, and Evergreen runs all built-in detectors against that one file in an isolated temporary directory. Call this before writing or editing package manifests, Dockerfiles, CI workflows, and Kubernetes manifests. Returns the same findings as scan_repository, with paths and lines relative to the snippet. The real repository is never read or written.",
    inputSchema: z.object({
      path: z
        .string()
        .min(1)
        .describe(
          "The intended repository-relative path, for example Dockerfile, .github/workflows/ci.yml, or package.json. It decides which detector reads the snippet.",
        ),
      content: z.string().min(1).describe("The exact content the agent intends to write."),
    }),
    async handler(_context, { path, content }) {
      try {
        return success(await checkSnippet({ path, content }));
      } catch (error) {
        return failure(error);
      }
    },
  });
}

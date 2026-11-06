import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { EvergreenAgentTools } from "../../agent-tools.js";
import { failure, registerMcpTool, repositoryInput, success } from "../tool-support.js";

/** Registers `scan_repository`: a full deterministic scan of a local repository. */
export function registerScanRepository(server: McpServer, tools: EvergreenAgentTools): void {
  registerMcpTool(server, tools, {
    name: "scan_repository",
    title: "Scan repository",
    description:
      "Run all built-in Evergreen detectors against a local repository and return the complete versioned scan result.",
    inputSchema: z.object({
      ...repositoryInput,
      baseline: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Optional path, relative to the repository, of an Evergreen baseline file. Suppressed findings are left out and the result's suppressions field says how many, and which suppressions are expiring or expired.",
        ),
    }),
    async handler(context, { repository_path, baseline }) {
      try {
        const result = await context.tools.scan(repository_path, baseline);
        context.server.sendResourceListChanged();
        return success(result);
      } catch (error) {
        return failure(error);
      }
    },
  });
}

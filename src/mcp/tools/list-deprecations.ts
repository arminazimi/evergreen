import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { EvergreenAgentTools } from "../../agent-tools.js";
import { failure, registerMcpTool, repositoryInput, success } from "../tool-support.js";

/** Registers `list_deprecations`: a compact list of the findings a fresh scan returns. */
export function registerListDeprecations(server: McpServer, tools: EvergreenAgentTools): void {
  registerMcpTool(server, tools, {
    name: "list_deprecations",
    title: "List deprecations",
    description: "Run a fresh local scan and return a compact, versioned list of lifecycle findings.",
    inputSchema: z.object(repositoryInput),
    async handler(context, { repository_path }) {
      try {
        const result = await context.tools.list(repository_path);
        context.server.sendResourceListChanged();
        return success(result);
      } catch (error) {
        return failure(error);
      }
    },
  });
}

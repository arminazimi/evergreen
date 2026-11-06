import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { EvergreenAgentTools } from "../../agent-tools.js";
import { failure, findingInput, registerMcpTool, success } from "../tool-support.js";

/** Registers `create_migration_context`: the validated migration packet for one finding. */
export function registerCreateMigrationContext(server: McpServer, tools: EvergreenAgentTools): void {
  registerMcpTool(server, tools, {
    name: "create_migration_context",
    title: "Create migration context",
    description: "Create a validated, rule-specific migration packet for one finding from a fresh local scan.",
    inputSchema: z.object(findingInput),
    async handler(context, { finding_id, repository_path }) {
      try {
        const result = await context.tools.context(finding_id, repository_path);
        context.server.sendResourceListChanged();
        return success(result);
      } catch (error) {
        return failure(error);
      }
    },
  });
}

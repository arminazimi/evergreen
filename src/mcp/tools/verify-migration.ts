import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { EvergreenAgentTools } from "../../agent-tools.js";
import { failure, findingInput, registerMcpTool, success } from "../tool-support.js";

/** Registers `verify_migration`: whether a finding observed earlier is gone after a fresh scan. */
export function registerVerifyMigration(server: McpServer, tools: EvergreenAgentTools): void {
  registerMcpTool(server, tools, {
    name: "verify_migration",
    title: "Verify migration",
    description:
      "Re-scan locally and check whether a finding observed earlier in this MCP session is gone. Suggested project commands are returned but never executed. When the repository was scanned earlier in the session, the result also carries a receipt and receipt_markdown for the pull request body.",
    inputSchema: z.object(findingInput),
    async handler(context, { finding_id, repository_path }) {
      try {
        const result = await context.tools.verify(finding_id, repository_path);
        context.server.sendResourceListChanged();
        return success(result);
      } catch (error) {
        return failure(error);
      }
    },
  });
}

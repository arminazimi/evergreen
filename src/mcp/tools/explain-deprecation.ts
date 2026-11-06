import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { EvergreenAgentTools } from "../../agent-tools.js";
import { failure, findingInput, registerMcpTool, success } from "../tool-support.js";

/** Registers `explain_deprecation`: one complete finding from a fresh scan. */
export function registerExplainDeprecation(server: McpServer, tools: EvergreenAgentTools): void {
  registerMcpTool(server, tools, {
    name: "explain_deprecation",
    title: "Explain deprecation",
    description: "Run a fresh local scan and return one complete evidence-backed finding by ID.",
    inputSchema: z.object(findingInput),
    async handler(context, { finding_id, repository_path }) {
      try {
        const result = await context.tools.explain(finding_id, repository_path);
        context.server.sendResourceListChanged();
        return success(result);
      } catch (error) {
        return failure(error);
      }
    },
  });
}

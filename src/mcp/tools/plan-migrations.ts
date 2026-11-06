import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { EvergreenAgentTools } from "../../agent-tools.js";
import { buildPlan } from "../../plan-build.js";
import { failure, registerMcpTool, repositoryInput, success } from "../tool-support.js";

/** Registers `plan_migrations`: a migration plan of waves a coordinating agent can hand out. */
export function registerPlanMigrations(server: McpServer, tools: EvergreenAgentTools): void {
  registerMcpTool(server, tools, {
    name: "plan_migrations",
    title: "Plan migrations",
    description:
      "Run a fresh local scan and return a migration plan: waves of independent tasks a coordinating agent can hand to other agents. Each item names the finding, the paths it touches, and a suggested branch.",
    inputSchema: z.object(repositoryInput),
    async handler(context, { repository_path }) {
      try {
        const result = await context.tools.scan(repository_path);
        context.server.sendResourceListChanged();
        return success(buildPlan(result));
      } catch (error) {
        return failure(error);
      }
    },
  });
}

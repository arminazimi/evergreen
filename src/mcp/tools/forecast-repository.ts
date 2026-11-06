import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { EvergreenAgentTools } from "../../agent-tools.js";
import { bundledRules } from "../../check-dependency.js";
import { buildForecast, DEFAULT_FORECAST_MONTHS, MAX_FORECAST_MONTHS } from "../../forecast.js";
import { failure, registerMcpTool, repositoryInput, success } from "../tool-support.js";

/** Registers `forecast_repository`: what reaches a dated end of life in the coming months. */
export function registerForecastRepository(server: McpServer, tools: EvergreenAgentTools): void {
  registerMcpTool(server, tools, {
    name: "forecast_repository",
    title: "Forecast repository",
    description:
      "Run a fresh local scan and list what reaches a dated end of life in the next months, grouped by month, with the findings in this repository that each event will affect. Only events that carry an authoritative date are listed; nothing is estimated.",
    inputSchema: z.object({
      ...repositoryInput,
      months: z
        .number()
        .int()
        .min(1)
        .max(MAX_FORECAST_MONTHS)
        .default(DEFAULT_FORECAST_MONTHS)
        .describe(
          `How many months ahead to look, from 1 to ${MAX_FORECAST_MONTHS}. Defaults to ${DEFAULT_FORECAST_MONTHS}.`,
        ),
      as_of: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "as_of must be a date (YYYY-MM-DD).")
        .optional()
        .describe("The day to start the window from, as YYYY-MM-DD. Defaults to today in UTC."),
    }),
    async handler(context, { repository_path, months, as_of }) {
      try {
        const result = await context.tools.scan(repository_path);
        context.server.sendResourceListChanged();
        return success(
          buildForecast(result, await bundledRules(), as_of ?? new Date().toISOString().slice(0, 10), months),
        );
      } catch (error) {
        return failure(error);
      }
    },
  });
}

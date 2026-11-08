import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { EvergreenAgentTools } from "../../agent-tools.js";
import { DEFAULT_MINIMUM_SUPPORT_DAYS, recommendVersion } from "../../recommend.js";
import { failure, registerMcpTool, success } from "../tool-support.js";

/** Registers `recommend_version`: which release line to write today, from the bundled lifecycle data only. */
export function registerRecommendVersion(server: McpServer, tools: EvergreenAgentTools): void {
  registerMcpTool(server, tools, {
    name: "recommend_version",
    title: "Recommend version",
    description:
      "Say which release line of a runtime, container image, GitHub Action, or package to write today, instead of whatever training data remembers. Pass a product name such as node, python, or postgres, or a Package URL such as pkg:docker/library/node or pkg:githubactions/actions/checkout. Returns evergreen.recommend.v1: the recommended line and the date it is supported until, other qualifying alternatives, the lines to avoid with their dates, and evidence sources. A line qualifies when the data does not mark it ended and its end date is at least minimumSupportDays away (default 180). The answer comes only from Evergreen's bundled lifecycle data, never from the network, so it never says 'latest' and is limited to what the data covers. no-data means Evergreen has no data for the product, not that any version is safe. No repository is read.",
    inputSchema: z.object({
      product: z
        .string()
        .min(1)
        .describe("A product name as lookup accepts it (node, python, postgres) or a Package URL without a version."),
      minimumSupportDays: z
        .number()
        .int()
        .min(0)
        .default(DEFAULT_MINIMUM_SUPPORT_DAYS)
        .describe("Days a release line must stay supported to qualify. Defaults to 180."),
      as_of: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Date the answer is for, YYYY-MM-DD. Defaults to today (UTC); set it for a repeatable answer."),
    }),
    async handler(_context, { product, minimumSupportDays, as_of }) {
      try {
        return success(
          await recommendVersion({
            name: product,
            minimumSupportDays,
            ...(as_of === undefined ? {} : { asOf: as_of }),
          }),
        );
      } catch (error) {
        return failure(error);
      }
    },
  });
}

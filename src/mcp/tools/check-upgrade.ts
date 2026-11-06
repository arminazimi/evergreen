import type { McpServer } from "@modelcontextprotocol/server";
import { resolve } from "node:path";
import * as z from "zod/v4";

import type { EvergreenAgentTools } from "../../agent-tools.js";
import { checkUpgrade, parseUpgradeTarget } from "../../upgrade/index.js";
import { failure, registerMcpTool, success } from "../tool-support.js";

/** Registers `check_upgrade`: whether the repository can move to a target runtime. */
export function registerCheckUpgrade(server: McpServer, tools: EvergreenAgentTools): void {
  registerMcpTool(server, tools, {
    name: "check_upgrade",
    title: "Check upgrade",
    description:
      "Answer from files already in the repository whether a project can move to a target runtime, without running anything or using the network. Pass target as runtime@version, for example php@8.4. Returns evergreen.upgrade.v1: the verdict, the analyzers that applied, and every blocker, warning, and unknown with its path, line, and the exact constraint it read. An unknown verdict means Evergreen found no evidence for this runtime in this repository; it is not a statement that the upgrade is safe.",
    inputSchema: z.object({
      path: z
        .string()
        .min(1)
        .default(".")
        .describe("Local path to the repository. Defaults to the server working directory."),
      target: z
        .string()
        .min(1)
        .describe("Runtime and release to move to, as runtime@version, for example php@8.4 or nodejs@22."),
    }),
    async handler(_context, { path, target }) {
      try {
        const parsed = parseUpgradeTarget(target);
        if (!parsed)
          return failure(new Error(`target must be <runtime>@<version>, for example php@8.4 (got "${target}").`));
        return success(await checkUpgrade(resolve(path), parsed));
      } catch (error) {
        return failure(error);
      }
    },
  });
}

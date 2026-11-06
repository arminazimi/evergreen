import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { EvergreenAgentTools } from "../../agent-tools.js";
import { checkDependency } from "../../check-dependency.js";
import { failure, registerMcpTool, success } from "../tool-support.js";

/** Registers `check_dependency`: one package, and optionally one version, against the lifecycle rules. */
export function registerCheckDependency(server: McpServer, tools: EvergreenAgentTools): void {
  registerMcpTool(server, tools, {
    name: "check_dependency",
    title: "Check dependency",
    description:
      "Check one package, and optionally one version, against Evergreen's lifecycle rules before adding it to a project. Pass a Package URL such as pkg:npm/request@2.88.2 or pkg:github/actions/checkout@v4. Returns evergreen.check.v1: a status (affected, not-affected, version-dependent, or no-data), the evidence-backed findings, and a replacement when one is known. no-data means Evergreen has no rule for the package, not that it is safe. No repository is read.",
    inputSchema: z.object({
      purl: z
        .string()
        .min(1)
        .describe(
          "Package URL of the dependency, with the version when it is known, for example pkg:npm/request@2.88.2.",
        ),
      version: z
        .string()
        .min(1)
        .optional()
        .describe("Exact version to check; overrides a version written in the PURL."),
    }),
    async handler(_context, { purl, version }) {
      try {
        return success(await checkDependency({ purl, ...(version ? { version } : {}) }));
      } catch (error) {
        return failure(error);
      }
    },
  });
}

import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { EvergreenAgentTools } from "./agent-tools.js";
import { VERSION } from "./version.js";

export const MCP_TOOL_NAMES = [
  "scan_repository",
  "list_deprecations",
  "explain_deprecation",
  "create_migration_context",
  "verify_migration",
] as const;

const repositoryInput = {
  repository_path: z
    .string()
    .min(1)
    .default(".")
    .describe("Local path to the repository. Defaults to the server working directory."),
};

const findingInput = {
  finding_id: z.string().min(1).describe("Exact finding ID returned by Evergreen."),
  ...repositoryInput,
};

export const MCP_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function success(value: object) {
  const structuredContent = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent,
  };
}

function failure(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  };
}

export function createEvergreenMcpServer(
  tools = new EvergreenAgentTools(),
): McpServer {
  const server = new McpServer(
    { name: "evergreen", version: VERSION },
    {
      instructions:
        "Evergreen performs deterministic deprecation analysis inside the local process. Repository contents are never sent over the network. Scan before editing, create migration context, then verify the previously observed finding.",
    },
  );

  server.registerTool(
    "scan_repository",
    {
      title: "Scan repository",
      description:
        "Run all built-in Evergreen detectors against a local repository and return the complete versioned scan result.",
      inputSchema: z.object(repositoryInput),
      annotations: MCP_TOOL_ANNOTATIONS,
    },
    async ({ repository_path }) => {
      try {
        return success(await tools.scan(repository_path));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "list_deprecations",
    {
      title: "List deprecations",
      description:
        "Run a fresh local scan and return a compact, versioned list of lifecycle findings.",
      inputSchema: z.object(repositoryInput),
      annotations: MCP_TOOL_ANNOTATIONS,
    },
    async ({ repository_path }) => {
      try {
        return success(await tools.list(repository_path));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "explain_deprecation",
    {
      title: "Explain deprecation",
      description:
        "Run a fresh local scan and return one complete evidence-backed finding by ID.",
      inputSchema: z.object(findingInput),
      annotations: MCP_TOOL_ANNOTATIONS,
    },
    async ({ finding_id, repository_path }) => {
      try {
        return success(await tools.explain(finding_id, repository_path));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "create_migration_context",
    {
      title: "Create migration context",
      description:
        "Create a validated, rule-specific migration packet for one finding from a fresh local scan.",
      inputSchema: z.object(findingInput),
      annotations: MCP_TOOL_ANNOTATIONS,
    },
    async ({ finding_id, repository_path }) => {
      try {
        return success(await tools.context(finding_id, repository_path));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "verify_migration",
    {
      title: "Verify migration",
      description:
        "Re-scan locally and check whether a finding observed earlier in this MCP session is gone. Suggested project commands are returned but never executed.",
      inputSchema: z.object(findingInput),
      annotations: MCP_TOOL_ANNOTATIONS,
    },
    async ({ finding_id, repository_path }) => {
      try {
        return success(await tools.verify(finding_id, repository_path));
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}

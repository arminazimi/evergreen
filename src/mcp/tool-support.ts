import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { EvergreenAgentTools } from "../agent-tools.js";
import { outputSchema } from "./output-schema.js";
import { MCP_TOOL_ANNOTATIONS, type McpToolName } from "./tool-names.js";

/** Input every repository-scoped tool shares. */
export const repositoryInput = {
  repository_path: z
    .string()
    .min(1)
    .default(".")
    .describe("Local path to the repository. Defaults to the server working directory."),
};

/** Input every tool that follows up on one observed finding shares. */
export const findingInput = {
  finding_id: z.string().min(1).describe("Exact finding ID returned by Evergreen."),
  ...repositoryInput,
};

/** What a tool handler may use: the host session and the agent tools it drives. */
export interface McpToolContext {
  server: McpServer;
  tools: EvergreenAgentTools;
}

/** The subset of the MCP `CallToolResult` a tool returns. */
export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

/** A successful call: the same JSON as text and as structured content, so either client style works. */
export function success(value: object): McpToolResult {
  const structuredContent = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent,
  };
}

/** A failed call: the message as text and the MCP error flag, never as structured content. */
export function failure(error: unknown): McpToolResult {
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

/** Registers one tool with its schema, output schema, and shared read-only annotations. */
export function registerMcpTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  tools: EvergreenAgentTools,
  config: {
    name: McpToolName;
    title: string;
    description: string;
    inputSchema: z.ZodObject<Shape>;
    handler: (context: McpToolContext, input: z.infer<z.ZodObject<Shape>>) => Promise<McpToolResult>;
  },
): void {
  server.registerTool(
    config.name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      outputSchema: outputSchema(config.name),
      annotations: MCP_TOOL_ANNOTATIONS,
    },
    (input) => config.handler({ server, tools }, input),
  );
}

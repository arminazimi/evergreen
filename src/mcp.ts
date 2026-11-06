import { completable, McpServer, ResourceNotFoundError, ResourceTemplate } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { EvergreenAgentTools } from "./agent-tools.js";
import { bundledRules } from "./check-dependency.js";
import { registerMcpTools } from "./mcp/registry.js";
import { MIGRATE_FINDING_PROMPT, renderMigrationPrompt } from "./migration-prompt.js";
import { ruleUri, RULE_URI_PREFIX, toRuleDocument } from "./rule-resources.js";
import { VERSION } from "./version.js";

export { inlineSchemaReferences, toolOutputSchema } from "./mcp/output-schema.js";
export { MCP_OUTPUT_SCHEMA_FILES, MCP_TOOL_ANNOTATIONS, MCP_TOOL_NAMES } from "./mcp/tool-names.js";

/** The base URI for finding resources the server exposes. */
export const FINDING_URI_PREFIX = "evergreen://findings/";
const findingUri = (key: string, id: string) => `${FINDING_URI_PREFIX}${key}/${encodeURIComponent(id)}`;

/** Builds the MCP server with its tools, prompts, and lifecycle-rule resources registered. */
export function createEvergreenMcpServer(tools = new EvergreenAgentTools()): McpServer {
  const server = new McpServer(
    { name: "evergreen", version: VERSION },
    {
      instructions:
        "Evergreen performs deterministic deprecation analysis inside the local process. Repository contents are never sent over the network. Scan before editing, create migration context, then verify the previously observed finding.",
    },
  );

  server.registerResource(
    "lifecycle-rule",
    new ResourceTemplate(`${RULE_URI_PREFIX}{id}`, {
      list: async () => ({
        resources: (await bundledRules()).map((rule) => ({
          uri: ruleUri(rule.id),
          name: rule.id,
          title: rule.title,
          description: `${rule.severity} ${rule.event}: ${rule.summary}`,
          mimeType: "application/json",
        })),
      }),
      complete: {
        id: async (value) => (await bundledRules()).map((rule) => rule.id).filter((id) => id.startsWith(value)),
      },
    }),
    {
      title: "Lifecycle rule",
      description:
        "One evidence-backed lifecycle rule as an evergreen.rule.v1 document: what is affected, the event, severity, replacement, deadline, sources, review provenance, and migration guidance. Reading a rule scans nothing.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const id = String(Array.isArray(variables.id) ? variables.id[0] : variables.id);
      const rule = (await bundledRules()).find((candidate) => candidate.id === id);
      if (!rule) throw new ResourceNotFoundError(uri.href, `No lifecycle rule "${id}".`);
      return {
        contents: [
          { uri: ruleUri(rule.id), mimeType: "application/json", text: JSON.stringify(toRuleDocument(rule), null, 2) },
        ],
      };
    },
  );

  server.registerResource(
    "observed-finding",
    new ResourceTemplate(`${FINDING_URI_PREFIX}{repository}/{id}`, {
      list: async () => ({
        resources: tools.observedFindings().map(({ repositoryKey, repositoryRoot, finding }) => ({
          uri: findingUri(repositoryKey, finding.id),
          name: finding.id,
          title: finding.title,
          description: `${finding.severity} at ${finding.location.path}${finding.location.line ? `:${finding.location.line}` : ""} in ${repositoryRoot}`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Observed finding",
      description:
        "A lifecycle finding observed earlier in this MCP session, by URI: the complete evidence-backed finding that explain_deprecation returns. Only findings from scans run in this session exist; call scan_repository first. The list changes after each scan.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const one = (value: string | string[] | undefined) => String(Array.isArray(value) ? value[0] : value);
      const entry = tools.observedFinding(one(variables.repository), decodeURIComponent(one(variables.id)));
      if (!entry) {
        throw new ResourceNotFoundError(
          uri.href,
          "No finding with this URI was observed in this MCP session. Call scan_repository, then list resources.",
        );
      }
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(entry.finding, null, 2) }],
      };
    },
  );

  server.registerPrompt(
    MIGRATE_FINDING_PROMPT,
    {
      title: "Migrate a finding",
      description:
        "Drives one finding from scan to verified migration: runs a fresh local scan, embeds the finding's migration packet, and tells the model to edit within the packet's constraints, run the project's checks, and call verify_migration in this session.",
      argsSchema: z.object({
        finding_id: completable(
          z
            .string()
            .min(1)
            .describe("Exact finding ID returned by Evergreen, for example from scan_repository or list_deprecations."),
          (value) =>
            tools
              .observedFindings()
              .map((entry) => entry.finding.id)
              .filter((id) => id.startsWith(value)),
        ),
        repository_path: z
          .string()
          .min(1)
          .optional()
          .describe("Local path to the repository. Defaults to the server working directory."),
      }),
    },
    async ({ finding_id, repository_path }) => {
      const repository = repository_path ?? ".";
      const packet = await tools.context(finding_id, repository);
      server.sendResourceListChanged();
      return {
        description: `Migrate ${packet.finding.title} at ${packet.finding.location.path}`,
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: renderMigrationPrompt(packet, repository) },
          },
        ],
      };
    },
  );

  registerMcpTools(server, tools);

  return server;
}

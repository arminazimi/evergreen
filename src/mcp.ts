import { McpServer, ResourceNotFoundError, ResourceTemplate } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { EvergreenAgentTools } from "./agent-tools.js";
import { bundledRules, checkDependency } from "./check-dependency.js";
import { ruleUri, RULE_URI_PREFIX, toRuleDocument } from "./rule-resources.js";
import { VERSION } from "./version.js";

export const MCP_TOOL_NAMES = [
  "scan_repository",
  "list_deprecations",
  "explain_deprecation",
  "create_migration_context",
  "verify_migration",
  "check_dependency",
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

export const FINDING_URI_PREFIX = "evergreen://findings/";
const findingUri = (key: string, id: string) => `${FINDING_URI_PREFIX}${key}/${encodeURIComponent(id)}`;

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
        contents: [{ uri: ruleUri(rule.id), mimeType: "application/json", text: JSON.stringify(toRuleDocument(rule), null, 2) }],
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
        throw new ResourceNotFoundError(uri.href, "No finding with this URI was observed in this MCP session. Call scan_repository, then list resources.");
      }
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(entry.finding, null, 2) }] };
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
        const result = await tools.scan(repository_path);
        server.sendResourceListChanged();
        return success(result);
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
        const result = await tools.list(repository_path);
        server.sendResourceListChanged();
        return success(result);
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
        const result = await tools.explain(finding_id, repository_path);
        server.sendResourceListChanged();
        return success(result);
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
        const result = await tools.context(finding_id, repository_path);
        server.sendResourceListChanged();
        return success(result);
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
        const result = await tools.verify(finding_id, repository_path);
        server.sendResourceListChanged();
        return success(result);
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "check_dependency",
    {
      title: "Check dependency",
      description:
        "Check one package, and optionally one version, against Evergreen's lifecycle rules before adding it to a project. Pass a Package URL such as pkg:npm/request@2.88.2 or pkg:github/actions/checkout@v4. Returns evergreen.check.v1: a status (affected, not-affected, version-dependent, or no-data), the evidence-backed findings, and a replacement when one is known. no-data means Evergreen has no rule for the package, not that it is safe. No repository is read.",
      inputSchema: z.object({
        purl: z
          .string()
          .min(1)
          .describe("Package URL of the dependency, with the version when it is known, for example pkg:npm/request@2.88.2."),
        version: z
          .string()
          .min(1)
          .optional()
          .describe("Exact version to check; overrides a version written in the PURL."),
      }),
      annotations: MCP_TOOL_ANNOTATIONS,
    },
    async ({ purl, version }) => {
      try {
        return success(await checkDependency({ purl, ...(version ? { version } : {}) }));
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}

import type { McpServer } from "@modelcontextprotocol/server";

import type { EvergreenAgentTools } from "../agent-tools.js";
import { registerCheckDependency } from "./tools/check-dependency.js";
import { registerCheckSnippet } from "./tools/check-snippet.js";
import { registerCheckUpgrade } from "./tools/check-upgrade.js";
import { registerCreateMigrationContext } from "./tools/create-migration-context.js";
import { registerExplainDeprecation } from "./tools/explain-deprecation.js";
import { registerForecastRepository } from "./tools/forecast-repository.js";
import { registerListDeprecations } from "./tools/list-deprecations.js";
import { registerPlanMigrations } from "./tools/plan-migrations.js";
import { registerRecommendVersion } from "./tools/recommend-version.js";
import { registerScanRepository } from "./tools/scan-repository.js";
import { registerVerifyMigration } from "./tools/verify-migration.js";

/**
 * Every tool registrar, in the order the server advertises them. Adding a tool means adding one file under
 * `tools/` and one line here; the tool owns its schema, description, handler, and error handling.
 */
export const MCP_TOOL_REGISTRARS = [
  registerScanRepository,
  registerListDeprecations,
  registerExplainDeprecation,
  registerCreateMigrationContext,
  registerVerifyMigration,
  registerCheckDependency,
  registerCheckUpgrade,
  registerCheckSnippet,
  registerForecastRepository,
  registerPlanMigrations,
  registerRecommendVersion,
] as const;

/** Registers every MCP tool on the server. */
export function registerMcpTools(server: McpServer, tools: EvergreenAgentTools): void {
  for (const register of MCP_TOOL_REGISTRARS) register(server, tools);
}

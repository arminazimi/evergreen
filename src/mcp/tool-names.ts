/** The tools the MCP server exposes, in the order it registers them. */
export const MCP_TOOL_NAMES = [
  "scan_repository",
  "list_deprecations",
  "explain_deprecation",
  "create_migration_context",
  "verify_migration",
  "check_dependency",
  "check_upgrade",
  "check_snippet",
  "forecast_repository",
  "plan_migrations",
  "recommend_version",
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

/** The published JSON Schema each tool's structured content conforms to. */
export const MCP_OUTPUT_SCHEMA_FILES = {
  scan_repository: "scan.v1.schema.json",
  list_deprecations: "deprecations.v1.schema.json",
  explain_deprecation: "finding.v1.schema.json",
  create_migration_context: "context.v1.schema.json",
  verify_migration: "verification.v1.schema.json",
  check_dependency: "check.v1.schema.json",
  check_upgrade: "upgrade.v1.schema.json",
  check_snippet: "check-snippet.v1.schema.json",
  forecast_repository: "forecast.v1.schema.json",
  plan_migrations: "plan.v1.schema.json",
  recommend_version: "recommend.v1.schema.json",
} as const satisfies Record<McpToolName, string>;

/** MCP hints shared by every tool: read-only, idempotent, closed-world, and non-destructive. */
export const MCP_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

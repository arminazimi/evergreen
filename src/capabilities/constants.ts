/** The capability identifiers every MCP, Skill, and plugin surface exposes. */
export const workflowCapabilityIds = [
  "repository.scan",
  "deprecation.list",
  "deprecation.explain",
  "migration.context.create",
  "migration.verify",
] as const;

/**
 * Built-in detectors that are not capability-manifest ecosystems.
 * `cle` reads maintainer CLE documents inside installed packages; it is not a
 * discoverable ecosystem surface for `evergreen capabilities`.
 */
export const MANIFEST_EXCLUDED_DETECTOR_IDS = ["cle"] as const;

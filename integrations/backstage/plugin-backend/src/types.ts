export type {
  PortalCatalog,
  PortalService,
  PortalSeverityCounts,
  Severity,
} from "@evergreen-dev/backstage-plugin-common";

export {
  PORTAL_SCHEMA_VERSION,
  SERVICE_PATH_ANNOTATION,
  SEVERITIES,
  findService,
  highestSeverity,
  parsePortalCatalog,
  totalFindings,
} from "@evergreen-dev/backstage-plugin-common";

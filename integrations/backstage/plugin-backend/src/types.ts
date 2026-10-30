export type {
  PortalCatalog,
  PortalService,
  PortalSeverityCounts,
  Severity,
} from "../../common/portal";

export {
  PORTAL_SCHEMA_VERSION,
  SERVICE_PATH_ANNOTATION,
  SEVERITIES,
  findService,
  highestSeverity,
  parsePortalCatalog,
  totalFindings,
} from "../../common/portal";

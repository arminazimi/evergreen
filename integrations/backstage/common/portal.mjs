/**
 * Shared portal-export helpers for the Backstage plugin and the sample app.
 * Plain ESM so the sample can run without compiling TypeScript or installing Backstage.
 *
 * Contract: schemas/portal.v1.schema.json (`evergreen.portal.v1`).
 *
 * @typedef {{ info: number, low: number, medium: number, high: number, critical: number }} PortalSeverityCounts
 * @typedef {{ path: string, severities: PortalSeverityCounts, nextEndOfLife?: string, reportLink: string }} PortalService
 * @typedef {{ schemaVersion: typeof PORTAL_SCHEMA_VERSION, services: PortalService[] }} PortalCatalog
 */

export const PORTAL_SCHEMA_VERSION = "evergreen.portal.v1";

/** Catalog annotation that maps a Backstage Component to a portal `path`. */
export const SERVICE_PATH_ANNOTATION = "evergreen.io/service-path";

export const SEVERITIES = /** @type {const} */ (["critical", "high", "medium", "low", "info"]);

/**
 * @param {unknown} value
 * @returns {PortalCatalog}
 */
export function parsePortalCatalog(value) {
  if (!value || typeof value !== "object") {
    throw new Error("portal export must be a JSON object");
  }
  const catalog = /** @type {Record<string, unknown>} */ (value);
  if (catalog.schemaVersion !== PORTAL_SCHEMA_VERSION) {
    throw new Error(
      `unsupported portal schemaVersion ${JSON.stringify(catalog.schemaVersion)}; expected ${PORTAL_SCHEMA_VERSION}`,
    );
  }
  if (!Array.isArray(catalog.services)) {
    throw new Error("portal export.services must be an array");
  }
  for (const [index, service] of catalog.services.entries()) {
    assertService(service, index);
  }
  return /** @type {PortalCatalog} */ (catalog);
}

/**
 * @param {unknown} service
 * @param {number} index
 */
function assertService(service, index) {
  if (!service || typeof service !== "object") {
    throw new Error(`portal export.services[${index}] must be an object`);
  }
  const row = /** @type {Record<string, unknown>} */ (service);
  if (typeof row.path !== "string" || row.path.trim() === "") {
    throw new Error(`portal export.services[${index}].path must be a non-empty string`);
  }
  if (typeof row.reportLink !== "string" || row.reportLink.trim() === "") {
    throw new Error(`portal export.services[${index}].reportLink must be a non-empty string`);
  }
  if (!row.severities || typeof row.severities !== "object") {
    throw new Error(`portal export.services[${index}].severities must be an object`);
  }
  const severities = /** @type {Record<string, unknown>} */ (row.severities);
  for (const key of SEVERITIES) {
    const count = severities[key];
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new Error(`portal export.services[${index}].severities.${key} must be a non-negative integer`);
    }
  }
}

/**
 * Find the portal service that matches a Backstage component annotation value.
 * Paths are compared after trimming trailing slashes; exact match wins, then unique basename match.
 *
 * @param {PortalCatalog} catalog
 * @param {string} servicePath
 * @returns {PortalService | undefined}
 */
export function findService(catalog, servicePath) {
  const wanted = normalizePath(servicePath);
  if (!wanted) return undefined;

  const exact = catalog.services.find((service) => normalizePath(service.path) === wanted);
  if (exact) return exact;

  const wantedBase = basename(wanted);
  const byBase = catalog.services.filter((service) => basename(normalizePath(service.path)) === wantedBase);
  return byBase.length === 1 ? byBase[0] : undefined;
}

/**
 * @param {PortalService} service
 * @returns {number}
 */
export function totalFindings(service) {
  return SEVERITIES.reduce((sum, key) => sum + service.severities[key], 0);
}

/**
 * @param {PortalService} service
 * @returns {string}
 */
export function highestSeverity(service) {
  for (const key of SEVERITIES) {
    if (service.severities[key] > 0) return key;
  }
  return "none";
}

/**
 * @param {string} path
 */
function normalizePath(path) {
  const trimmed = path.trim();
  let end = trimmed.length;
  while (end > 0 && trimmed[end - 1] === "/") end -= 1;
  return trimmed.slice(0, end);
}

/**
 * @param {string} path
 */
function basename(path) {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

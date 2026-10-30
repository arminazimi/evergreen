/**
 * Shared portal-export types and helpers for the Backstage plugin packages.
 * Mirrors `portal.mjs` so the TypeScript plugins stay typed without a build step in this repo.
 *
 * Contract: schemas/portal.v1.schema.json (`evergreen.portal.v1`).
 */

export const PORTAL_SCHEMA_VERSION = "evergreen.portal.v1" as const;

/** Catalog annotation that maps a Backstage Component to a portal `path`. */
export const SERVICE_PATH_ANNOTATION = "evergreen.io/service-path";

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

export type Severity = (typeof SEVERITIES)[number];

export type PortalSeverityCounts = Record<Severity, number>;

export interface PortalService {
  path: string;
  severities: PortalSeverityCounts;
  nextEndOfLife?: string;
  reportLink: string;
}

export interface PortalCatalog {
  schemaVersion: typeof PORTAL_SCHEMA_VERSION;
  services: PortalService[];
}

export function parsePortalCatalog(value: unknown): PortalCatalog {
  if (!value || typeof value !== "object") {
    throw new Error("portal export must be a JSON object");
  }
  const catalog = value as Record<string, unknown>;
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
  return catalog as unknown as PortalCatalog;
}

function assertService(service: unknown, index: number): void {
  if (!service || typeof service !== "object") {
    throw new Error(`portal export.services[${index}] must be an object`);
  }
  const row = service as Record<string, unknown>;
  if (typeof row.path !== "string" || row.path.trim() === "") {
    throw new Error(`portal export.services[${index}].path must be a non-empty string`);
  }
  if (typeof row.reportLink !== "string" || row.reportLink.trim() === "") {
    throw new Error(`portal export.services[${index}].reportLink must be a non-empty string`);
  }
  if (!row.severities || typeof row.severities !== "object") {
    throw new Error(`portal export.services[${index}].severities must be an object`);
  }
  const severities = row.severities as Record<string, unknown>;
  for (const key of SEVERITIES) {
    const count = severities[key];
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new Error(`portal export.services[${index}].severities.${key} must be a non-negative integer`);
    }
  }
}

/** Paths are compared after trimming trailing slashes; exact match wins, then unique basename match. */
export function findService(catalog: PortalCatalog, servicePath: string): PortalService | undefined {
  const wanted = normalizePath(servicePath);
  if (!wanted) return undefined;

  const exact = catalog.services.find((service) => normalizePath(service.path) === wanted);
  if (exact) return exact;

  const wantedBase = basename(wanted);
  const byBase = catalog.services.filter((service) => basename(normalizePath(service.path)) === wantedBase);
  return byBase.length === 1 ? byBase[0] : undefined;
}

export function totalFindings(service: PortalService): number {
  return SEVERITIES.reduce((sum, key) => sum + service.severities[key], 0);
}

export function highestSeverity(service: PortalService): Severity | "none" {
  for (const key of SEVERITIES) {
    if (service.severities[key] > 0) return key;
  }
  return "none";
}

function normalizePath(path: string): string {
  return path.trim().replace(/\/+$/, "");
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

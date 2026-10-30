#!/usr/bin/env node
// Maps an Evergreen developer-portal export to Port entities.
//
// Reads `evergreen.portal.v1` JSON on the command line and prints the body of a bulk entity
// upsert for the `evergreen-service` blueprint. Nothing here uses the network: the CI step that
// calls the Port API does the push, so scans stay local-first.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PORT_SCHEMA_VERSION = "evergreen.portal.v1";
export const PORT_BLUEPRINT = "evergreen-service";
export const SEVERITIES = ["info", "low", "medium", "high", "critical"];

function assertCatalog(catalog) {
  if (catalog?.schemaVersion !== PORT_SCHEMA_VERSION) {
    throw new Error(`expected a ${PORT_SCHEMA_VERSION} export, got ${String(catalog?.schemaVersion)}`);
  }
  if (!Array.isArray(catalog.services)) throw new Error("the export has no services array");
}

/** The last segment of a scanned path: "/repos/api" and "C:\\repos\\api" both give "api". */
export function serviceName(scannedPath) {
  const segments = String(scannedPath).split(/[\\/]+/).filter(Boolean);
  return segments.at(-1) ?? String(scannedPath);
}

/**
 * A Port entity identifier derived from the scanned path: lowercase letters, digits, and
 * hyphens, with the Windows drive dropped. "/repos/api" becomes "repos-api". Two paths that
 * collide are rejected, so an upsert cannot silently overwrite another service.
 */
export function portIdentifier(scannedPath) {
  const identifier = String(scannedPath)
    .replace(/^[A-Za-z]:/, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  if (identifier === "") throw new Error(`cannot derive a Port identifier from "${scannedPath}"`);
  return identifier;
}

function countOf(service, severity) {
  const count = service?.severities?.[severity];
  if (typeof count !== "number") throw new Error(`"${service?.path}" has no ${severity} count`);
  return count;
}

/** The body of `POST /v1/blueprints/:blueprint_identifier/entities/bulk?upsert=true`. */
export function toPortEntities(catalog) {
  assertCatalog(catalog);
  const entities = catalog.services.map((service) => {
    const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, countOf(service, severity)]));
    const properties = {
      path: service.path,
      ...(service.nextEndOfLife !== undefined ? { next_end_of_life: service.nextEndOfLife } : {}),
      report_link: service.reportLink,
      findings_info: counts.info,
      findings_low: counts.low,
      findings_medium: counts.medium,
      findings_high: counts.high,
      findings_critical: counts.critical,
      findings_total: SEVERITIES.reduce((total, severity) => total + counts[severity], 0),
    };
    return { identifier: portIdentifier(service.path), title: serviceName(service.path), properties };
  });
  entities.sort((left, right) => left.identifier.localeCompare(right.identifier));
  for (let index = 1; index < entities.length; index += 1) {
    if (entities[index].identifier === entities[index - 1].identifier) {
      throw new Error(
        `two scanned paths map to the Port identifier "${entities[index].identifier}"; ` +
          "rename one path or scan it under a distinctive directory name",
      );
    }
  }
  return { entities };
}

function main(args) {
  const [file] = args;
  if (file === undefined) {
    process.stderr.write("Usage: node integrations/port/map.mjs <evergreen-portal.json>\n");
    return 2;
  }
  try {
    const catalog = JSON.parse(readFileSync(file, "utf8"));
    process.stdout.write(`${JSON.stringify(toPortEntities(catalog), null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}

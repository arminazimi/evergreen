#!/usr/bin/env node
// Maps an Evergreen developer-portal export to Cortex custom data.
//
// Reads `evergreen.portal.v1` JSON on the command line and prints the body of the bulk custom-data
// `PUT /api/v1/catalog/custom-data`. Nothing here uses the network: the CI step that calls the
// Cortex API does the push, so scans stay local-first.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const CORTEX_SCHEMA_VERSION = "evergreen.portal.v1";
export const CORTEX_CUSTOM_DATA_KEY = "evergreen-lifecycle";
export const SEVERITIES = ["info", "low", "medium", "high", "critical"];

function assertCatalog(catalog) {
  if (catalog?.schemaVersion !== CORTEX_SCHEMA_VERSION) {
    throw new Error(`expected a ${CORTEX_SCHEMA_VERSION} export, got ${String(catalog?.schemaVersion)}`);
  }
  if (!Array.isArray(catalog.services)) throw new Error("the export has no services array");
}

/**
 * The Cortex entity tag for a scanned path: the last path segment, lowercased, with every run of
 * characters other than letters and digits replaced by a hyphen. "/repos/api" becomes "api".
 */
export function cortexTag(scannedPath) {
  const segments = String(scannedPath).split(/[\\/]+/).filter(Boolean);
  const tag = (segments.at(-1) ?? String(scannedPath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (tag === "") throw new Error(`cannot derive a Cortex tag from "${scannedPath}"`);
  return tag;
}

function severitiesOf(service) {
  const severities = {};
  for (const severity of SEVERITIES) {
    const count = service?.severities?.[severity];
    if (typeof count !== "number") throw new Error(`"${service?.path}" has no ${severity} count`);
    severities[severity] = count;
  }
  return severities;
}

/** The body of `PUT /api/v1/catalog/custom-data`. */
export function toCortexCustomData(catalog) {
  assertCatalog(catalog);
  const entries = catalog.services.map((service) => [
    cortexTag(service.path),
    [
      {
        key: CORTEX_CUSTOM_DATA_KEY,
        value: {
          path: service.path,
          severities: severitiesOf(service),
          ...(service.nextEndOfLife !== undefined ? { nextEndOfLife: service.nextEndOfLife } : {}),
          reportLink: service.reportLink,
        },
      },
    ],
  ]);
  entries.sort(([left], [right]) => left.localeCompare(right));
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index][0] === entries[index - 1][0]) {
      throw new Error(
        `two scanned paths map to the Cortex tag "${entries[index][0]}"; ` +
          "rename one service directory so its name matches its Cortex tag",
      );
    }
  }
  return { values: Object.fromEntries(entries) };
}

function main(args) {
  const [file] = args;
  if (file === undefined) {
    process.stderr.write("Usage: node integrations/cortex/map.mjs <evergreen-portal.json>\n");
    return 2;
  }
  try {
    const catalog = JSON.parse(readFileSync(file, "utf8"));
    process.stdout.write(`${JSON.stringify(toCortexCustomData(catalog), null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}

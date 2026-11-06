// Loads the committed endoflife.date snapshot and chooses the lifecycle date a rule should be compared with.
//
// The snapshot is a projection of the public API on one day, so the comparison needs no network. A rule's
// event decides the field: end-of-support reads `support`, end-of-life reads `eol`. AWS Lambda is the one
// exception: Evergreen records AWS's deprecation date, which the API publishes as `support` for that product.

import { readFile } from "node:fs/promises";

import { SNAPSHOT_SCHEMA } from "./types.js";
import type { Snapshot, SnapshotCycle, SnapshotSource } from "./types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) throw new Error(`snapshot: "${field}" must be a string`);
  return value;
}

function optionalDate(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    throw new Error(`snapshot: "${field}" must be a YYYY-MM-DD date`);
  }
  return value;
}

function optionalDateOrFlag(record: Record<string, unknown>, field: string): string | boolean | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string" && ISO_DATE.test(value)) return value;
  throw new Error(`snapshot: "${field}" must be a YYYY-MM-DD date or a boolean`);
}

function parseCycle(raw: unknown, product: string): SnapshotCycle {
  if (!isRecord(raw)) throw new Error(`snapshot: a cycle of "${product}" is not an object`);
  const cycle = requiredString(raw, "cycle");
  const releaseDate = optionalDate(raw, "releaseDate");
  const eol = optionalDateOrFlag(raw, "eol");
  const support = optionalDateOrFlag(raw, "support");
  const eoas = optionalDateOrFlag(raw, "eoas");
  const discontinued = optionalDateOrFlag(raw, "discontinued");
  const lts = optionalDateOrFlag(raw, "lts");
  return {
    cycle,
    ...(releaseDate === undefined ? {} : { releaseDate }),
    ...(eol === undefined ? {} : { eol }),
    ...(support === undefined ? {} : { support }),
    ...(eoas === undefined ? {} : { eoas }),
    ...(discontinued === undefined ? {} : { discontinued }),
    ...(lts === undefined ? {} : { lts }),
  };
}

/** Reads and validates the committed snapshot. Throws a message that names the malformed field. */
export async function loadSnapshot(path: string): Promise<Snapshot> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(parsed)) throw new Error("snapshot: root must be an object");
  if (parsed.schemaVersion !== SNAPSHOT_SCHEMA) {
    throw new Error(`snapshot: schemaVersion must be "${SNAPSHOT_SCHEMA}"`);
  }
  const retrievedAt = requiredString(parsed, "retrievedAt");
  if (!ISO_DATE.test(retrievedAt)) throw new Error("snapshot: retrievedAt must be a YYYY-MM-DD date");
  if (!isRecord(parsed.source)) throw new Error("snapshot: source must be an object");
  const source: SnapshotSource = {
    homepage: requiredString(parsed.source, "homepage"),
    catalog: requiredString(parsed.source, "catalog"),
    cycles: requiredString(parsed.source, "cycles"),
    license: requiredString(parsed.source, "license"),
    licenseUrl: requiredString(parsed.source, "licenseUrl"),
    note: requiredString(parsed.source, "note"),
  };
  if (!Array.isArray(parsed.catalog) || parsed.catalog.some((name) => typeof name !== "string")) {
    throw new Error("snapshot: catalog must be an array of product names");
  }
  if (!isRecord(parsed.products)) throw new Error("snapshot: products must be an object");
  const products: Record<string, SnapshotCycle[]> = {};
  for (const [product, cycles] of Object.entries(parsed.products)) {
    if (!Array.isArray(cycles)) throw new Error(`snapshot: cycles of "${product}" must be an array`);
    products[product] = cycles.map((cycle) => parseCycle(cycle, product));
  }
  return { schemaVersion: SNAPSHOT_SCHEMA, retrievedAt, source, catalog: parsed.catalog, products };
}

/** A snapshot date, or undefined when the field is absent or a boolean flag. */
export function isoDate(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && ISO_DATE.test(value) ? value : undefined;
}

/**
 * The endoflife.date date a rule's event maps to.
 *
 * `end-of-support` reads `support` and falls back to `eol` for products that publish only one boundary.
 * AWS Lambda deprecation dates are published as `support`, which is the date Evergreen records.
 */
export function lifecycleDate(cycle: SnapshotCycle, product: string, event: string): string | undefined {
  const eol = isoDate(cycle.eol);
  const support = isoDate(cycle.support);
  if (product === "aws-lambda") return support ?? eol;
  if (event === "end-of-support") return support ?? eol;
  return eol;
}

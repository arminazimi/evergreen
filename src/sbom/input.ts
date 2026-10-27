import { readFile } from "node:fs/promises";

import { checkDependency } from "../check-dependency.js";
import type { DependencyCheck } from "../check-dependency.js";
import { parsePurl } from "../purl.js";
import { CycloneDxError } from "./cyclonedx.js";

type JsonObject = Record<string, unknown>;

export interface SbomComponentCheck extends DependencyCheck {
  /** JSON Pointer to the component or external reference in the input BOM. */
  location: string;
  bomRef?: string;
  spdxId?: string;
}

export class SpdxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpdxError";
  }
}

function object(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Check CycloneDX JSON components using the offline dependency API. Components without
 * PURLs are skipped; no-data and version-dependent results remain explicit.
 * Results follow document order, including nested and metadata components.
 */
export async function scanCycloneDx(input: unknown): Promise<SbomComponentCheck[]> {
  if (!object(input) || input.bomFormat !== "CycloneDX" || typeof input.specVersion !== "string" ||
    !["1.3", "1.4", "1.5", "1.6"].includes(input.specVersion)) {
    throw new CycloneDxError("Expected a CycloneDX JSON BOM with specVersion 1.3, 1.4, 1.5 or 1.6.");
  }

  const pending: Array<{ value: unknown; location: string }> = [];
  function children(parent: JsonObject, location: string): void {
    if (parent.components === undefined) return;
    if (!Array.isArray(parent.components)) {
      throw new CycloneDxError(`CycloneDX ${location}/components must be an array of objects.`);
    }
    for (let index = parent.components.length - 1; index >= 0; index--) {
      pending.push({ value: parent.components[index], location: `${location}/components/${index}` });
    }
  }

  if (input.metadata !== undefined) {
    if (!object(input.metadata)) throw new CycloneDxError("CycloneDX metadata must be an object.");
    if (input.metadata.component !== undefined) {
      pending.push({ value: input.metadata.component, location: "/metadata/component" });
    }
  }
  children(input, "");

  const results: SbomComponentCheck[] = [];
  while (pending.length > 0) {
    const { value, location } = pending.pop()!;
    if (!object(value)) throw new CycloneDxError(`CycloneDX ${location} must be an object.`);
    children(value, location);
    if (value.purl === undefined) continue;
    if (typeof value.purl !== "string" ||
      (value.version !== undefined && typeof value.version !== "string") ||
      (value["bom-ref"] !== undefined && typeof value["bom-ref"] !== "string")) {
      throw new CycloneDxError(`CycloneDX ${location} purl, version and bom-ref must be strings.`);
    }
    try {
      // An explicit PURL version takes precedence over the component's version field.
      const version = parsePurl(value.purl).version ?? value.version;
      const check = await checkDependency({ purl: value.purl,
        ...(typeof version === "string" && version ? { version } : {}) });
      results.push({ ...check, location,
        ...(typeof value["bom-ref"] === "string" ? { bomRef: value["bom-ref"] } : {}) });
    } catch (error) {
      throw new CycloneDxError(`Cannot check CycloneDX ${location}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return results;
}

/** Read a local CycloneDX JSON file without changing it or accessing the network. */
export async function scanCycloneDxFile(path: string): Promise<SbomComponentCheck[]> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new CycloneDxError(`Cannot read CycloneDX BOM ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return scanCycloneDx(input);
}

/**
 * Check SPDX 2.3 JSON package external references of type purl using the offline dependency
 * API. Packages and references without PURLs are skipped; no-data and version-dependent
 * results remain explicit. Results follow document order.
 */
export async function scanSpdx(input: unknown): Promise<SbomComponentCheck[]> {
  if (!object(input) || input.spdxVersion !== "SPDX-2.3") {
    throw new SpdxError('Expected an SPDX JSON document with spdxVersion "SPDX-2.3".');
  }

  const results: SbomComponentCheck[] = [];
  if (input.packages === undefined) return results;
  if (!Array.isArray(input.packages)) throw new SpdxError("SPDX packages must be an array of objects.");
  for (const [index, pkg] of input.packages.entries()) {
    const location = `/packages/${index}`;
    if (!object(pkg)) throw new SpdxError(`SPDX ${location} must be an object.`);
    if (pkg.externalRefs === undefined) continue;
    if (!Array.isArray(pkg.externalRefs)) {
      throw new SpdxError(`SPDX ${location}/externalRefs must be an array of objects.`);
    }
    if ((pkg.versionInfo !== undefined && typeof pkg.versionInfo !== "string") ||
      (pkg["SPDXID"] !== undefined && typeof pkg["SPDXID"] !== "string")) {
      throw new SpdxError(`SPDX ${location} SPDXID and versionInfo must be strings.`);
    }
    for (const [referenceIndex, reference] of pkg.externalRefs.entries()) {
      const referenceLocation = `${location}/externalRefs/${referenceIndex}`;
      if (!object(reference)) throw new SpdxError(`SPDX ${referenceLocation} must be an object.`);
      if (typeof reference.referenceType !== "string") {
        throw new SpdxError(`SPDX ${referenceLocation} referenceType must be a string.`);
      }
      if (reference.referenceType.toLowerCase() !== "purl") continue;
      if (typeof reference.referenceLocator !== "string") {
        throw new SpdxError(`SPDX ${referenceLocation} referenceLocator must be a string.`);
      }
      try {
        // An explicit PURL version takes precedence over the package's versionInfo field.
        const version = parsePurl(reference.referenceLocator).version ?? pkg.versionInfo;
        const check = await checkDependency({ purl: reference.referenceLocator,
          ...(typeof version === "string" && version ? { version } : {}) });
        results.push({ ...check, location: referenceLocation,
          ...(typeof pkg["SPDXID"] === "string" ? { spdxId: pkg["SPDXID"] } : {}) });
      } catch (error) {
        throw new SpdxError(`Cannot check SPDX ${referenceLocation}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return results;
}

/** Read a local SPDX JSON document without changing it or accessing the network. */
export async function scanSpdxFile(path: string): Promise<SbomComponentCheck[]> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new SpdxError(`Cannot read SPDX document ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return scanSpdx(input);
}

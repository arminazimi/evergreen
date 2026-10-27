import { readFile } from "node:fs/promises";

import { checkDependency } from "../check-dependency.js";
import type { DependencyCheck } from "../check-dependency.js";
import { parsePurl } from "../purl.js";
import { CycloneDxError } from "./cyclonedx.js";

type JsonObject = Record<string, unknown>;

export interface SbomComponentCheck extends DependencyCheck {
  /** JSON Pointer to the component in the input BOM. */
  location: string;
  bomRef?: string;
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

import { readFile } from "node:fs/promises";

import { checkAgainst } from "../check-dependency.js";
import { BUNDLED_ECOSYSTEMS } from "../data-bundle.js";
import { getActiveData } from "../data-source.js";
import type { ActiveData } from "../data-source.js";
import { parsePurl } from "../purl.js";
import { validateRegistryV2 } from "../registry.js";
import type { RegistryV2Rule } from "../registry.js";
import "../vers/index.js";

type JsonObject = Record<string, unknown>;

export class CycloneDxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CycloneDxError";
  }
}

function object(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Official names: https://cyclonedx.github.io/cyclonedx-property-taxonomy/cdx/lifecycle.html */
const milestones: Partial<Record<RegistryV2Rule["event"], string>> = {
  "end-of-support": "cdx:lifecycle:milestone:endOfSupport",
  "end-of-life": "cdx:lifecycle:milestone:endOfLife",
  "scheduled-end-of-life": "cdx:lifecycle:milestone:endOfLife",
};

/**
 * Enrich a copy, preserving every existing field and array entry. PURL identity and VERS
 * matching use the same offline rules as dependency checks. Undated, symbol-only and
 * version-dependent claims cannot establish a component milestone and are omitted.
 */
export function enrichCycloneDx(input: unknown, rules: readonly RegistryV2Rule[]): JsonObject {
  if (!object(input) || input.bomFormat !== "CycloneDX" || typeof input.specVersion !== "string" ||
    !["1.3", "1.4", "1.5", "1.6"].includes(input.specVersion)) {
    throw new CycloneDxError("Expected a CycloneDX JSON BOM with specVersion 1.3, 1.4, 1.5 or 1.6.");
  }
  const bom = structuredClone(input);
  const candidates = rules.filter((rule) => rule.deadline && milestones[rule.event] &&
    !rule.usage?.some((usage) => usage.kind === "symbol")).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  function entries(parent: JsonObject, key: string): JsonObject[] {
    const value = parent[key];
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every(object)) {
      throw new CycloneDxError(`CycloneDX ${key} must be an array of objects.`);
    }
    return value;
  }

  function component(value: unknown): void {
    if (!object(value)) throw new CycloneDxError("CycloneDX component must be an object.");
    const children = entries(value, "components");
    const properties = entries(value, "properties");
    const references = entries(value, "externalReferences");
    if (value.purl !== undefined) {
      if (typeof value.purl !== "string" || (value.version !== undefined && typeof value.version !== "string")) {
        throw new CycloneDxError("CycloneDX component purl and version must be strings.");
      }
      let result;
      try {
        const version = parsePurl(value.purl).version ?? value.version;
        result = checkAgainst(candidates, { purl: value.purl,
          ...(typeof version === "string" && version ? { version } : {}) });
      } catch (error) {
        throw new CycloneDxError(`Cannot match component ${value.purl}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (result.status === "affected") {
        for (const finding of result.findings) {
          const name = milestones[finding.event]!;
          if (!properties.some((property) => property.name === name && property.value === finding.deadline)) {
            properties.push({ name, value: finding.deadline! });
          }
          for (const source of finding.sources) {
            if (!references.some((reference) => reference.url === source.url)) {
              references.push({ type: "documentation", url: source.url, comment: source.title });
            }
          }
        }
        value.properties = properties;
        if (references.length > 0) value.externalReferences = references;
      }
    }
    for (const child of children) component(child);
  }

  for (const value of entries(bom, "components")) component(value);
  if (bom.metadata !== undefined) {
    if (!object(bom.metadata)) throw new CycloneDxError("CycloneDX metadata must be an object.");
    if (bom.metadata.component !== undefined) component(bom.metadata.component);
  }
  return bom;
}

/** Reads local JSON and the active (optionally pinned) lifecycle data; never writes the input. */
export async function enrichCycloneDxFile(path: string, data?: ActiveData): Promise<JsonObject> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new CycloneDxError(`Cannot read CycloneDX BOM ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const active = data ?? await getActiveData();
  const registries = await Promise.all(BUNDLED_ECOSYSTEMS.map(async (ecosystem) =>
    validateRegistryV2(await active.read(`registry/${ecosystem}.json`))));
  return enrichCycloneDx(input, registries.flatMap((registry) => registry.rules));
}

import { readFile } from "node:fs/promises";

import { checkAgainst } from "../check-dependency.js";
import type { DependencyFinding } from "../check-dependency.js";
import { BUNDLED_ECOSYSTEMS } from "../data-bundle.js";
import { getActiveData } from "../data-source.js";
import type { ActiveData } from "../data-source.js";
import { parsePurl } from "../purl.js";
import { validateRegistryV2 } from "../registry.js";
import type { RegistryV2Rule } from "../registry.js";
import { required } from "../required.js";
import "../vers/index.js";
import { EvergreenError } from "../evergreen-error.js";

type JsonObject = Record<string, unknown>;

export class CycloneDxError extends EvergreenError {
  constructor(message: string) {
    super("invalid-sbom", message);
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
  if (
    !object(input) ||
    input.bomFormat !== "CycloneDX" ||
    typeof input.specVersion !== "string" ||
    !["1.3", "1.4", "1.5", "1.6"].includes(input.specVersion)
  ) {
    throw new CycloneDxError("Expected a CycloneDX JSON BOM with specVersion 1.3, 1.4, 1.5 or 1.6.");
  }
  const bom = structuredClone(input);
  const candidates = milestoneCandidates(rules);

  for (const value of entries(bom, "components")) enrichComponent(value, candidates);
  if (bom.metadata !== undefined) {
    if (!object(bom.metadata)) throw new CycloneDxError("CycloneDX metadata must be an object.");
    if (bom.metadata.component !== undefined) enrichComponent(bom.metadata.component, candidates);
  }
  return bom;
}

/** Rules that can establish a dated, version-independent component milestone, in stable id order. */
function milestoneCandidates(rules: readonly RegistryV2Rule[]): RegistryV2Rule[] {
  return rules
    .filter((rule) => rule.deadline && milestones[rule.event] && !rule.usage?.some((usage) => usage.kind === "symbol"))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function entries(parent: JsonObject, key: string): JsonObject[] {
  const value = parent[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(object)) {
    throw new CycloneDxError(`CycloneDX ${key} must be an array of objects.`);
  }
  return value;
}

/** Enriches a component and, depth first, its nested components. */
function enrichComponent(value: unknown, candidates: readonly RegistryV2Rule[]): void {
  if (!object(value)) throw new CycloneDxError("CycloneDX component must be an object.");
  const children = entries(value, "components");
  const properties = entries(value, "properties");
  const references = entries(value, "externalReferences");
  if (value.purl !== undefined) enrichPurlComponent(value, value.purl, properties, references, candidates);
  for (const child of children) enrichComponent(child, candidates);
}

function enrichPurlComponent(
  value: JsonObject,
  purl: unknown,
  properties: JsonObject[],
  references: JsonObject[],
  candidates: readonly RegistryV2Rule[],
): void {
  if (typeof purl !== "string" || (value.version !== undefined && typeof value.version !== "string")) {
    throw new CycloneDxError("CycloneDX component purl and version must be strings.");
  }
  const result = checkComponentPurl(purl, value.version, candidates);
  if (result.status !== "affected") return;

  for (const finding of result.findings) {
    addMilestoneProperty(properties, finding);
    addEvidenceReferences(references, finding);
  }
  value.properties = properties;
  if (references.length > 0) value.externalReferences = references;
}

function checkComponentPurl(
  purl: string,
  version: unknown,
  candidates: readonly RegistryV2Rule[],
): ReturnType<typeof checkAgainst> {
  try {
    const resolved = parsePurl(purl).version ?? version;
    return checkAgainst(candidates, {
      purl,
      ...(typeof resolved === "string" && resolved ? { version: resolved } : {}),
    });
  } catch (error) {
    throw new CycloneDxError(
      `Cannot match component ${purl}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Adds the milestone property unless the same name and deadline are already present. */
function addMilestoneProperty(properties: JsonObject[], finding: DependencyFinding): void {
  const name = required(milestones[finding.event], "the milestone");
  if (properties.some((property) => property.name === name && property.value === finding.deadline)) return;
  properties.push({ name, value: required(finding.deadline, "the deadline") });
}

/** Adds one documentation reference per source URL not already present. */
function addEvidenceReferences(references: JsonObject[], finding: DependencyFinding): void {
  for (const source of finding.sources) {
    if (references.some((reference) => reference.url === source.url)) continue;
    references.push({ type: "documentation", url: source.url, comment: source.title });
  }
}

/** Reads local JSON and the active (optionally pinned) lifecycle data; never writes the input. */
export async function enrichCycloneDxFile(path: string, data?: ActiveData): Promise<JsonObject> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new CycloneDxError(
      `Cannot read CycloneDX BOM ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const active = data ?? (await getActiveData());
  const registries = await Promise.all(
    BUNDLED_ECOSYSTEMS.map(async (ecosystem) => validateRegistryV2(await active.read(`registry/${ecosystem}.json`))),
  );
  return enrichCycloneDx(
    input,
    registries.flatMap((registry) => registry.rules),
  );
}

import { readFile } from "node:fs/promises";

import { checkAgainst } from "../check-dependency.js";
import type { DependencyFinding } from "../check-dependency.js";
import { BUNDLED_ECOSYSTEMS } from "@velella/ebb/data-bundle";
import { getActiveData } from "@velella/ebb/data-source";
import type { ActiveData } from "@velella/ebb/data-source";
import { parsePurl } from "@velella/ebb/purl";
import { validateRegistryV2 } from "@velella/ebb/registry";
import type { RegistryV2Rule } from "@velella/ebb/registry";
import { required } from "../required.js";
import "@velella/ebb/vers/index";
import { EvergreenError } from "../evergreen-error.js";

type JsonObject = Record<string, unknown>;

export class SpdxError extends EvergreenError {
  constructor(message: string) {
    super("invalid-sbom", message);
    this.name = "SpdxError";
  }
}

function object(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Milestone labels written into annotation comments; same lifecycle events as CycloneDX enrich. */
const milestones: Partial<Record<RegistryV2Rule["event"], string>> = {
  "end-of-support": "endOfSupport",
  "end-of-life": "endOfLife",
  "scheduled-end-of-life": "endOfLife",
};

const ANNOTATOR = "Tool: evergreen";
const EVIDENCE_TYPE = "documentation";

/** Structured comment so re-enrichment can recognise Evergreen milestones without a clock. */
function milestoneComment(milestone: string, deadline: string): string {
  return `evergreen:lifecycle:milestone:${milestone}:${deadline}`;
}

/**
 * Enrich a copy, preserving every existing field and array entry. PURL identity and VERS
 * matching use the same offline rules as dependency checks. Undated, symbol-only and
 * version-dependent claims cannot establish a package milestone and are omitted.
 * Lifecycle facts are package annotations; evidence URLs are OTHER externalRefs.
 */
export function enrichSpdx(input: unknown, rules: readonly RegistryV2Rule[]): JsonObject {
  if (!object(input) || input.spdxVersion !== "SPDX-2.3") {
    throw new SpdxError('Expected an SPDX JSON document with spdxVersion "SPDX-2.3".');
  }
  const document = structuredClone(input);
  const candidates = milestoneCandidates(rules);

  if (document.packages === undefined) return document;
  if (!Array.isArray(document.packages) || !document.packages.every(object)) {
    throw new SpdxError("SPDX packages must be an array of objects.");
  }
  for (const [index, pkg] of document.packages.entries()) {
    enrichPackage(pkg, `/packages/${index}`, candidates);
  }
  return document;
}

/** Rules that can establish a dated, version-independent package milestone, in stable id order. */
function milestoneCandidates(rules: readonly RegistryV2Rule[]): RegistryV2Rule[] {
  return rules
    .filter((rule) => rule.deadline && milestones[rule.event] && !rule.usage?.some((usage) => usage.kind === "symbol"))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function enrichPackage(pkg: JsonObject, location: string, candidates: readonly RegistryV2Rule[]): void {
  assertPackageFields(pkg, location);
  const annotations = entries(pkg, "annotations", location);
  const externalRefs = entries(pkg, "externalRefs", location);
  let changed = false;

  for (const [referenceIndex, reference] of externalRefs.entries()) {
    const findings = purlFindings(reference, `${location}/externalRefs/${referenceIndex}`, pkg, candidates);
    for (const finding of findings) {
      if (addMilestoneAnnotation(annotations, finding)) changed = true;
      if (addEvidenceReferences(externalRefs, finding)) changed = true;
    }
  }

  if (changed) {
    pkg.annotations = annotations;
    pkg.externalRefs = externalRefs;
  }
}

function assertPackageFields(pkg: JsonObject, location: string): void {
  if (
    (pkg.versionInfo !== undefined && typeof pkg.versionInfo !== "string") ||
    (pkg["SPDXID"] !== undefined && typeof pkg["SPDXID"] !== "string")
  ) {
    throw new SpdxError(`SPDX ${location} SPDXID and versionInfo must be strings.`);
  }
}

/** Findings for one external reference; only PURL references with a string locator are matched. */
function purlFindings(
  reference: JsonObject,
  location: string,
  pkg: JsonObject,
  candidates: readonly RegistryV2Rule[],
): DependencyFinding[] {
  if (typeof reference.referenceType !== "string") {
    throw new SpdxError(`SPDX ${location} referenceType must be a string.`);
  }
  if (reference.referenceType.toLowerCase() !== "purl") return [];
  if (typeof reference.referenceLocator !== "string") {
    throw new SpdxError(`SPDX ${location} referenceLocator must be a string.`);
  }

  let result;
  try {
    const version = parsePurl(reference.referenceLocator).version ?? pkg.versionInfo;
    result = checkAgainst(candidates, {
      purl: reference.referenceLocator,
      ...(typeof version === "string" && version ? { version } : {}),
    });
  } catch (error) {
    throw new SpdxError(
      `Cannot match package ${reference.referenceLocator}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return result.status === "affected" ? result.findings : [];
}

/** Adds the milestone annotation unless an identical one is present; returns whether it was added. */
function addMilestoneAnnotation(annotations: JsonObject[], finding: DependencyFinding): boolean {
  const milestone = required(milestones[finding.event], "the milestone");
  const comment = milestoneComment(milestone, required(finding.deadline, "the deadline"));
  if (annotations.some((annotation) => annotation.comment === comment)) return false;
  annotations.push({
    annotationDate: `${required(finding.deadline, "the deadline")}T00:00:00Z`,
    annotationType: "OTHER",
    annotator: ANNOTATOR,
    comment,
  });
  return true;
}

/** Adds one evidence reference per source URL not already present; returns whether any was added. */
function addEvidenceReferences(externalRefs: JsonObject[], finding: DependencyFinding): boolean {
  let changed = false;
  for (const source of finding.sources) {
    if (externalRefs.some((ref) => ref.referenceLocator === source.url)) continue;
    externalRefs.push({
      referenceCategory: "OTHER",
      referenceType: EVIDENCE_TYPE,
      referenceLocator: source.url,
      comment: source.title,
    });
    changed = true;
  }
  return changed;
}

function entries(parent: JsonObject, key: string, location: string): JsonObject[] {
  const value = parent[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(object)) {
    throw new SpdxError(`SPDX ${location}/${key} must be an array of objects.`);
  }
  return value;
}

/** Reads local JSON and the active (optionally pinned) lifecycle data; never writes the input. */
export async function enrichSpdxFile(path: string, data?: ActiveData): Promise<JsonObject> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new SpdxError(`Cannot read SPDX document ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const active = data ?? (await getActiveData());
  const registries = await Promise.all(
    BUNDLED_ECOSYSTEMS.map(async (ecosystem) => validateRegistryV2(await active.read(`registry/${ecosystem}.json`))),
  );
  return enrichSpdx(
    input,
    registries.flatMap((registry) => registry.rules),
  );
}

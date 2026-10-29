import type { Finding } from "../domain.js";
import { exposureFromUsage } from "../exposure.js";
import type { ExposureResult } from "../exposure.js";
import { VERSION } from "../version.js";

type JsonObject = Record<string, unknown>;

/** Property name for each evidence location on a VEX vulnerability statement. */
export const VEX_EVIDENCE_LOCATION_PROPERTY = "evergreen:evidence:location";

export interface ExportVexOptions {
  /** RFC-3339 timestamp written to `metadata.timestamp`. Omit for a timestamp-free document. */
  timestamp?: string;
  /** `urn:uuid:…` serial number. Omit when the caller does not need one. */
  serialNumber?: string;
}

function formatLocation(location: { path: string; line?: number }): string {
  return location.line === undefined ? location.path : `${location.path}:${location.line}`;
}

function vulnerabilityIds(finding: Finding): string[] {
  if (finding.advisoryIds !== undefined && finding.advisoryIds.length > 0) {
    return [...new Set(finding.advisoryIds)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  }
  return [`evergreen:${finding.ruleId}`];
}

function analysis(result: ExposureResult): JsonObject {
  return {
    state: result.state,
    ...(result.justification !== undefined ? { justification: result.justification } : {}),
    detail: result.detail,
  };
}

function statement(finding: Finding, id: string, result: ExposureResult): JsonObject {
  const source = finding.sources[0];
  return {
    "bom-ref": `${finding.id}:${id}`,
    id,
    ...(source !== undefined ? { source: { name: source.title, url: source.url } } : {}),
    description: finding.summary,
    ...(finding.replacement !== undefined ? { recommendation: `Replace with ${finding.replacement}.` } : {}),
    analysis: analysis(result),
    affects: [{ ref: finding.id }],
    properties: result.locations.map((location) => ({
      name: VEX_EVIDENCE_LOCATION_PROPERTY,
      value: `${location.role}:${formatLocation(location)}`,
    })),
  };
}

/**
 * Build a CycloneDX 1.5 VEX document from scan findings. Each finding becomes one or more vulnerability
 * statements (one per OSV advisory id, or `evergreen:<ruleId>` when none apply). Analysis state comes from
 * {@link exposureFromUsage}; every evidence location is listed in `analysis.detail` and as
 * `evergreen:evidence:location` properties. Deterministic: findings are sorted by id, then advisory id.
 * Never contacts the network.
 */
export function exportVex(findings: readonly Finding[], options: ExportVexOptions = {}): JsonObject {
  const sorted = [...findings].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const vulnerabilities = sorted.flatMap((finding) => {
    const result = exposureFromUsage(finding);
    return vulnerabilityIds(finding).map((id) => statement(finding, id, result));
  });

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    ...(options.serialNumber !== undefined ? { serialNumber: options.serialNumber } : {}),
    metadata: {
      ...(options.timestamp !== undefined ? { timestamp: options.timestamp } : {}),
      tools: {
        components: [{
          type: "application",
          name: "evergreen",
          version: VERSION,
          "bom-ref": "evergreen",
        }],
      },
    },
    vulnerabilities,
  };
}

import type { ScaffoldNames } from "../names.js";

/** `src/detectors/<id>.ts`: a detector that compiles, passes conformance, and reports nothing yet. */
export function detectorTemplate(names: ScaffoldNames): string {
  return `import { defineDetector, DETECTOR_API_VERSION } from "../sdk.js";
import type { DetectorFinding } from "../sdk.js";

/**
 * ${names.title} lifecycle detector.
 *
 * Next steps (see docs/DETECTORS.md and docs/detectors/${names.id}.md):
 *   1. Find and parse the declarations of ${names.ecosystem} projects (manifests, lock files, version files).
 *   2. Write rules in registry/${names.id}.json (docs/RULES.md); every rule needs authoritative evidence.
 *   3. Match declarations against the rules and return one finding per affected declaration, with an exact
 *      repository-relative path and line.
 *
 * Detectors must be deterministic, must treat repository contents as untrusted, and must not use the network.
 */
export const ${names.camel}Detector = defineDetector({
  apiVersion: DETECTOR_API_VERSION,
  id: "${names.id}",
  async scan(): Promise<DetectorFinding[]> {
    return [];
  },
});
`;
}

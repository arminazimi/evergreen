import { capabilities } from "./capabilities/capabilities/index.js";
import { ecosystems } from "./capabilities/ecosystems/index.js";
import { assembleCapabilityManifest } from "./capabilities/manifest.js";
import { capabilityManifestSchema } from "./capabilities/schema.js";
import { surfaces } from "./capabilities/surfaces/index.js";
import type { CapabilityManifest } from "./capabilities/schema.js";

export { MANIFEST_EXCLUDED_DETECTOR_IDS } from "./capabilities/constants.js";
export { capabilityManifestSchema } from "./capabilities/schema.js";
export type { Capability, CapabilityManifest, CapabilitySurface } from "./capabilities/schema.js";

/**
 * The manifest is assembled from one file per ecosystem, capability, and surface under
 * `src/capabilities/`. Adding an item adds its file and one line to that kind's index; the
 * assembly below and every consumer stay untouched.
 */
const manifest = assembleCapabilityManifest({ ecosystems, capabilities, surfaces });

export function getCapabilityManifest(): CapabilityManifest {
  return capabilityManifestSchema.parse(manifest);
}

export function renderCapabilitiesText(value: CapabilityManifest): string {
  const lines = [
    `Evergreen capabilities ${value.manifestVersion}`,
    `Product version: ${value.product.version}`,
    "",
    "Surfaces:",
    ...value.surfaces.map(
      (surface) => `- ${surface.id}: ${surface.status} (${surface.capabilityIds.length} capabilities)`,
    ),
    "",
    "Capabilities:",
    ...value.capabilities.map((capability) => `- ${capability.id}: ${capability.status}`),
    "",
    "Unlisted capability and ecosystem identifiers are unsupported.",
  ];
  return lines.join("\n");
}

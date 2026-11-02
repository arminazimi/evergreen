import { VERSION } from "../version.js";
import { manifestIdentity } from "./identity.js";
import { capabilityManifestSchema } from "./schema.js";
import type { Capability, CapabilityManifest, CapabilitySurface, ManifestEcosystem } from "./schema.js";

/** The per-item lists an assembled manifest is built from, in manifest order. */
export interface CapabilityManifestParts {
  ecosystems: readonly ManifestEcosystem[];
  capabilities: readonly Capability[];
  surfaces: readonly CapabilitySurface[];
}

/**
 * Assembles the manifest from its per-item files. The order of each part is the order of its
 * index, so the output is stable, and the schema rejects an item that is malformed or that
 * references an unlisted identifier. Adding an item never changes this function.
 */
export function assembleCapabilityManifest(parts: CapabilityManifestParts): CapabilityManifest {
  return capabilityManifestSchema.parse({
    ...manifestIdentity,
    product: { ...manifestIdentity.product, version: VERSION },
    ecosystems: parts.ecosystems,
    capabilities: parts.capabilities,
    surfaces: parts.surfaces,
  });
}

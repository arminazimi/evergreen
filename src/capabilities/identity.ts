/**
 * The manifest fields that every Evergreen release shares. Ecosystem, capability, and surface
 * items live one per file next to this one, so adding an item never edits a shared list.
 */
export const manifestIdentity = {
  schemaVersion: "evergreen.capabilities.v1",
  manifestVersion: "1.9.0",
  product: {
    name: "Evergreen",
    package: "evergreen-deprecation",
  },
  compatibility: {
    node: ">=22",
    schemaMajor: 1,
    unknownFields: "ignore",
    unknownCapabilityIds: "ignore",
    unknownSurfaceIds: "ignore",
    unlistedCapabilities: "unsupported",
    unlistedEcosystems: "unsupported",
    unknownSchemaMajor: "reject",
  },
} as const;

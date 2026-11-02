import * as z from "zod/v4";

const supportStatusSchema = z.enum(["supported", "experimental", "unsupported"]);
const maturityLevelSchema = z.enum(["experimental", "beta", "stable"]);
const surfaceKindSchema = z.enum(["cli", "mcp", "skill", "plugin", "ci"]);

const capabilitySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/),
  status: supportStatusSchema,
  version: z.string().min(1),
  description: z.string().min(1),
  ecosystems: z.array(z.string().min(1)),
});

const surfaceSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/),
  kind: surfaceKindSchema,
  status: supportStatusSchema,
  version: z.string().min(1),
  entryPoints: z.array(z.string().min(1)).min(1),
  capabilityIds: z.array(z.string().min(1)).min(1),
});

export const capabilityManifestSchema = z.object({
  schemaVersion: z.literal("evergreen.capabilities.v1"),
  manifestVersion: z.string().regex(/^1\.[0-9]+\.[0-9]+$/),
  product: z.object({
    name: z.literal("Evergreen"),
    package: z.literal("evergreen-deprecation"),
    version: z.string().min(1),
  }),
  compatibility: z.object({
    node: z.string().min(1),
    schemaMajor: z.literal(1),
    unknownFields: z.literal("ignore"),
    unknownCapabilityIds: z.literal("ignore"),
    unknownSurfaceIds: z.literal("ignore"),
    unlistedCapabilities: z.literal("unsupported"),
    unlistedEcosystems: z.literal("unsupported"),
    unknownSchemaMajor: z.literal("reject"),
  }),
  ecosystems: z.array(z.object({
    id: z.string().min(1),
    status: supportStatusSchema,
    // The lowest `level` among the detectors in `detectorIds` (decision 0013); an ecosystem served by
    // several detectors is only as mature as its least mature detector. Optional so the exported schema
    // still parses a 1.0.0 manifest, which predates the field; Evergreen's own manifest always sets it.
    maturity: maturityLevelSchema.optional(),
    detectorIds: z.array(z.string().min(1)),
  })),
  capabilities: z.array(capabilitySchema),
  surfaces: z.array(surfaceSchema),
});

export type CapabilityManifest = z.infer<typeof capabilityManifestSchema>;
export type Capability = CapabilityManifest["capabilities"][number];
export type CapabilitySurface = CapabilityManifest["surfaces"][number];
export type ManifestEcosystem = CapabilityManifest["ecosystems"][number];

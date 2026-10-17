import * as z from "zod/v4";

import { VERSION } from "./version.js";

const supportStatusSchema = z.enum(["supported", "experimental", "unsupported"]);
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
    detectorIds: z.array(z.string().min(1)),
  })),
  capabilities: z.array(capabilitySchema),
  surfaces: z.array(surfaceSchema),
});

export type CapabilityManifest = z.infer<typeof capabilityManifestSchema>;
export type Capability = CapabilityManifest["capabilities"][number];
export type CapabilitySurface = CapabilityManifest["surfaces"][number];

const workflowCapabilityIds = [
  "repository.scan",
  "deprecation.list",
  "deprecation.explain",
  "migration.context.create",
  "migration.verify",
] as const;

const manifest = {
  schemaVersion: "evergreen.capabilities.v1",
  manifestVersion: "1.0.0",
  product: {
    name: "Evergreen",
    package: "evergreen-deprecation",
    version: VERSION,
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
  ecosystems: [
    { id: "container", status: "experimental", detectorIds: ["container"] },
    { id: "github-actions", status: "supported", detectorIds: ["github-actions"] },
    { id: "go", status: "experimental", detectorIds: ["go"] },
    { id: "kubernetes", status: "experimental", detectorIds: ["kubernetes"] },
    { id: "nodejs", status: "supported", detectorIds: ["npm"] },
    { id: "npm", status: "supported", detectorIds: ["npm"] },
    { id: "python", status: "supported", detectorIds: ["python"] },
  ],
  capabilities: [
    {
      id: "repository.scan",
      status: "supported",
      version: "1",
      description: "Scan a local repository with all built-in lifecycle detectors.",
      ecosystems: ["container", "github-actions", "go", "kubernetes", "nodejs", "npm", "python"],
    },
    {
      id: "deprecation.list",
      status: "supported",
      version: "1",
      description: "List compact lifecycle findings from a fresh local scan.",
      ecosystems: ["container", "github-actions", "go", "kubernetes", "nodejs", "npm", "python"],
    },
    {
      id: "deprecation.explain",
      status: "supported",
      version: "1",
      description: "Explain one evidence-backed finding by its exact identifier.",
      ecosystems: ["container", "github-actions", "go", "kubernetes", "nodejs", "npm", "python"],
    },
    {
      id: "migration.context.create",
      status: "supported",
      version: "1",
      description: "Create a validated migration packet for one finding.",
      ecosystems: ["container", "github-actions", "go", "kubernetes", "nodejs", "npm", "python"],
    },
    {
      id: "migration.verify",
      status: "supported",
      version: "1",
      description: "Re-scan and verify that an observed finding is absent.",
      ecosystems: ["container", "github-actions", "go", "kubernetes", "nodejs", "npm", "python"],
    },
    {
      id: "environment.doctor",
      status: "supported",
      version: "1",
      description: "Diagnose local and CI prerequisites without changing configuration.",
      ecosystems: [],
    },
    {
      id: "repository.remote-scan",
      status: "unsupported",
      version: "1",
      description: "Upload a repository to a hosted Evergreen scanner.",
      ecosystems: [],
    },
    {
      id: "migration.execute",
      status: "unsupported",
      version: "1",
      description: "Execute migration edits or suggested verification commands automatically.",
      ecosystems: [],
    },
  ],
  surfaces: [
    {
      id: "cli",
      kind: "cli",
      status: "supported",
      version: VERSION,
      entryPoints: ["evergreen"],
      capabilityIds: [
        "repository.scan",
        "deprecation.list",
        "deprecation.explain",
        "migration.context.create",
        "environment.doctor",
      ],
    },
    {
      id: "mcp",
      kind: "mcp",
      status: "supported",
      version: VERSION,
      entryPoints: ["evergreen-mcp"],
      capabilityIds: [...workflowCapabilityIds],
    },
    {
      id: "skill",
      kind: "skill",
      status: "supported",
      version: "1",
      entryPoints: ["skills/evergreen-deprecation/SKILL.md"],
      capabilityIds: [...workflowCapabilityIds],
    },
    {
      id: "plugin",
      kind: "plugin",
      status: "experimental",
      version: "0",
      entryPoints: ["evergreen-mcp", "skills/evergreen-deprecation/SKILL.md"],
      capabilityIds: [...workflowCapabilityIds],
    },
    {
      id: "ci.github-actions",
      kind: "ci",
      status: "supported",
      version: VERSION,
      entryPoints: ["action.yml", "evergreen"],
      capabilityIds: ["repository.scan", "environment.doctor"],
    },
    {
      id: "ci.gitlab",
      kind: "ci",
      status: "experimental",
      version: VERSION,
      entryPoints: ["evergreen"],
      capabilityIds: ["repository.scan", "environment.doctor"],
    },
  ],
} as const;

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

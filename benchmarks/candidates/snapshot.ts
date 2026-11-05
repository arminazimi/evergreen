import { z } from "zod";
import { ecosystems } from "./profiles.js";

const sha = z.string().regex(/^[0-9a-f]{40}$/);
const path = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("/") && !value.split("/").includes(".."));
const evidence = z.object({
  repository: z.object({
    id: z.number().int().positive(),
    full_name: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
    private: z.boolean(),
    fork: z.boolean(),
    archived: z.boolean(),
    mirror_url: z.string().nullable(),
    size: z.number().int().nonnegative(),
    default_branch: z.string().min(1),
  }),
  // ref records which branch the exporter resolved, not an arbitrary recent commit.
  ref: z.string(),
  commit: z
    .object({
      sha,
      commit: z.object({
        committer: z.object({ date: z.iso.datetime({ offset: true }) }),
        tree: z.object({ sha }),
      }),
    })
    .nullable(),
  tree: z
    .object({
      sha,
      truncated: z.boolean(),
      tree: z.array(z.object({ path, type: z.enum(["blob", "tree", "commit"]) })),
    })
    .nullable(),
  // A human checks the license at the pin, including coverage and OSI approval.
  licenseReview: z
    .object({
      commit: sha,
      path,
      spdxId: z.string().min(1),
      osiApproved: z.boolean(),
      coversInputs: z.boolean(),
      reviewer: z.string().min(1),
    })
    .nullable(),
});

export const snapshotSchema = z.object({
  schemaVersion: z.literal("evergreen.candidate-sources.v1"),
  discoveredAt: z.iso.date(),
  sources: z.array(
    z.object({
      ecosystem: z.enum(ecosystems),
      query: z.string().min(1),
      // Public search URL and the cap applied during the separate export.
      url: z.url().refine((value) => value.startsWith("https://github.com/search?")),
      limit: z.number().int().positive(),
      incomplete: z.boolean(),
      items: z.array(evidence),
    }),
  ),
});

export type Snapshot = z.infer<typeof snapshotSchema>;
export type Evidence = z.infer<typeof evidence>;

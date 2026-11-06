// Unreviewed expected findings are generated from a scan of a frozen candidate batch. They live in
// their own directory and use a different field name (`unreviewedExpected`) from the reviewed corpus
// (`expected`), so no scoring, threshold, or maturity path can read them by accident.

import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { z } from "zod";

import { ecosystems, type Ecosystem } from "./candidates/profiles.js";
import { detectorOf } from "./thresholds.js";

export const UNREVIEWED_CORPUS_DIR = "benchmarks/unreviewed-repositories";
export const UNREVIEWED_SCHEMA_VERSION = "evergreen.unreviewed-findings.v1" as const;

const findingSchema = z.object({
  ruleId: z.string().min(1),
  path: z.string().min(1),
  line: z.number().int().positive().optional(),
});

const repositorySchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  selection: z.literal("blind"),
  unreviewedExpected: z.array(findingSchema),
});

export const unreviewedBatchSchema = z.object({
  schemaVersion: z.literal(UNREVIEWED_SCHEMA_VERSION),
  reviewState: z.literal("unreviewed"),
  source: z.literal("scan-output"),
  generatedAt: z.iso.date(),
  ecosystem: z.enum(ecosystems),
  repositories: z.array(repositorySchema),
});

export type UnreviewedFinding = z.infer<typeof findingSchema>;
export type UnreviewedBatch = z.infer<typeof unreviewedBatchSchema>;

export interface UnreviewedRepositoryEntry {
  repository: string;
  commit: string;
  selection: "blind";
  ecosystem: Ecosystem;
  generatedAt: string;
  unreviewedExpected: UnreviewedFinding[];
}

export interface CountableRepository {
  repository: string;
  expected: ReadonlyArray<{ ruleId: string }>;
}

export interface CorpusCounts {
  repositories: number;
  findings: number;
  byDetector: Record<string, { findings: number; repositories: number }>;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT"
  );
}

function compareEntries(left: UnreviewedRepositoryEntry, right: UnreviewedRepositoryEntry): number {
  return left.ecosystem.localeCompare(right.ecosystem) || left.repository.localeCompare(right.repository);
}

/**
 * Reads the unreviewed batch files in `directory` (default `benchmarks/unreviewed-repositories`).
 * A missing directory is an empty batch, not an error. Every file must be marked `unreviewed` and
 * match its ecosystem file name; reviewed entries are rejected by the schema.
 */
export async function loadUnreviewedCorpus(
  directory: string = UNREVIEWED_CORPUS_DIR,
): Promise<UnreviewedRepositoryEntry[]> {
  const root = resolve(directory);
  let listed: Dirent[];
  try {
    listed = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }

  const entries: UnreviewedRepositoryEntry[] = [];
  const seen = new Set<string>();
  for (const item of listed) {
    if (!item.isFile() || !item.name.endsWith(".json")) continue;
    const file = join(root, item.name);
    const batch = unreviewedBatchSchema.parse(JSON.parse(await readFile(file, "utf8")));
    if (`${batch.ecosystem}.json` !== item.name) {
      throw new Error(`${file}: ecosystem "${batch.ecosystem}" does not match the file name`);
    }
    for (const repository of batch.repositories) {
      const key = `${batch.ecosystem}:${repository.repository}`;
      if (seen.has(key)) throw new Error(`${file}: duplicate repository ${repository.repository}`);
      seen.add(key);
      entries.push({
        ...repository,
        ecosystem: batch.ecosystem,
        generatedAt: batch.generatedAt,
      });
    }
  }
  return entries.sort(compareEntries);
}

/**
 * Writes one `<ecosystem>.json` batch file per ecosystem and removes older JSON batch files in the
 * same directory, so a rerun cannot leave a stale unreviewed entry behind. The README is untouched.
 */
export async function writeUnreviewedCorpus(
  directory: string,
  entries: readonly UnreviewedRepositoryEntry[],
): Promise<string[]> {
  const root = resolve(directory);
  await mkdir(root, { recursive: true });
  const existing = await readdir(root, { withFileTypes: true });
  await Promise.all(
    existing
      .filter((item) => item.isFile() && item.name.endsWith(".json"))
      .map((item) => rm(join(root, item.name), { force: true })),
  );

  const byEcosystem = new Map<Ecosystem, UnreviewedRepositoryEntry[]>();
  for (const entry of entries) {
    const group = byEcosystem.get(entry.ecosystem) ?? [];
    group.push(entry);
    byEcosystem.set(entry.ecosystem, group);
  }

  const written: string[] = [];
  for (const ecosystem of ecosystems) {
    const group = byEcosystem.get(ecosystem);
    if (!group || group.length === 0) continue;
    const generatedAt = group[0]?.generatedAt;
    if (generatedAt === undefined) throw new Error(`Missing generatedAt for ${ecosystem}`);
    if (group.some((entry) => entry.generatedAt !== generatedAt)) {
      throw new Error(`Mixed generatedAt values for ${ecosystem}`);
    }
    const file = join(root, `${ecosystem}.json`);
    const batch: UnreviewedBatch = {
      schemaVersion: UNREVIEWED_SCHEMA_VERSION,
      reviewState: "unreviewed",
      source: "scan-output",
      generatedAt,
      ecosystem,
      repositories: [...group]
        .sort((left, right) => left.repository.localeCompare(right.repository))
        .map(({ repository, commit, selection, unreviewedExpected }) => ({
          repository,
          commit,
          selection,
          unreviewedExpected,
        })),
    };
    await writeFile(file, `${JSON.stringify(batch, null, 2)}\n`);
    written.push(file);
  }
  return written;
}

/** Counts repositories, findings, and detectors for any corpus-shaped list. */
export function countCorpus(entries: readonly CountableRepository[]): CorpusCounts {
  const repositories = new Set<string>();
  const detectors = new Map<string, { findings: number; repositories: Set<string> }>();
  let findings = 0;
  for (const entry of entries) {
    repositories.add(entry.repository);
    for (const finding of entry.expected) {
      findings += 1;
      const detector = detectorOf(finding.ruleId);
      const count = detectors.get(detector) ?? { findings: 0, repositories: new Set<string>() };
      count.findings += 1;
      count.repositories.add(entry.repository);
      detectors.set(detector, count);
    }
  }
  return {
    repositories: repositories.size,
    findings,
    byDetector: Object.fromEntries(
      [...detectors.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([detector, count]) => [detector, { findings: count.findings, repositories: count.repositories.size }]),
    ),
  };
}

/** Counts the generated findings without ever passing them to a reviewed-corpus scorer. */
export function countUnreviewed(entries: readonly UnreviewedRepositoryEntry[]): CorpusCounts {
  return countCorpus(entries.map((entry) => ({ repository: entry.repository, expected: entry.unreviewedExpected })));
}

/** A reviewed/unreviewed table that states which side is precision evidence. */
export function formatCorpusCounts(reviewed: CorpusCounts, unreviewed: CorpusCounts): string {
  const row = (scope: string, counts: CorpusCounts, evidence: string): string =>
    `${scope.padEnd(10)} ${String(counts.repositories).padStart(12)} ${String(counts.findings).padStart(9)}  ${evidence}`;
  return [
    `${"scope".padEnd(10)} ${"repositories".padStart(12)} ${"findings".padStart(9)}  precision evidence`,
    row("reviewed", reviewed, "yes"),
    row("unreviewed", unreviewed, "no"),
  ].join("\n");
}

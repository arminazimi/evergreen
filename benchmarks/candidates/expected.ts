// Generates unreviewed expected findings from the current scan output of a frozen candidate batch.
// The scan reads local checkouts only: this module has no network access and never executes repository
// code. Its output is a starting point for review, never precision evidence.

import { stat } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { inBatches } from "../corpus-harness.js";
import type { UnreviewedFinding, UnreviewedRepositoryEntry } from "../unreviewed-corpus.js";
import { ecosystems, type Ecosystem } from "./profiles.js";

const candidateSchema = z.object({
  repository: z.string().regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/),
  commit: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .nullable(),
  eligible: z.boolean(),
});

const candidatesSchema = z.object({
  schemaVersion: z.literal("evergreen.candidates.v1"),
  buckets: z.array(
    z.object({
      ecosystem: z.enum(ecosystems),
      candidates: z.array(candidateSchema),
    }),
  ),
});

export interface GenerationCandidate {
  repository: string;
  commit: string;
  ecosystem: Ecosystem;
}

export interface CandidateSelection {
  eligible: GenerationCandidate[];
  ineligible: number;
}

/** Reads the frozen candidate report and keeps only candidates with an eligible immutable pin. */
export function selectEligibleCandidates(input: unknown): CandidateSelection {
  const report = candidatesSchema.parse(input);
  const eligible: GenerationCandidate[] = [];
  let ineligible = 0;
  for (const bucket of report.buckets) {
    for (const candidate of bucket.candidates) {
      if (!candidate.eligible || candidate.commit === null) {
        ineligible += 1;
        continue;
      }
      eligible.push({
        repository: candidate.repository.slice("https://github.com/".length),
        commit: candidate.commit,
        ecosystem: bucket.ecosystem,
      });
    }
  }
  return { eligible, ineligible };
}

export interface ScannableFinding {
  ruleId: string;
  location: { path: string; line?: number };
  /** Present for a transitive dependency; the reviewed corpus scores only declared dependencies. */
  dependencyPath?: string[];
}

export interface ScanLike {
  findings: readonly ScannableFinding[];
}

function compareFindings(left: UnreviewedFinding, right: UnreviewedFinding): number {
  return (
    left.path.localeCompare(right.path) ||
    (left.line ?? 0) - (right.line ?? 0) ||
    left.ruleId.localeCompare(right.ruleId)
  );
}

/**
 * Maps one scan result to the unreviewed expectation list. Transitive findings are omitted for the
 * same reason the corpus harness omits them: there is no reviewed ground truth for the dependency path.
 */
export function expectedFromFindings(findings: readonly ScannableFinding[]): UnreviewedFinding[] {
  const unique = new Map<string, UnreviewedFinding>();
  for (const finding of findings) {
    if (finding.dependencyPath !== undefined) continue;
    const expected: UnreviewedFinding = {
      ruleId: finding.ruleId,
      path: finding.location.path,
      ...(finding.location.line === undefined ? {} : { line: finding.location.line }),
    };
    unique.set(`${expected.ruleId}\0${expected.path}\0${expected.line ?? ""}`, expected);
  }
  return [...unique.values()].sort(compareFindings);
}

export interface GenerationFailure {
  repository: string;
  reason: string;
}

export interface GenerationResult {
  entries: UnreviewedRepositoryEntry[];
  failures: GenerationFailure[];
  skippedIneligible: number;
  skippedReviewed: number;
}

export interface GenerationOptions {
  candidates: unknown;
  checkoutsDir: string;
  generatedAt: string;
  scan: (path: string) => Promise<ScanLike>;
  /** Repository names already in the reviewed corpus; they are not generated again. */
  reviewedRepositories?: ReadonlySet<string>;
  concurrency?: number;
}

function checkoutPath(checkoutsDir: string, repository: string): string {
  return join(checkoutsDir, repository.split("/").join("--"));
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
 * Scans one local checkout per eligible candidate. A missing checkout or a scan error is returned as
 * a failure instead of a silently empty expectation; the caller decides whether a partial batch is
 * acceptable.
 */
export async function generateExpectedFindings(options: GenerationOptions): Promise<GenerationResult> {
  const selection = selectEligibleCandidates(options.candidates);
  const reviewed = options.reviewedRepositories;
  const candidates = selection.eligible.filter((candidate) => reviewed?.has(candidate.repository) !== true);
  const skippedReviewed = selection.eligible.length - candidates.length;

  const outcomes = await inBatches(candidates, options.concurrency ?? 4, async (candidate) => {
    const path = checkoutPath(options.checkoutsDir, candidate.repository);
    try {
      const info = await stat(path);
      if (!info.isDirectory()) {
        return { failure: { repository: candidate.repository, reason: `checkout is not a directory: ${path}` } };
      }
      const scan = await options.scan(path);
      return {
        entry: {
          repository: candidate.repository,
          commit: candidate.commit,
          selection: "blind" as const,
          ecosystem: candidate.ecosystem,
          generatedAt: options.generatedAt,
          unreviewedExpected: expectedFromFindings(scan.findings),
        },
      };
    } catch (error) {
      return {
        failure: {
          repository: candidate.repository,
          reason: isMissing(error)
            ? `missing checkout: ${path}`
            : error instanceof Error
              ? error.message
              : String(error),
        },
      };
    }
  });

  return {
    entries: outcomes.flatMap((outcome) => ("entry" in outcome ? [outcome.entry] : [])).sort(compareEntries),
    failures: outcomes.flatMap((outcome) => ("failure" in outcome ? [outcome.failure] : [])),
    skippedIneligible: selection.ineligible,
    skippedReviewed,
  };
}

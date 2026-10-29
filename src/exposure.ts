import { execFileSync } from "node:child_process";

import type { Finding, SourceLocation } from "./domain.js";

const DAY_MS = 86_400_000;

/** CycloneDX impact-analysis states Evergreen can assert from usage evidence. */
export const vexAnalysisStates = ["exploitable", "not_affected", "in_triage"] as const;
export type VexAnalysisState = (typeof vexAnalysisStates)[number];

/** CycloneDX justifications Evergreen may attach when state is `not_affected`. */
export const vexJustifications = ["code_not_reachable"] as const;
export type VexJustification = (typeof vexJustifications)[number];

/** One evidence location that supports an exposure result, with its role. */
export interface ExposureLocation extends SourceLocation {
  role: "declaration" | "usage";
}

/**
 * Whether a finding is exposed in the product, from usage evidence alone. Maps directly onto a CycloneDX
 * VEX analysis statement: usages present → exploitable; usage analysis ran and found none → not_affected;
 * usage analysis did not run → in_triage.
 */
export interface ExposureResult {
  state: VexAnalysisState;
  justification?: VexJustification;
  /** Declaration and usage locations, declaration first then usages sorted by path and line. */
  locations: ExposureLocation[];
  /** Human-readable assessment, including every evidence location. */
  detail: string;
}

/** The story of a finding: when its declaration was introduced and how long it has been past end of life. */
export interface ExposureTimeline {
  /** The day the finding's declaration was introduced (YYYY-MM-DD), from local git history. */
  introduced?: string;
  /** The finding's end-of-life day, from its rule. */
  endOfLife?: string;
  /** Whole days between introduction and today. */
  daysDeclared?: number;
  /** Whole days between end of life and today; 0 before the deadline. */
  daysPastEndOfLife?: number;
  /** Whole days the declaration has been present since end of life; 0 when it was introduced after it or before it ended. */
  daysExposed?: number;
  /** What could not be determined and why; empty when everything was known. */
  unknown: string[];
}

function formatLocation(location: SourceLocation): string {
  return location.line === undefined ? location.path : `${location.path}:${location.line}`;
}

function compareLocations(left: SourceLocation, right: SourceLocation): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 :
    (left.line ?? -1) - (right.line ?? -1) || (left.column ?? -1) - (right.column ?? -1);
}

/**
 * Maps a finding's usage evidence to a VEX analysis state. Never guesses: when usage analysis did not run,
 * the state is `in_triage`. Reads no clock and no network.
 */
export function exposureFromUsage(
  finding: Pick<Finding, "location" | "usages" | "impact" | "title">,
): ExposureResult {
  const declaration: ExposureLocation = { ...finding.location, role: "declaration" };
  const usageLocations = (finding.usages ?? [])
    .map((usage): ExposureLocation => ({ ...usage.location, role: "usage" }))
    .sort(compareLocations);
  const locations: ExposureLocation[] = [declaration, ...usageLocations];
  const usageCount = finding.impact?.usageCount ?? finding.usages?.length;
  const listed = locations.map((location) => `${location.role} ${formatLocation(location)}`).join("; ");

  if (usageCount === undefined) {
    return {
      state: "in_triage",
      locations,
      detail: `${finding.title}: usage analysis did not run. Evidence: ${listed}.`,
    };
  }
  if (usageCount > 0 || usageLocations.length > 0) {
    return {
      state: "exploitable",
      locations,
      detail: `${finding.title}: source usages show the component is reachable. Evidence: ${listed}.`,
    };
  }
  return {
    state: "not_affected",
    justification: "code_not_reachable",
    locations,
    detail: `${finding.title}: usage analysis found no source usages. Evidence: ${listed}.`,
  };
}

function git(root: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000, windowsHide: true });
  } catch {
    return undefined;
  }
}

function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
}

/**
 * Reads the day a file or one of its lines first appeared in the checked-out history. Local only: runs `git log`
 * and never contacts a remote. Returns a reason instead of a day when history cannot answer.
 */
function introducedOn(root: string, path: string, line: number | undefined): { day: string } | { reason: string } {
  if (git(root, ["rev-parse", "--git-dir"]) === undefined) return { reason: "introduction date unknown: not a git repository" };
  if (git(root, ["rev-parse", "--is-shallow-repository"])?.trim() === "true") return { reason: "introduction date unknown: shallow clone has no full history" };
  const args =
    line === undefined
      ? ["log", "--follow", "--format=%cs", "--", path]
      : ["log", `-L${line},${line}:${path}`, "-s", "--format=%cs"];
  const days = git(root, args)?.split("\n").map((entry) => entry.trim()).filter(Boolean);
  const oldest = days?.at(-1);
  if (oldest === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(oldest)) return { reason: `introduction date unknown: no history for ${path}` };
  return { day: oldest };
}

/**
 * Turns a finding into a timeline from the rule's end-of-life date and `git log` on the declaration line. Reads no
 * clock and no network: the caller passes `today` (YYYY-MM-DD) and the repository `root`. Anything that cannot be
 * known, such as a shallow clone or a missing deadline, is named in `unknown` instead of guessed.
 */
export function exposureTimeline(finding: Pick<Finding, "deadline" | "location">, root: string, today: string): ExposureTimeline {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(`${today}T00:00:00Z`))) throw new Error(`"${today}" is not a date (YYYY-MM-DD).`);
  const now = dayNumber(today);
  const timeline: ExposureTimeline = { unknown: [] };

  if (finding.deadline === undefined || Number.isNaN(Date.parse(`${finding.deadline}T00:00:00Z`))) {
    timeline.unknown.push("end-of-life date unknown: the rule has no deadline");
  } else {
    timeline.endOfLife = finding.deadline;
    timeline.daysPastEndOfLife = Math.max(0, now - dayNumber(finding.deadline));
  }

  const introduced = introducedOn(root, finding.location.path, finding.location.line);
  if ("reason" in introduced) {
    timeline.unknown.push(introduced.reason);
  } else {
    timeline.introduced = introduced.day;
    timeline.daysDeclared = Math.max(0, now - dayNumber(introduced.day));
    if (timeline.endOfLife !== undefined) {
      timeline.daysExposed = Math.max(0, now - Math.max(dayNumber(introduced.day), dayNumber(timeline.endOfLife)));
    }
  }
  return timeline;
}

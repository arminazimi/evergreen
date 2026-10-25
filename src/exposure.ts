import { execFileSync } from "node:child_process";

import type { Finding } from "./domain.js";

const DAY_MS = 86_400_000;

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

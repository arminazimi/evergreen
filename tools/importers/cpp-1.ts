import { isoDate } from "./canonical.js";
import { fetchJson } from "./types.js";
import type { DraftRule, Importer, ImporterContext } from "./types.js";

export const CMAKE_MINIMUM_REQUIRED_URL = "https://cmake.org/cmake/help/latest/command/cmake_minimum_required.html";
export const RELEASE_TAG = (cmake: string) => `https://api.github.com/repos/Kitware/CMake/releases/tags/v${cmake}.0`;
const PAGE_TITLE = "cmake_minimum_required";
const GITHUB_JSON = "application/vnd.github+json";
const RELEASE_NOTES = (cmake: string) => `https://cmake.org/cmake/help/latest/release/${cmake}.html`;

/** One compatibility signal from the cmake_minimum_required "Changed in version" notes. */
export interface CompatibilitySignal {
  /** CMake release that announced the change, for example `4.0`. */
  cmake: string;
  /** Policy floor named in the note, for example `3.5`. */
  floor: string;
  kind: "removed" | "deprecated";
}

export interface PolicyDraft {
  floor: string;
  kind: "removed" | "deprecated";
  cmake: string;
  /** Exclusive lower bound of a deprecation band, when the range is clipped. */
  lower?: string;
  /** Whether `lower` came from a removal floor or the previous deprecation floor. */
  lowerKind?: "removed" | "deprecated";
}

const SIGNAL =
  /Changed in version (\d+\.\d+):\s*Compatibility with versions of CMake older than ([\d.]+) is (removed|deprecated)\./gi;

function pageText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every compatibility removal or deprecation the page states. */
export function compatibilitySignals(html: string): CompatibilitySignal[] {
  const found: CompatibilitySignal[] = [];
  for (const match of pageText(html).matchAll(SIGNAL)) {
    found.push({ cmake: match[1]!, floor: match[2]!, kind: match[3] as "removed" | "deprecated" });
  }
  return found;
}

/** Compare dotted CMake versions (`3.5`, `2.8.12`, `3.10`). */
export function compareVersions(left: string, right: string): number {
  const parts = (value: string) => value.split(".").map((part) => Number(part));
  const a = parts(left);
  const b = parts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

/** SemVer form for a VERS bound: `3.5` → `3.5.0`, `2.8.12` stays `2.8.12`. */
export function semverBound(version: string): string {
  const parts = version.split(".");
  while (parts.length < 3) parts.push("0");
  return parts.slice(0, 3).join(".");
}

function floorSlug(floor: string): string {
  return floor.toLowerCase();
}

interface ReleasePayload {
  published_at?: string;
  html_url?: string;
}

async function releaseDate(context: ImporterContext, cmake: string): Promise<{ date: string; url: string } | undefined> {
  const payload = await fetchJson<ReleasePayload>(context, RELEASE_TAG(cmake), { accept: GITHUB_JSON });
  const published = payload.published_at;
  if (typeof published !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(published)) return undefined;
  return { date: published.slice(0, 10), url: typeof payload.html_url === "string" ? payload.html_url : RELEASE_TAG(cmake) };
}

/**
 * Collapse overlapping signals: a removal wins on its floor, same-kind duplicates keep the earliest
 * CMake release, and deprecation bands partition above removals and each other.
 */
export function draftSignals(signals: readonly CompatibilitySignal[]): {
  drafts: PolicyDraft[];
  notes: string[];
} {
  const notes: string[] = [];
  const byFloor = new Map<string, CompatibilitySignal>();
  for (const signal of signals) {
    const previous = byFloor.get(signal.floor);
    if (!previous) {
      byFloor.set(signal.floor, signal);
      continue;
    }
    if (previous.kind === "removed" && signal.kind === "deprecated") {
      notes.push(
        `Skipped deprecation of policy versions older than ${signal.floor} (CMake ${signal.cmake}): the same floor is removed in CMake ${previous.cmake}.`,
      );
      continue;
    }
    if (previous.kind === "deprecated" && signal.kind === "removed") {
      notes.push(
        `Skipped deprecation of policy versions older than ${previous.floor} (CMake ${previous.cmake}): superseded by the removal in CMake ${signal.cmake}.`,
      );
      byFloor.set(signal.floor, signal);
      continue;
    }
    // Same kind on the same floor: the change started in the earliest announcing release.
    if (compareVersions(signal.cmake, previous.cmake) < 0) {
      notes.push(
        `Skipped later ${previous.kind} of policy versions older than ${previous.floor} in CMake ${previous.cmake}: keeping the earlier announcement in CMake ${signal.cmake}.`,
      );
      byFloor.set(signal.floor, signal);
    } else if (compareVersions(signal.cmake, previous.cmake) > 0) {
      notes.push(
        `Skipped later ${signal.kind} of policy versions older than ${signal.floor} in CMake ${signal.cmake}: keeping the earlier announcement in CMake ${previous.cmake}.`,
      );
    }
  }

  const removals = [...byFloor.values()].filter((signal) => signal.kind === "removed").sort((left, right) => compareVersions(left.floor, right.floor));
  const deprecations = [...byFloor.values()].filter((signal) => signal.kind === "deprecated").sort((left, right) => compareVersions(left.floor, right.floor));
  const drafts: PolicyDraft[] = [];

  for (const signal of removals) {
    drafts.push({ floor: signal.floor, kind: "removed", cmake: signal.cmake });
  }

  let previousDeprecationFloor: string | undefined;
  for (const signal of deprecations) {
    const covering = removals.filter((removal) => compareVersions(removal.floor, signal.floor) >= 0).at(-1);
    if (covering) {
      notes.push(
        `Skipped deprecation of policy versions older than ${signal.floor} (CMake ${signal.cmake}): already covered by the removal of versions older than ${covering.floor} in CMake ${covering.cmake}.`,
      );
      continue;
    }
    const removalLower = removals.filter((removal) => compareVersions(removal.floor, signal.floor) < 0).at(-1)?.floor;
    let lower: string | undefined;
    let lowerKind: "removed" | "deprecated" | undefined;
    if (removalLower !== undefined && previousDeprecationFloor !== undefined) {
      if (compareVersions(previousDeprecationFloor, removalLower) >= 0) {
        lower = previousDeprecationFloor;
        lowerKind = "deprecated";
      } else {
        lower = removalLower;
        lowerKind = "removed";
      }
    } else if (previousDeprecationFloor !== undefined) {
      lower = previousDeprecationFloor;
      lowerKind = "deprecated";
    } else if (removalLower !== undefined) {
      lower = removalLower;
      lowerKind = "removed";
    }
    if (lower !== undefined && lowerKind !== undefined) {
      drafts.push({ floor: signal.floor, kind: "deprecated", cmake: signal.cmake, lower, lowerKind });
    } else {
      drafts.push({ floor: signal.floor, kind: "deprecated", cmake: signal.cmake });
    }
    previousDeprecationFloor = signal.floor;
  }

  drafts.sort((left, right) => compareVersions(left.floor, right.floor) || left.kind.localeCompare(right.kind));
  return { drafts, notes };
}

function coverageTail(draft: PolicyDraft): string {
  if (!draft.lower || !draft.lowerKind) return "";
  if (draft.lowerKind === "removed") {
    return ` Versions older than ${draft.lower} are covered by the removal rule instead.`;
  }
  return ` Versions older than ${draft.lower} are covered by the deprecation rule for versions older than ${draft.lower} instead.`;
}

function ruleFor(draft: PolicyDraft, release: { date: string; url: string }): DraftRule {
  const bound = semverBound(draft.floor);
  const lowerBound = draft.lower ? semverBound(draft.lower) : undefined;
  const vers = draft.kind === "deprecated" && lowerBound
    ? `vers:semver/>=${lowerBound}|<${bound}`
    : `vers:semver/<${bound}`;
  const removed = draft.kind === "removed";
  return {
    id: `cpp.cmake.policy-below-${floorSlug(draft.floor)}.${draft.kind}`,
    ecosystem: "cpp",
    purl: "pkg:generic/cmake",
    vers,
    event: removed ? "removed" : "deprecated",
    title: removed
      ? `CMake policy versions older than ${draft.floor} are removed`
      : `CMake policy versions older than ${draft.floor} are deprecated`,
    summary: removed
      ? `CMake ${draft.cmake} removed compatibility with policy versions older than ${draft.floor}. A cmake_minimum_required(VERSION) or cmake_policy(VERSION) call that does not set the policy version to at least ${draft.floor} (optionally via ...<policy_max>) produces an error on CMake ${draft.cmake} and newer. CMake ${draft.cmake}.0 was published on ${release.date}.`
      : `CMake ${draft.cmake} deprecated compatibility with policy versions older than ${draft.floor}. A cmake_minimum_required(VERSION) or cmake_policy(VERSION) call that does not set the policy version to at least ${draft.floor} (optionally via ...<policy_max>) produces a deprecation warning on CMake ${draft.cmake} and newer. CMake ${draft.cmake}.0 was published on ${release.date}.${coverageTail(draft)}`,
    severity: removed ? "high" : "medium",
    replacement: `cmake_minimum_required(VERSION ${draft.floor}) or newer, or VERSION <min>...<max> with <max> at least ${draft.floor}`,
    deadline: release.date,
    sources: [
      {
        title: `CMake ${draft.cmake} release notes (compatibility older than ${draft.floor} ${draft.kind})`,
        url: RELEASE_NOTES(draft.cmake),
      },
      {
        title: `${PAGE_TITLE} (Changed in ${draft.cmake})`,
        url: CMAKE_MINIMUM_REQUIRED_URL,
      },
      {
        title: `CMake ${draft.cmake}.0 GitHub release`,
        url: release.url,
      },
    ],
  };
}

export const cmakePolicyImporter: Importer = {
  id: "cpp-1",
  ecosystem: "cpp",
  description: "CMake minimum-version compatibility removals and deprecations from cmake_minimum_required",
  sources: [{ title: PAGE_TITLE, url: CMAKE_MINIMUM_REQUIRED_URL }],

  async import(context) {
    const today = isoDate(context.now);
    const html = await context.fetchText(CMAKE_MINIMUM_REQUIRED_URL, { accept: "text/html" });
    const signals = compatibilitySignals(html);
    if (signals.length === 0) {
      return { rules: [], notes: ["No usable CMake compatibility Changed-in-version notes were found."] };
    }

    const { drafts, notes } = draftSignals(signals);
    const rules: DraftRule[] = [];
    for (const draft of drafts) {
      const release = await releaseDate(context, draft.cmake);
      if (!release) {
        notes.push(`Skipped policy floor ${draft.floor} (${draft.kind}): no published date for CMake ${draft.cmake}.0.`);
        continue;
      }
      if (release.date > today) {
        notes.push(`Skipped policy floor ${draft.floor} (${draft.kind}): CMake ${draft.cmake}.0 is dated ${release.date}, after ${today}.`);
        continue;
      }
      rules.push(ruleFor(draft, release));
    }
    return { rules, notes };
  },
};

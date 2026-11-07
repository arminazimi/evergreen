// Turns the raw per-repository records into the committed result. Pure: no network, no clock, no repository code.

import { classify, compare } from "../../differential/renovate.js";
import type { Comparison, Family } from "../../differential/renovate.js";
import type {
  ComparisonResult,
  DisagreementRow,
  GroupResult,
  OutcomeCounts,
  RawRecord,
  Selection,
  TimingSummary,
} from "./types.js";
import { RESULT_SCHEMA_VERSION } from "./types.js";

const FAMILIES: readonly Family[] = ["base-image", "deprecated-package", "github-action"];
const SELECTIONS: readonly Selection[] = ["blind", "targeted"];

const emptyCounts = (): OutcomeCounts => ({ agree: 0, "evergreen-only": 0, "renovate-only": 0, inconclusive: 0 });

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const numeric = (left: number, right: number) => left - right;
const text = (left: string, right: string) => left.localeCompare(right);

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort(numeric);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

export function summarizeTiming(durations: readonly number[]): TimingSummary {
  return {
    totalMs: durations.reduce((sum, value) => sum + value, 0),
    medianMs: median(durations),
    maxMs: durations.reduce((largest, value) => Math.max(largest, value), 0),
  };
}

/** Compares one repository's findings with its Renovate dependencies; an unfinished Renovate run compares nothing. */
export function compareRecord(record: RawRecord): { comparisons: Comparison[]; notComparable: number } {
  const findings = record.evergreen.findings;
  const notComparable = findings.filter((finding) => classify(finding) === undefined).length;
  if (record.renovate.status !== "ok") return { comparisons: [], notComparable };
  return { comparisons: compare(findings, record.renovate.dependencies).comparisons, notComparable };
}

function groupResult(selection: Selection, records: readonly RawRecord[]): GroupResult {
  const outcomes = emptyCounts();
  const byFamily = Object.fromEntries(FAMILIES.map((family) => [family, emptyCounts()])) as Record<
    Family,
    OutcomeCounts
  >;
  let notComparableFindings = 0;
  for (const record of records) {
    const { comparisons, notComparable } = compareRecord(record);
    notComparableFindings += notComparable;
    for (const item of comparisons) {
      outcomes[item.outcome]++;
      byFamily[item.family][item.outcome]++;
    }
  }
  return {
    selection,
    repositories: records.length,
    renovateUnfinished: records
      .filter((record) => record.renovate.status !== "ok")
      .map((record) => record.repository)
      .sort(text),
    evergreenFindings: records.reduce((sum, record) => sum + record.evergreen.findings.length, 0),
    notComparableFindings,
    outcomes,
    byFamily,
    evergreenTime: summarizeTiming(records.map((record) => record.evergreen.durationMs)),
    renovateTime: summarizeTiming(records.map((record) => record.renovate.durationMs)),
  };
}

function disagreementRows(records: readonly RawRecord[]): DisagreementRow[] {
  const rows: DisagreementRow[] = [];
  for (const record of records) {
    for (const item of compareRecord(record).comparisons) {
      if (item.outcome === "agree") continue;
      rows.push({
        repository: record.repository,
        commit: record.commit,
        selection: record.selection,
        family: item.family,
        path: item.path,
        name: item.name,
        evergreen: item.evergreen,
        renovate: item.renovate,
        outcome: item.outcome,
      });
    }
  }
  return rows.sort((left, right) =>
    [left.selection, left.outcome, left.repository, left.path, left.name]
      .join("\n")
      .localeCompare([right.selection, right.outcome, right.repository, right.path, right.name].join("\n")),
  );
}

/** Findings by the first two rule-id segments for rules Renovate has no model for. */
function notComparableRules(records: readonly RawRecord[]): ComparisonResult["notComparableRules"] {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const finding of record.evergreen.findings) {
      if (classify(finding) !== undefined) continue;
      const family = finding.ruleId.split(".").slice(0, 2).join(".");
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([family, findings]) => ({ family, findings }))
    .sort((left, right) => right.findings - left.findings || text(left.family, right.family));
}

export function buildResult(records: readonly RawRecord[]): ComparisonResult {
  const ordered = [...records].sort((left, right) => text(left.repository, right.repository));
  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    method: "docs/COMPARISON_METHOD.md",
    renovateVersions: unique(ordered.map((record) => record.renovate.version)).sort(text),
    evergreenVersions: unique(ordered.map((record) => record.evergreen.version)).sort(text),
    evergreenCommits: unique(ordered.map((record) => record.evergreen.commit)).sort(text),
    concurrency: unique(ordered.map((record) => record.concurrency)).sort(numeric),
    groups: SELECTIONS.map((selection) =>
      groupResult(
        selection,
        ordered.filter((record) => record.selection === selection),
      ),
    ).filter((group) => group.repositories > 0),
    continuity: ordered.filter((record) => record.continuity).map((record) => record.repository),
    notComparableRules: notComparableRules(ordered),
    disagreements: disagreementRows(ordered),
  };
}

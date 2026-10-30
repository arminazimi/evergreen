import { severityValues, type ScanResult, type Severity } from "./domain.js";
import type { Plan, PlanItem, PlanSummary, Wave } from "./plan.js";
import { touchSet } from "./plan-touch-set.js";
import { scheduleWaves } from "./plan-waves.js";

/** Optional file listing used when computing touch sets; defaults to scan coverage. */
export interface BuildPlanOptions {
  /** Repository-relative paths known to exist (forward slashes). */
  readonly files?: readonly string[];
}

/**
 * Turn a rule id or finding-id prefix into a deterministic git-ref segment: replace characters
 * unsafe for git refs with `-`, collapse repeated separators, and strip leading/trailing `.` or `-`.
 */
function sanitizeGitRefSegment(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "");
}

/** Suggested branch: `evergreen/<rule-id>-<first 8 chars of finding id>`, sanitised for git. */
function branchForFinding(ruleId: string, findingId: string): string {
  const rule = sanitizeGitRefSegment(ruleId) || "finding";
  const suffix = sanitizeGitRefSegment(findingId.slice(0, 8)) || "item";
  return `evergreen/${rule}-${suffix}`;
}

function emptyBySeverity(): Record<Severity, number> {
  return Object.fromEntries(severityValues.map((severity) => [severity, 0])) as Record<Severity, number>;
}

/**
 * Build a deterministic migration plan from a scan: one item per finding, waves scheduled so
 * no two items in a wave share a touched path. Findings without a migration packet are still
 * included; the plan schema has no place for a note, so they appear as ordinary items.
 */
export function buildPlan(scan: ScanResult, options?: BuildPlanOptions): Plan {
  const files = options?.files ?? scan.coverage?.filesRead ?? [];
  const context = { files };

  const draft: Array<Omit<PlanItem, "wave">> = scan.findings.map((finding) => ({
    id: finding.id,
    findingId: finding.id,
    title: finding.title,
    severity: finding.severity,
    touches: touchSet(finding, context),
    branch: branchForFinding(finding.ruleId, finding.id),
  }));

  // Stable item order regardless of how the scan listed findings.
  draft.sort((left, right) => left.id.localeCompare(right.id));

  const waveIds = scheduleWaves(draft);
  const waveOf = new Map<string, number>();
  const waves: Wave[] = waveIds.map((itemIds, index) => {
    for (const id of itemIds) waveOf.set(id, index);
    return { index, itemIds };
  });

  const items: PlanItem[] = draft.map((item) => ({
    ...item,
    wave: waveOf.get(item.id) ?? 0,
  }));

  const bySeverity = emptyBySeverity();
  for (const item of items) bySeverity[item.severity] += 1;

  const summary: PlanSummary = {
    items: items.length,
    waves: waves.length,
    bySeverity,
  };

  return {
    schema: "evergreen.plan.v1",
    waves,
    items,
    summary,
  };
}

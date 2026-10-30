import type { Severity } from "./domain.js";

/** One migration task in a plan. */
export interface PlanItem {
  id: string;
  findingId: string;
  title: string;
  severity: Severity;
  /** Repository-relative paths this task edits, sorted and de-duplicated. */
  touches: string[];
  /** Suggested branch name for the task. */
  branch: string;
  /** Zero-based index of the wave that contains this item. */
  wave: number;
}

/** Items that can run at the same time because no two of them touch the same file. */
export interface Wave {
  /** Zero-based position of the wave; waves run in ascending order. */
  index: number;
  itemIds: string[];
}

export interface PlanSummary {
  items: number;
  waves: number;
  bySeverity: Record<Severity, number>;
}

/** A migration plan: independent waves of tasks, plus the tasks themselves. */
export interface Plan {
  schema: "evergreen.plan.v1";
  waves: Wave[];
  items: PlanItem[];
  summary: PlanSummary;
}

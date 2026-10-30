import type { Plan, PlanItem } from "./plan.js";

/** Message when a scan produces no tasks; empty plans still exit zero. */
export const EMPTY_PLAN_MESSAGE = "No migration tasks. The scan found nothing to plan.";

function renderItem(item: PlanItem): string[] {
  const files = item.touches.join(", ");
  return [`  ${item.severity.toUpperCase()}  ${item.title}`, `    ${files}`];
}

/**
 * Render a plan as plain text: one section per wave with severity, title, and touched files.
 * When `wave` is set, only that zero-based wave is printed.
 */
export function renderPlanText(plan: Plan, wave?: number): string {
  if (plan.summary.items === 0) return EMPTY_PLAN_MESSAGE;

  const waves =
    wave === undefined ? plan.waves : plan.waves.filter((entry) => entry.index === wave);
  const byId = new Map(plan.items.map((item) => [item.id, item]));
  const lines: string[] = [
    `Plan: ${plan.summary.items} task${plan.summary.items === 1 ? "" : "s"} in ${plan.summary.waves} wave${plan.summary.waves === 1 ? "" : "s"}`,
    "",
  ];

  for (const entry of waves) {
    const items = entry.itemIds
      .map((id) => byId.get(id))
      .filter((item): item is PlanItem => item !== undefined);
    lines.push(`Wave ${entry.index} (${items.length} task${items.length === 1 ? "" : "s"})`);
    for (const item of items) lines.push(...renderItem(item));
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

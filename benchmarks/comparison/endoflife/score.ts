// Scores one Evergreen registry rule against the endoflife.date snapshot.
//
// A rule is comparable only when its purl is a product endoflife.date publishes, its event is a lifecycle
// event, and its version range covers at least one release cycle with an end date. Every other rule is kept
// with the reason it was not scored, so the totals always add up to the registry size.

import { notComparableReason, productFor } from "./mapping.js";
import { lifecycleDate } from "./snapshot.js";
import { LIFECYCLE_EVENTS } from "./types.js";
import type { RegistryRule, RuleScore, Snapshot, SnapshotCycle } from "./types.js";
import { cycleInRange, parseVersionRange } from "./version-range.js";

function isLifecycleEvent(event: string): boolean {
  return LIFECYCLE_EVENTS.some((candidate) => candidate === event);
}

function cyclesFor(rule: RegistryRule, product: string, fixedCycle: string | undefined, snapshot: Snapshot) {
  const productCycles = snapshot.products[product];
  if (fixedCycle) return productCycles?.filter((cycle) => cycle.cycle === fixedCycle);
  const range = parseVersionRange(rule.vers);
  if (range.kind !== "range") return undefined;
  return productCycles?.filter((cycle) => cycleInRange(cycle.cycle, range));
}

function scoreDates(
  rule: RegistryRule,
  product: string,
  cycles: readonly SnapshotCycle[],
): Pick<RuleScore, "evergreenDate" | "endoflifeDate" | "missingCycles" | "outcome"> {
  const dates = cycles.map((cycle) => lifecycleDate(cycle, product, rule.event));
  const missingCycles = cycles.filter((_, index) => dates[index] === undefined).map((cycle) => cycle.cycle);
  const known = dates.filter((date): date is string => date !== undefined).sort();
  const endoflifeDate = known.at(-1);
  if (!rule.deadline) return { outcome: "no-rule-date", ...(endoflifeDate ? { endoflifeDate } : {}) };
  if (!endoflifeDate || missingCycles.length > 0) {
    return {
      outcome: "no-endoflife-date",
      evergreenDate: rule.deadline,
      ...(endoflifeDate ? { endoflifeDate } : {}),
      missingCycles,
    };
  }
  return {
    outcome: rule.deadline === endoflifeDate ? "agree" : "disagree",
    evergreenDate: rule.deadline,
    endoflifeDate,
  };
}

/** Scores one rule. `outcome` names every gate the rule did not pass, never a silent omission. */
export function scoreRule(rule: RegistryRule, snapshot: Snapshot): RuleScore {
  const base = { ruleId: rule.id, ecosystem: rule.ecosystem, purl: rule.purl };
  const reference = productFor(rule.purl);
  if (!reference) {
    const reason = notComparableReason(rule.purl)?.code;
    return { ...base, outcome: "not-comparable", ...(reason ? { reason } : {}) };
  }
  if (!snapshot.products[reference.product]) return { ...base, product: reference.product, outcome: "no-snapshot" };
  if (!isLifecycleEvent(rule.event)) {
    return { ...base, product: reference.product, outcome: "not-lifecycle-event" };
  }
  const cycles = cyclesFor(rule, reference.product, reference.cycle, snapshot);
  if (!cycles || cycles.length === 0) return { ...base, product: reference.product, outcome: "no-cycle" };
  const names = cycles.map((cycle) => cycle.cycle);
  const dates = scoreDates(rule, reference.product, cycles);
  return { ...base, product: reference.product, cycles: names, ...dates };
}

import type { RegistryV2Rule } from "@velella/ebb/registry";
import type { DetectorFinding } from "./sdk.js";

/** The finding a reviewed rule produces at one declaration. */
export function ruleFinding(rule: RegistryV2Rule, path: string, line: number, summary: string): DetectorFinding {
  return {
    id: `${rule.id}:${path}:${line}`,
    ruleId: rule.id,
    title: rule.title,
    summary,
    severity: rule.severity,
    location: { path, line },
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
  };
}

interface Located {
  location: { path: string; line?: number };
}

/** Orders by path, then line; callers add their own tie-breaker with `||`. */
export function compareByLocation(left: Located, right: Located): number {
  if (left.location.path !== right.location.path) return left.location.path < right.location.path ? -1 : 1;
  return (left.location.line ?? 0) - (right.location.line ?? 0);
}

/** Sorts findings by location, then id. */
export function sortFindings(findings: DetectorFinding[]): void {
  findings.sort((left, right) => compareByLocation(left, right) || left.id.localeCompare(right.id));
}

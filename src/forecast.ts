import type { Finding, ScanResult, Severity } from "./domain.js";
import { isIsoDate } from "./registry.js";
import type { RegistryV2Rule } from "./registry.js";

export function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result.toISOString().slice(0, 10);
}

export const DEFAULT_FORECAST_MONTHS = 12;
export const MAX_FORECAST_MONTHS = 36;

/** One dated lifecycle event in the window, with the findings in the scanned repository that it will affect. */
export interface ForecastEvent {
  date: string;
  ruleId: string;
  ecosystem: string;
  title: string;
  severity: Severity;
  source: string;
  /** The repository's findings for this rule; empty when the repository does not use what is ending. */
  findings: Array<{ id: string; path: string; line?: number }>;
}

export interface ForecastMonth {
  /** The calendar month, YYYY-MM. */
  month: string;
  events: ForecastEvent[];
}

export interface Forecast {
  schemaVersion: "evergreen.forecast.v1";
  root: string;
  today: string;
  until: string;
  months: number;
  /** Events grouped by month, earliest first. Months with no event are left out. */
  groups: ForecastMonth[];
  /** Events in the window that affect at least one finding in this repository. */
  affecting: number;
  /** Events in the window in total. */
  total: number;
}

const order = (left: ForecastEvent, right: ForecastEvent) => left.date.localeCompare(right.date) || left.ruleId.localeCompare(right.ruleId);

/**
 * Lists what reaches a dated end of life between `today` and `months` later. Only events that carry a date are
 * listed; nothing is estimated. Reads no clock: the caller passes the day, so output is deterministic.
 */
export function buildForecast(result: ScanResult, rules: readonly RegistryV2Rule[], today: string, months = DEFAULT_FORECAST_MONTHS): Forecast {
  if (!isIsoDate(today)) throw new Error(`"${today}" is not a date (YYYY-MM-DD).`);
  const until = addMonths(today, months);
  const inWindow = (date: string | undefined): date is string => date !== undefined && isIsoDate(date) && date >= today && date <= until;

  const findingsByRule = new Map<string, Finding[]>();
  for (const finding of result.findings) findingsByRule.set(finding.ruleId, [...(findingsByRule.get(finding.ruleId) ?? []), finding]);
  const refs = (ruleId: string) =>
    (findingsByRule.get(ruleId) ?? []).map((finding) => ({ id: finding.id, path: finding.location.path, ...(finding.location.line === undefined ? {} : { line: finding.location.line }) }));

  const events: ForecastEvent[] = rules
    .filter((rule) => inWindow(rule.deadline))
    .map((rule) => ({ date: rule.deadline!, ruleId: rule.id, ecosystem: rule.ecosystem, title: rule.title, severity: rule.severity, source: rule.sources[0]?.url ?? "", findings: refs(rule.id) }));
  const known = new Set(rules.map((rule) => rule.id));
  for (const [ruleId, findings] of findingsByRule) {
    const first = findings[0]!;
    if (known.has(ruleId) || !inWindow(first.deadline)) continue;
    events.push({ date: first.deadline, ruleId, ecosystem: first.detector, title: first.title, severity: first.severity, source: first.sources[0]?.url ?? "", findings: refs(ruleId) });
  }
  events.sort(order);

  const groups: ForecastMonth[] = [];
  for (const event of events) {
    const month = event.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.month === month) last.events.push(event);
    else groups.push({ month, events: [event] });
  }
  return { schemaVersion: "evergreen.forecast.v1", root: result.root, today, until, months, groups, affecting: events.filter((event) => event.findings.length > 0).length, total: events.length };
}

export function renderForecastText(forecast: Forecast): string {
  const lines = [`Forecast from ${forecast.today} to ${forecast.until} (${forecast.months} month${forecast.months === 1 ? "" : "s"})`, ""];
  const affecting = forecast.groups.map((group) => ({ month: group.month, events: group.events.filter((event) => event.findings.length > 0) })).filter((group) => group.events.length > 0);
  if (affecting.length === 0) lines.push("Nothing in this repository reaches a dated end of life in this window.");
  for (const group of affecting) {
    lines.push(group.month);
    for (const event of group.events) {
      lines.push(`  ${event.date}  ${event.title} [${event.severity}] (${event.ruleId})`);
      for (const finding of event.findings) lines.push(`    ${finding.path}${finding.line === undefined ? "" : `:${finding.line}`}`);
    }
    lines.push("");
  }
  const others = forecast.total - forecast.affecting;
  lines.push(`${others} other dated event${others === 1 ? "" : "s"} in the window do not affect this repository; --json lists them.`);
  return lines.join("\n");
}

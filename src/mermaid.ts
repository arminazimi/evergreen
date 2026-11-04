import type { ScanResult } from "./domain.js";
import { addDays } from "./forecast.js";
import type { Forecast } from "./forecast.js";

/** The most support-window bars a chart draws. The rest are counted in the line below it. */
export const MERMAID_MAX_BARS = 40;

/**
 * Mermaid's Gantt parser reads `:`, `#`, and `;` as syntax, so they become entity codes that render as the
 * original character. Whitespace folds onto one line because a Gantt statement cannot continue onto the next.
 */
export function escapeMermaid(value: string): string {
  const escapes: Record<string, string> = { "#": "#35;", ":": "#58;", ";": "#59;" };
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[#:;]/g, (character) => escapes[character]!);
}

interface SupportWindow {
  ecosystem: string;
  subject: string;
  deadline: string;
}

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/**
 * A fenced Mermaid Gantt chart: one section per ecosystem and one bar per subject from the day it was observed
 * to its deadline. A subject whose deadline has already arrived is a `crit` milestone at that date, and a bar
 * whose deadline is under 30 days away is `crit`. The `today` milestone makes the chart reproducible with
 * `--as-of`; the renderer's own today marker is off so it cannot drift from that date.
 */
function chart(windows: readonly SupportWindow[], asOf: string): string {
  const ordered = [...windows].sort(
    (left, right) =>
      compare(left.ecosystem, right.ecosystem) ||
      compare(left.deadline, right.deadline) ||
      compare(left.subject, right.subject),
  );
  const shown = ordered.slice(0, MERMAID_MAX_BARS);
  const criticalFrom = addDays(asOf, 30);
  const lines = [
    "```mermaid",
    "gantt",
    "    title Evergreen support windows",
    "    dateFormat YYYY-MM-DD",
    "    axisFormat %Y-%m",
    "    todayMarker off",
  ];
  let index = 0;
  for (const ecosystem of [...new Set(shown.map((window) => window.ecosystem))]) {
    lines.push("", `    section ${escapeMermaid(ecosystem) || "other"}`);
    for (const window of shown.filter((candidate) => candidate.ecosystem === ecosystem)) {
      const subject = escapeMermaid(window.subject);
      const id = `bar${index++}`;
      lines.push(
        window.deadline <= asOf
          ? `    ${subject} :crit, milestone, ${id}, ${window.deadline}, 0d`
          : `    ${subject} :${window.deadline < criticalFrom ? "crit, " : ""}${id}, ${asOf}, ${window.deadline}`,
      );
    }
  }
  lines.push("", "    section today", `    today ${asOf} : milestone, marker, ${asOf}, 0d`, "```");
  const omitted = ordered.length - shown.length;
  if (omitted > 0) lines.push(`and ${omitted} more`);
  return lines.join("\n");
}

/** One bar per dated finding, deduplicated by rule, grouped by the ecosystem its rule id names. */
export function renderScanMermaid(result: ScanResult, asOf: string): string {
  const seen = new Set<string>();
  const windows: SupportWindow[] = [];
  for (const finding of result.findings) {
    if (finding.deadline === undefined || seen.has(finding.ruleId)) continue;
    seen.add(finding.ruleId);
    const separator = finding.ruleId.indexOf(".");
    windows.push({
      ecosystem: separator === -1 ? finding.detector : finding.ruleId.slice(0, separator),
      subject: finding.title,
      deadline: finding.deadline,
    });
  }
  return chart(windows, asOf);
}

/** One bar per dated event in the forecast window, grouped by ecosystem. */
export function renderForecastMermaid(forecast: Forecast): string {
  const windows = forecast.groups
    .flatMap((group) => group.events)
    .map((event) => ({
      ecosystem: event.ecosystem,
      subject: event.title,
      deadline: event.date,
    }));
  return chart(windows, forecast.today);
}

import { getCapabilityManifest } from "./capabilities.js";
import { severityValues } from "./domain.js";
import type { ScanResult, Severity } from "./domain.js";

/**
 * The Evergreen mark as terminal blocks: the three lifecycle rings with their staggered version
 * notches (top, right, bottom), redrawn from `brand/assets/evergreen-mark-mono.svg` at 22×11 —
 * round in a terminal, where a cell is about twice as tall as it is wide.
 */
export const GLANCE_MARK = [
  "      ███    ███",
  "   ███  ██████  ███",
  " ███ ████    ████ ███",
  "██  ██ ████████ ██  ██",
  "██ ██ ██      ██ ██ ██",
  "██ ██ ██      ██    ██",
  "██ ██ ██      ██ ██ ██",
  "██  ██ ██    ██ ██  ██",
  " ███ ████    ████ ███",
  "   ███  ██████  ███",
  "      ██████████",
] as const;

/** Columns the mark occupies, and the gap between the mark and the facts. */
export const GLANCE_MARK_COLUMNS = Math.max(...GLANCE_MARK.map((line) => line.length));
const MARK_GAP_COLUMNS = 2;
const MARK_CHARS = GLANCE_MARK_COLUMNS + MARK_GAP_COLUMNS;
/** From this width up, the mark prints beside the facts; below it the facts keep the full width. */
export const GLANCE_MARK_MIN_COLUMNS = 80;
/** Column count assumed when the terminal width is unknown (for example off a TTY). */
const DEFAULT_COLUMNS = 120;

const ANSI = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
  boldRed: "\u001b[1;31m",
} as const;

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: ANSI.boldRed,
  high: ANSI.red,
  medium: ANSI.yellow,
  low: ANSI.cyan,
  info: ANSI.dim,
};

/** The severity order the card shows: worst first, the reverse of `severityValues`. */
const DISPLAY_SEVERITIES = [...severityValues].reverse() as Severity[];

export interface GlanceDeadline {
  date: string;
  title: string;
  ruleId: string;
}

export interface GlanceEcosystem {
  id: string;
  maturity?: "experimental" | "beta" | "stable";
}

export interface GlanceFacts {
  schemaVersion: "evergreen.glance.v1";
  repository: string;
  asOf: string;
  ecosystems: GlanceEcosystem[];
  findings: { total: number; bySeverity: Record<Severity, number> };
  nextDeadline?: GlanceDeadline;
  oldestEnded?: GlanceDeadline;
  data?: { version: string; ageDays: number; stale: boolean };
}

export interface GlanceInput extends Pick<ScanResult, "findings"> {
  data?: ScanResult["data"];
  coverage?: ScanResult["coverage"];
}

export interface GlanceOptions {
  /** The repository name shown first; the caller derives it from the git remote or the folder. */
  repository: string;
  /** The day next and ended are judged against (YYYY-MM-DD). */
  asOf: string;
}

/**
 * The facts the glance card shows, all from the scan result: ecosystems mapped to their maturity
 * through the capability manifest, findings tallied by severity, the next deadline, the oldest
 * ended item, and the lifecycle data version and age. Counts match `scan --json` by construction.
 */
export function buildGlanceFacts(result: GlanceInput, options: GlanceOptions): GlanceFacts {
  const manifest = getCapabilityManifest();
  const ecosystemsByDetector = new Map<string, GlanceEcosystem[]>();
  for (const ecosystem of manifest.ecosystems) {
    for (const detector of ecosystem.detectorIds) {
      const known = ecosystemsByDetector.get(detector) ?? [];
      known.push(
        ecosystem.maturity === undefined ? { id: ecosystem.id } : { id: ecosystem.id, maturity: ecosystem.maturity },
      );
      ecosystemsByDetector.set(detector, known);
    }
  }
  const detectors =
    result.coverage?.ecosystems ?? [...new Set(result.findings.map((finding) => finding.detector))].sort();
  const ecosystems = [...new Set(detectors.flatMap((detector) => ecosystemsByDetector.get(detector) ?? []))]
    .map((ecosystem) => JSON.stringify(ecosystem))
    .filter((value, index, all) => all.indexOf(value) === index)
    .map((value) => JSON.parse(value) as GlanceEcosystem)
    .sort((left, right) => left.id.localeCompare(right.id));

  const bySeverity = Object.fromEntries(severityValues.map((severity) => [severity, 0])) as Record<Severity, number>;
  for (const finding of result.findings) bySeverity[finding.severity] += 1;

  const dated = result.findings
    .filter((finding) => finding.deadline !== undefined)
    .sort(
      (left, right) =>
        left.deadline!.localeCompare(right.deadline!) ||
        left.ruleId.localeCompare(right.ruleId) ||
        left.id.localeCompare(right.id),
    );
  const asDeadline = (finding: (typeof dated)[number]): GlanceDeadline => ({
    date: finding.deadline!,
    title: finding.title,
    ruleId: finding.ruleId,
  });
  const next = dated.find((finding) => finding.deadline! >= options.asOf);
  const oldestEnded = dated.find((finding) => finding.deadline! < options.asOf);

  return {
    schemaVersion: "evergreen.glance.v1",
    repository: options.repository,
    asOf: options.asOf,
    ecosystems,
    findings: { total: result.findings.length, bySeverity },
    ...(next === undefined ? {} : { nextDeadline: asDeadline(next) }),
    ...(oldestEnded === undefined ? {} : { oldestEnded: asDeadline(oldestEnded) }),
    ...(result.data === undefined
      ? {}
      : { data: { version: result.data.version, ageDays: result.data.ageDays, stale: result.data.stale } }),
  };
}

interface Fact {
  label: string;
  value: string;
  color?: string;
}

/** Greedy word wrap; continuation lines align under the first value column. */
function wrapValue(value: string, width: number, indent: string): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of value.split(" ")) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (current !== "" && candidate.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== "") lines.push(current);
  return lines.map((line, index) => (index === 0 ? line : `${indent}${line}`));
}

/**
 * The one-screen card: the mark on the left in the brand green, the facts on the right. Under
 * `GLANCE_MARK_MIN_COLUMNS` the mark is dropped and the facts keep the full width. With `color`
 * the mark and the severity blocks carry ANSI color; without it the output is plain text.
 */
export function renderGlance(facts: GlanceFacts, options: { columns?: number; color?: boolean } = {}): string {
  const columns = Math.max(options.columns ?? DEFAULT_COLUMNS, GLANCE_MARK_MIN_COLUMNS - 1);
  const color = options.color === true;
  const showMark = columns >= GLANCE_MARK_MIN_COLUMNS;
  const factWidth = columns - (showMark ? GLANCE_MARK_COLUMNS + MARK_GAP_COLUMNS : 0);

  const factList: Fact[] = [{ label: "repo", value: facts.repository }];
  if (facts.ecosystems.length > 0) {
    factList.push({
      label: "ecosystems",
      value: facts.ecosystems
        .map((ecosystem) => (ecosystem.maturity === undefined ? ecosystem.id : `${ecosystem.id} ${ecosystem.maturity}`))
        .join(" · "),
    });
  }
  if (facts.findings.total === 0) {
    factList.push({ label: "findings", value: "All clear.", color: ANSI.green });
  } else {
    factList.push({ label: "findings", value: String(facts.findings.total) });
    for (const severity of DISPLAY_SEVERITIES) {
      const count = facts.findings.bySeverity[severity];
      if (count === 0) continue;
      factList.push({
        label: "",
        value: `${severity}  ${"█".repeat(Math.min(count, 10))} ${count}`,
        color: SEVERITY_COLOR[severity],
      });
    }
  }
  if (facts.nextDeadline !== undefined)
    factList.push({ label: "next", value: `${facts.nextDeadline.date}  ${facts.nextDeadline.title}` });
  if (facts.oldestEnded !== undefined)
    factList.push({ label: "ended", value: `${facts.oldestEnded.date}  ${facts.oldestEnded.title}` });
  if (facts.data !== undefined) {
    factList.push({
      label: "data",
      value: `v${facts.data.version} · ${facts.data.ageDays} day${facts.data.ageDays === 1 ? "" : "s"} old${facts.data.stale ? " · stale" : ""}`,
    });
  }

  const labelWidth = Math.max(...factList.map((fact) => fact.label.length));
  const indent = " ".repeat(labelWidth + 2);
  const factLines: string[] = [];
  for (const fact of factList) {
    const lines = wrapValue(fact.value, factWidth - indent.length, indent);
    factLines.push(`${fact.label.padEnd(labelWidth)}  ${lines[0] ?? ""}`);
    factLines.push(...lines.slice(1));
    // Colored facts are short and never wrap; colorizing keeps to that one line.
    if (fact.color !== undefined && color && lines.length === 1) {
      const last = factLines.length - 1;
      factLines[last] = `${fact.color}${factLines[last]}${ANSI.reset}`;
    }
  }

  const height = Math.max(showMark ? GLANCE_MARK.length : 0, factLines.length);
  const lines: string[] = [];
  for (let index = 0; index < height; index += 1) {
    const mark = showMark ? GLANCE_MARK[index] : undefined;
    const left =
      mark === undefined
        ? showMark
          ? " ".repeat(MARK_CHARS)
          : ""
        : color
          ? `${ANSI.green}${mark}${ANSI.reset}${" ".repeat(MARK_CHARS - mark.length)}`
          : mark.padEnd(MARK_CHARS);
    lines.push(`${left}${factLines[index] ?? ""}`.trimEnd());
  }
  return lines.join("\n");
}

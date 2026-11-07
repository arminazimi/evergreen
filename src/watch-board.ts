import { basename } from "node:path";

import type { Severity } from "./domain.js";
import { severityValues } from "./domain.js";
import type { Detector } from "./sdk.js";
import { scanRepository } from "./engine/index.js";
import { TREEMAP_SEVERITY_WEIGHT } from "./treemap.js";
import {
  loadWatchBoardState,
  summarizeFindings,
  writeWatchSummaries,
  type WatchOptions,
  type WatchProjectSummary,
  type WatchTrend,
} from "./watch.js";

const ANSI = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
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

/** Worst-first order for the compact severity bars. */
const DISPLAY_SEVERITIES = [...severityValues].reverse();

const TREND_ARROW: Record<WatchTrend, string> = {
  worse: "▲",
  better: "▼",
  same: "●",
};

export interface WatchBoardRow {
  rank: number;
  project: string;
  name: string;
  score: number;
  bySeverity: Record<Severity, number>;
  nextDeadline?: string;
  trend: WatchTrend;
  trendArrow: string;
}

export interface WatchBoard {
  schemaVersion: "evergreen.watch-board.v1";
  projects: number;
  rows: WatchBoardRow[];
  failed: Array<{ project: string; reason: string }>;
}

export type { WatchTrend };

/** Score delta against the previous summary: higher risk is worse. Missing history is same. */
export function trendAgainst(current: number, previous: number | undefined): WatchTrend {
  if (previous === undefined) return "same";
  if (current > previous) return "worse";
  if (current < previous) return "better";
  return "same";
}

/**
 * Rank by severity-weighted score (highest first), then earliest next deadline, then project path.
 * Projects with no deadline sort after dated ones.
 */
export function compareBoardSummaries(
  left: { project: string; summary: WatchProjectSummary },
  right: { project: string; summary: WatchProjectSummary },
): number {
  const byScore = right.summary.score - left.summary.score;
  if (byScore !== 0) return byScore;
  const leftDeadline = left.summary.nextDeadline ?? "\uffff";
  const rightDeadline = right.summary.nextDeadline ?? "\uffff";
  return leftDeadline.localeCompare(rightDeadline) || left.project.localeCompare(right.project);
}

/** One compact bar segment per severity that has findings, capped so a row stays readable. */
export function severityBars(bySeverity: Record<Severity, number>, options: { color?: boolean } = {}): string {
  const color = options.color === true;
  const block = color ? "█" : "#";
  const parts: string[] = [];
  for (const severity of DISPLAY_SEVERITIES) {
    const count = bySeverity[severity];
    if (count === 0) continue;
    const cells = block.repeat(Math.min(count, 8));
    parts.push(color ? `${SEVERITY_COLOR[severity]}${cells}${ANSI.reset}` : cells);
  }
  return parts.length === 0 ? (color ? `${ANSI.dim}·${ANSI.reset}` : ".") : parts.join(" ");
}

/** Ranked rows from scanned summaries and the previous board state. */
export function rankWatchBoard(
  scanned: Array<{ project: string; summary: WatchProjectSummary }>,
  previous: Readonly<Record<string, WatchProjectSummary>>,
): WatchBoardRow[] {
  const ordered = [...scanned].sort(compareBoardSummaries);
  return ordered.map((entry, index) => {
    const trend = trendAgainst(entry.summary.score, previous[entry.project]?.score);
    return {
      rank: index + 1,
      project: entry.project,
      name: basename(entry.project),
      score: entry.summary.score,
      bySeverity: entry.summary.bySeverity,
      ...(entry.summary.nextDeadline === undefined ? {} : { nextDeadline: entry.summary.nextDeadline }),
      trend,
      trendArrow: TREND_ARROW[trend],
    };
  });
}

/**
 * Re-scans every watched project, ranks them by lifecycle risk, and stores the new summaries for the
 * next trend comparison. Digest keys (`seen` / `lastDigest`) are left unchanged.
 */
export async function runWatchBoard(detectors: readonly Detector[], options: WatchOptions = {}): Promise<WatchBoard> {
  const state = await loadWatchBoardState(options);
  const scanned: Array<{ project: string; summary: WatchProjectSummary }> = [];
  const failed: WatchBoard["failed"] = [];
  const nextSummaries: Record<string, WatchProjectSummary> = {};
  for (const project of state.projects) {
    const prior = state.summaries[project];
    if (prior !== undefined) nextSummaries[project] = prior;
  }

  for (const project of state.projects) {
    try {
      const result = await scanRepository(project, detectors);
      const summary = summarizeFindings(result.findings);
      scanned.push({ project, summary });
      nextSummaries[project] = summary;
    } catch (error) {
      failed.push({ project, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  await writeWatchSummaries(nextSummaries, options);
  return {
    schemaVersion: "evergreen.watch-board.v1",
    projects: state.projects.length,
    rows: rankWatchBoard(scanned, state.summaries),
    failed,
  };
}

export function renderWatchBoardText(board: WatchBoard, options: { color?: boolean } = {}): string {
  const color = options.color === true;
  if (board.projects === 0) return "No projects are watched. Add one with `evergreen watch add <path>`.";

  const lines: string[] = [];
  if (board.rows.length > 0) {
    const nameWidth = Math.max(7, ...board.rows.map((row) => row.name.length));
    const barsWidth = Math.max(
      8,
      ...board.rows.map((row) => visibleLength(severityBars(row.bySeverity, { color: false }))),
    );
    const deadlineWidth = Math.max(4, ...board.rows.map((row) => (row.nextDeadline ?? "—").length));
    lines.push(
      `${"RANK".padEnd(4)}  ${"PROJECT".padEnd(nameWidth)}  ${"FINDINGS".padEnd(barsWidth)}  ${"NEXT".padEnd(deadlineWidth)}  Δ`,
    );
    for (const row of board.rows) {
      const bars = padVisible(severityBars(row.bySeverity, { color }), barsWidth);
      const next = (row.nextDeadline ?? "—").padEnd(deadlineWidth);
      lines.push(`${String(row.rank).padStart(4)}  ${row.name.padEnd(nameWidth)}  ${bars}  ${next}  ${row.trendArrow}`);
    }
  } else {
    lines.push("No projects could be ranked.");
  }
  for (const entry of board.failed) lines.push(`Could not scan ${entry.project}: ${entry.reason}`);
  return lines.join("\n");
}

/** Column width of a string after stripping ANSI color sequences. */
function visibleLength(text: string): number {
  let length = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 0x1b && text[index + 1] === "[") {
      index += 2;
      while (index < text.length && text[index] !== "m") index += 1;
      continue;
    }
    length += 1;
  }
  return length;
}

function padVisible(text: string, width: number): string {
  const pad = width - visibleLength(text);
  return pad > 0 ? `${text}${" ".repeat(pad)}` : text;
}

/** Re-export the treemap weights so board tests can assert the ranking contract in one place. */
export const BOARD_SEVERITY_WEIGHT = TREEMAP_SEVERITY_WEIGHT;

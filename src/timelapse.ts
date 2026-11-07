import { writeFile } from "node:fs/promises";
import process from "node:process";

import { applyAsOf } from "./as-of.js";
import type { Finding, ScanResult } from "./domain.js";
import { required } from "./required.js";

/** Longest terminal play, in milliseconds. */
export const TIMELAPSE_MAX_MS = 6000;
/** Default span: this month through 23 months ahead → 24 frames. */
export const TIMELAPSE_DEFAULT_MONTHS = 23;

const ANSI = {
  dim: "\u001b[2m",
  red: "\u001b[31m",
  reset: "\u001b[0m",
  clear: "\u001b[2J\u001b[H",
  showCursor: "\u001b[?25h",
  hideCursor: "\u001b[?25l",
} as const;

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => required(XML_ESCAPES[character], "SVG entity"));

/** True for a calendar month written as YYYY-MM. */
export function isYearMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

function isLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Last calendar day of `YYYY-MM`, as YYYY-MM-DD. */
export function lastDayOfMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  const day = index === 1 && isLeap(year) ? 29 : DAYS_IN_MONTH[index];
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** Add whole months to a YYYY-MM label. */
export function addMonths(month: string, count: number): string {
  const start = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + count;
  const year = Math.floor(start / 12);
  const mon = (start % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(mon).padStart(2, "0")}`;
}

/** Inclusive list of YYYY-MM labels from `from` through `to`. */
export function monthRange(from: string, to: string): string[] {
  if (from > to) return [];
  const months: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addMonths(cursor, 1)) months.push(cursor);
  return months;
}

export class TimelapseError extends Error {
  override readonly name = "TimelapseError";
}

/** Resolve `--from` / `--to`, defaulting to this UTC month through 23 months ahead. */
export function parseTimelapseRange(
  from: string | undefined,
  to: string | undefined,
  today = new Date().toISOString().slice(0, 10),
): { from: string; to: string } {
  const start = from ?? today.slice(0, 7);
  const end = to ?? addMonths(start, TIMELAPSE_DEFAULT_MONTHS);
  if (!isYearMonth(start)) throw new TimelapseError(`--from must be a month (YYYY-MM), got ${from ?? start}.`);
  if (!isYearMonth(end)) throw new TimelapseError(`--to must be a month (YYYY-MM), got ${to ?? end}.`);
  if (start > end) throw new TimelapseError(`--from (${start}) must be on or before --to (${end}).`);
  return { from: start, to: end };
}

/**
 * A finding has "appeared" once its deadline is on or before the as-of day, or when it carries no
 * deadline (already an elapsed lifecycle finding). Matches the ended set of `scan --as-of`.
 */
export function findingHasAppeared(finding: Finding, asOf: string): boolean {
  return finding.deadline === undefined || finding.deadline <= asOf;
}

export interface TimelapseFrame {
  month: string;
  /** Count of findings that have appeared as of this month's last day. */
  findings: number;
  /** Sorted unique paths of those findings. */
  files: string[];
}

/** Build one frame from a scan projected onto `asOf` (YYYY-MM-DD). */
export function frameFromScan(result: ScanResult, month: string, asOf: string): TimelapseFrame {
  const appeared = result.findings.filter((finding) => findingHasAppeared(finding, asOf));
  const files = [...new Set(appeared.map((finding) => finding.location.path))].sort((left, right) =>
    left.localeCompare(right),
  );
  return { month, findings: appeared.length, files };
}

/**
 * Scan once, then project each month with `applyAsOf` on the month's last day. Does not rescan.
 */
export async function buildTimelapse(scanned: ScanResult, from: string, to: string): Promise<TimelapseFrame[]> {
  const frames: TimelapseFrame[] = [];
  for (const month of monthRange(from, to)) {
    const asOf = lastDayOfMonth(month);
    const projected = await applyAsOf(scanned, asOf);
    frames.push(frameFromScan(projected, month, asOf));
  }
  return frames;
}

/** Tree lines for one frame: every path that ever appears, red when active this month. */
export function renderTimelapseTree(frame: TimelapseFrame, allFiles: readonly string[], color: boolean): string[] {
  const active = new Set(frame.files);
  return allFiles.map((path) => {
    const mark = active.has(path) ? "*" : " ";
    const line = `${mark} ${path}`;
    if (!color || !active.has(path)) return color ? `${ANSI.dim}${line}${ANSI.reset}` : line;
    return `${ANSI.red}${line}${ANSI.reset}`;
  });
}

/** One terminal frame: date, file tree, running count. */
export function renderTimelapseFrame(
  frame: TimelapseFrame,
  allFiles: readonly string[],
  options: { color?: boolean } = {},
): string {
  const color = options.color === true;
  const word = frame.findings === 1 ? "finding" : "findings";
  const lines = [
    `Timelapse ${frame.month}`,
    "",
    ...renderTimelapseTree(frame, allFiles, color),
    "",
    `${frame.findings} ${word}`,
  ];
  return lines.join("\n");
}

/** Every frame as static text (non-TTY / `--no-animation`). */
export function renderTimelapseText(frames: readonly TimelapseFrame[], color = false): string {
  const allFiles = allTimelapseFiles(frames);
  return frames.map((frame) => renderTimelapseFrame(frame, allFiles, { color })).join("\n\n");
}

/** Union of every file that appears in any frame, sorted. */
export function allTimelapseFiles(frames: readonly TimelapseFrame[]): string[] {
  return [...new Set(frames.flatMap((frame) => frame.files))].sort((left, right) => left.localeCompare(right));
}

export interface TimelapseIo {
  isTTY: boolean;
  write: (text: string) => void;
  sleep: (ms: number) => Promise<void>;
  onInterrupt: (handler: () => void) => () => void;
  onKey?: (handler: () => void) => () => void;
}

function defaultIo(): TimelapseIo {
  return {
    isTTY: Boolean(process.stdout.isTTY),
    write: (text) => {
      process.stdout.write(text);
    },
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    onInterrupt: (handler) => {
      process.on("SIGINT", handler);
      return () => {
        process.off("SIGINT", handler);
      };
    },
    onKey: (handler) => {
      if (!process.stdin.isTTY) return () => undefined;
      const onData = (): void => {
        handler();
      };
      process.stdin.resume();
      process.stdin.on("data", onData);
      return () => {
        process.stdin.off("data", onData);
      };
    },
  };
}

export interface PlayTimelapseOptions {
  noAnimation?: boolean;
  color?: boolean;
  io?: TimelapseIo;
}

/**
 * Plays one frame per month within six seconds. Off a terminal, under `CI` / `NO_COLOR` animation
 * rules, or with `noAnimation`, prints the static text. Ctrl-C restores the cursor; any key skips
 * to the final frame.
 */
export async function playTimelapse(
  frames: readonly TimelapseFrame[],
  options: PlayTimelapseOptions = {},
): Promise<number> {
  const io = options.io ?? defaultIo();
  const color = options.color ?? (io.isTTY && !process.env.NO_COLOR);
  // CI runners have no TTY, so animation stays off there without a separate env check.
  const animate = io.isTTY && !options.noAnimation;
  if (!animate || frames.length === 0) {
    io.write(`${renderTimelapseText(frames, color)}\n`);
    return 0;
  }

  const allFiles = allTimelapseFiles(frames);
  const pause = Math.floor(TIMELAPSE_MAX_MS / frames.length);
  let interrupted = false;
  let skip = false;
  const disposeInterrupt = io.onInterrupt(() => {
    interrupted = true;
  });
  const disposeKey = io.onKey?.(() => {
    skip = true;
  });

  io.write(ANSI.hideCursor);
  try {
    for (let index = 0; index < frames.length; index += 1) {
      if (interrupted) break;
      const frame = required(frames[index], "timelapse frame");
      if (index > 0) io.write(ANSI.clear);
      io.write(`${renderTimelapseFrame(frame, allFiles, { color })}\n`);
      if (index >= frames.length - 1 || skip) {
        if (skip && index < frames.length - 1) {
          io.write(ANSI.clear);
          io.write(
            `${renderTimelapseFrame(required(frames[frames.length - 1], "final frame"), allFiles, { color })}\n`,
          );
        }
        break;
      }
      await io.sleep(pause);
    }
  } finally {
    io.write(ANSI.showCursor);
    disposeInterrupt();
    disposeKey?.();
  }
  return interrupted ? 130 : 0;
}

/** `--json`: an array of `{ month, findings, files }`. */
export function renderTimelapseJson(frames: readonly TimelapseFrame[]): string {
  return `${JSON.stringify(frames, null, 2)}\n`;
}

function svgFileLines(files: readonly string[], active: ReadonlySet<string>, startY: number): string[] {
  return files.map((path, index) => {
    const y = startY + index * 22;
    const on = active.has(path);
    const fill = on ? "var(--hot)" : "var(--muted)";
    const mark = on ? "*" : "·";
    return `<text x="64" y="${y}" fill="${fill}" font-size="16" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">${mark} ${escapeXml(path)}</text>`;
  });
}

/**
 * A 1200×630 CSS-keyframe animation: one `<g>` per frame with opacity steps. No script, no
 * foreignObject, no external references. `prefers-reduced-motion` keeps the final frame visible.
 */
export function renderTimelapseSvg(frames: readonly TimelapseFrame[], repository = "this repository"): string {
  const allFiles = allTimelapseFiles(frames).slice(0, 16);
  const count = Math.max(frames.length, 1);
  const duration = TIMELAPSE_MAX_MS / 1000;
  const slice = 100 / count;
  const groups = frames.map((frame, index) => {
    const active = new Set(frame.files);
    const word = frame.findings === 1 ? "finding" : "findings";
    const isFinal = index === frames.length - 1;
    return [
      `<g class="frame${isFinal ? " final" : ""}" style="animation-delay:${((index * TIMELAPSE_MAX_MS) / count / 1000).toFixed(3)}s">`,
      `<text x="64" y="72" fill="var(--fg)" font-size="28" font-weight="700">${escapeXml(repository)}</text>`,
      `<text x="64" y="112" fill="var(--accent)" font-size="22" font-weight="600">Timelapse ${escapeXml(frame.month)}</text>`,
      ...svgFileLines(allFiles, active, 160),
      `<text x="64" y="560" fill="var(--fg)" font-size="20" font-weight="600">${frame.findings} ${word}</text>`,
      "</g>",
    ].join("");
  });
  const description = `${repository} lifecycle timelapse across ${frames.length} month${frames.length === 1 ? "" : "s"}.`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="timelapse-title timelapse-desc" class="evergreen-timelapse">`,
    `<title id="timelapse-title">Evergreen timelapse for ${escapeXml(repository)}</title>`,
    `<desc id="timelapse-desc">${escapeXml(description)}</desc>`,
    "<style>",
    ".evergreen-timelapse{--bg:#0C1110;--fg:#E7EDEA;--muted:#5E736B;--accent:#3DDC97;--hot:#E58F83}",
    "@media (prefers-color-scheme:light){.evergreen-timelapse{--bg:#FFFFFF;--fg:#0C1110;--muted:#5E736B;--accent:#1F8A5B;--hot:#B84A3E}}",
    ".evergreen-timelapse{font-family:Verdana,Geneva,DejaVu Sans,sans-serif}",
    ".evergreen-timelapse .frame{opacity:0;animation:timelapse-frame " + `${duration}s linear infinite}`,
    `@keyframes timelapse-frame{0%{opacity:1} ${slice.toFixed(3)}%{opacity:1} ${(slice + 0.001).toFixed(3)}%{opacity:0} 100%{opacity:0}}`,
    "@media (prefers-reduced-motion:reduce){.evergreen-timelapse .frame{animation:none;opacity:0}.evergreen-timelapse .frame.final{opacity:1}}",
    "</style>",
    '<rect width="1200" height="630" fill="var(--bg)"/>',
    '<rect width="16" height="630" fill="var(--accent)"/>',
    ...groups,
    "</svg>",
  ].join("");
}

/** Writes the animated SVG to `path`. */
export async function writeTimelapseSvg(
  frames: readonly TimelapseFrame[],
  path: string,
  repository?: string,
): Promise<void> {
  await writeFile(path, `${renderTimelapseSvg(frames, repository)}\n`, "utf8");
}

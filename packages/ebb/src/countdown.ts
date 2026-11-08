import type { Forecast, ForecastEvent } from "./forecast.js";
import { required } from "./required.js";

/** How far ahead the forecast behind a countdown looks, in months. */
export const COUNTDOWN_WINDOW_MONTHS = 24;
/** The span a bar represents, in days. */
export const COUNTDOWN_WINDOW_DAYS = 730;
/** How many rows a countdown shows unless `--limit` says otherwise. */
export const DEFAULT_COUNTDOWN_LIMIT = 10;
/** One animation frame per second. */
export const COUNTDOWN_TICK_MS = 1000;
/** How many one-second ticks a terminal animation runs before the final frame. */
export const COUNTDOWN_MAX_TICKS = 6;
/** The bar width in columns. */
export const COUNTDOWN_BAR_WIDTH = 24;

const DAY_SECONDS = 86_400;
const ANSI = {
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  reset: "\u001b[0m",
} as const;

export type CountdownColor = "green" | "yellow" | "red" | "dim";

export interface CountdownRow {
  subject: string;
  deadline: string;
  remainingSeconds: number;
  ruleId: string;
  location: { path: string; line?: number };
}

export interface CountdownRowsOptions {
  /** Milliseconds since the epoch the countdown is measured from. */
  now: number;
  limit?: number;
}

export interface CountdownRenderOptions {
  /** The day the countdown is for, shown in the header. */
  asOf?: string;
  /** Total bar width in columns. Defaults to `COUNTDOWN_BAR_WIDTH`. */
  barWidth?: number;
  /** When false, the output is plain ASCII. Defaults to false. */
  color?: boolean;
}

/** Green while more than 180 days remain, yellow from 30 to 180, red under 30, dim once ended. */
export function countdownColor(remainingSeconds: number): CountdownColor {
  if (remainingSeconds < 0) return "dim";
  if (remainingSeconds > 180 * DAY_SECONDS) return "green";
  if (remainingSeconds >= 30 * DAY_SECONDS) return "yellow";
  return "red";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `412d 06h 13m 09s` while time remains, or `ended 37 days ago`. */
export function formatCountdown(remainingSeconds: number): string {
  if (remainingSeconds < 0) {
    const days = Math.floor(-remainingSeconds / DAY_SECONDS);
    return `ended ${days} day${days === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(remainingSeconds / DAY_SECONDS);
  return `${days}d ${pad(Math.floor((remainingSeconds % DAY_SECONDS) / 3600))}h ${pad(Math.floor((remainingSeconds % 3600) / 60))}m ${pad(remainingSeconds % 60)}s`;
}

/** A forecast event that still affects a finding in this repository, so its first finding is there. */
interface AffectingEvent extends ForecastEvent {
  findings: [ForecastEvent["findings"][number], ...ForecastEvent["findings"][number][]];
}

function affectsRepository(event: ForecastEvent): event is AffectingEvent {
  return event.findings.length > 0;
}

/**
 * One row per subject in the forecast that affects a finding in the scanned repository, earliest deadline first.
 * Rows for the same subject are folded into the earliest one, and `limit` keeps the soonest.
 */
export function buildCountdownRows(forecast: Forecast, options: CountdownRowsOptions): CountdownRow[] {
  const events = forecast.groups
    .flatMap((group) => group.events)
    .filter(affectsRepository)
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.title.localeCompare(right.title) ||
        left.ruleId.localeCompare(right.ruleId),
    );
  const seen = new Set<string>();
  const rows: CountdownRow[] = [];
  for (const event of events) {
    if (seen.has(event.title)) continue;
    seen.add(event.title);
    const finding = required(event.findings[0], "affecting finding");
    rows.push({
      subject: event.title,
      deadline: event.date,
      remainingSeconds: Math.floor((Date.parse(`${event.date}T00:00:00Z`) - options.now) / 1000),
      ruleId: event.ruleId,
      location: { path: finding.path, ...(finding.line === undefined ? {} : { line: finding.line }) },
    });
  }
  return rows.slice(0, options.limit ?? DEFAULT_COUNTDOWN_LIMIT);
}

function renderBar(remainingSeconds: number, width: number, color: boolean): string {
  const ratio = Math.min(1, Math.max(0, remainingSeconds / (COUNTDOWN_WINDOW_DAYS * DAY_SECONDS)));
  const cells = Math.round(ratio * width);
  const filled = (color ? "█" : "#").repeat(cells);
  const empty = (color ? "░" : ".").repeat(width - cells);
  return color ? `${ANSI[countdownColor(remainingSeconds)]}${filled}${empty}${ANSI.reset}` : `${filled}${empty}`;
}

/** The static frame: one header and one line per row. */
export function renderCountdown(rows: readonly CountdownRow[], options: CountdownRenderOptions = {}): string {
  const header =
    options.asOf === undefined
      ? "Lifecycle countdown"
      : `Lifecycle countdown as of ${options.asOf} (deadlines at 00:00 UTC)`;
  if (rows.length === 0) return `${header}\n\nNo dated lifecycle deadlines affect this repository.`;
  const width =
    options.barWidth === undefined || options.barWidth < 1 ? COUNTDOWN_BAR_WIDTH : Math.floor(options.barWidth);
  const durations = rows.map((row) => formatCountdown(row.remainingSeconds));
  const subjectWidth = Math.max(...rows.map((row) => row.subject.length));
  const durationWidth = Math.max(...durations.map((duration) => duration.length));
  const lines = [header, ""];
  rows.forEach((row) => {
    lines.push(
      `${row.subject.padEnd(subjectWidth)}  ${renderBar(row.remainingSeconds, width, options.color === true)}  ${formatCountdown(row.remainingSeconds).padStart(durationWidth)}`,
    );
  });
  return lines.join("\n");
}

/** The `--json` document: the rows exactly as the text frame counts them down. */
export function renderCountdownJson(rows: readonly CountdownRow[], now: number): string {
  return JSON.stringify({ schemaVersion: "evergreen.countdown.v1", asOf: new Date(now).toISOString(), rows }, null, 2);
}

export interface CountdownIo {
  isTTY: boolean;
  write: (text: string) => void;
  setInterval: (callback: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
  /** Registers the interrupt handler and returns a function that removes it. */
  onInterrupt: (handler: () => void) => () => void;
}

export interface CountdownOptions {
  forecast: Forecast;
  /** Milliseconds since the epoch the first frame counts down from. */
  now: number;
  /** The day the countdown is for, shown in the header. */
  asOf: string;
  limit?: number;
  /** Print one frame and return. */
  once?: boolean;
  /** Print one frame and return, even on a terminal. */
  noAnimation?: boolean;
  /** Overrides the terminal's color decision. */
  color?: boolean;
  io?: CountdownIo;
}

function defaultIo(): CountdownIo {
  return {
    isTTY: Boolean(process.stdout.isTTY),
    write: (text) => {
      process.stdout.write(text);
    },
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: (handle) => {
      clearInterval(handle as ReturnType<typeof setInterval>);
    },
    onInterrupt: (handler) => {
      process.on("SIGINT", handler);
      return () => {
        process.off("SIGINT", handler);
      };
    },
  };
}

/**
 * Prints the countdown. Off a terminal, with `--once`, or with `--no-animation` it prints one frame. On a terminal
 * it rewrites the frame once per second for six seconds, then stops on the final frame. Ctrl-C clears the timer and
 * the signal listener and returns `130`.
 */
export async function runCountdown(options: CountdownOptions): Promise<number> {
  const io = options.io ?? defaultIo();
  const color = options.color ?? (io.isTTY && !process.env.NO_COLOR);
  const frame = (elapsedSeconds: number): string =>
    renderCountdown(
      buildCountdownRows(options.forecast, {
        now: options.now + elapsedSeconds * 1000,
        ...(options.limit === undefined ? {} : { limit: options.limit }),
      }),
      {
        asOf: options.asOf,
        color,
      },
    );

  const first = frame(0);
  io.write(`${first}\n`);
  if (!io.isTTY || options.once || options.noAnimation) return 0;

  return await new Promise<number>((resolve) => {
    let height = first.split("\n").length;
    let ticks = 0;
    let timer: unknown;
    let dispose: (() => void) | undefined;
    let finished = false;
    const finish = (code: number): void => {
      if (finished) return;
      finished = true;
      io.clearInterval(timer);
      dispose?.();
      resolve(code);
    };
    timer = io.setInterval(() => {
      ticks += 1;
      const next = frame(ticks);
      io.write(`\u001b[${height}A${next}\n`);
      height = next.split("\n").length;
      if (ticks >= COUNTDOWN_MAX_TICKS) finish(0);
    }, COUNTDOWN_TICK_MS);
    dispose = io.onInterrupt(() => finish(130));
  });
}

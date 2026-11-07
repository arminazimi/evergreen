import { cp, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { builtInDetectors } from "./detectors/index.js";
import { scanRepository } from "./engine/index.js";
import { renderPatches } from "./fix/render-patches.js";
import type { FilePatch, FixPlan, FixRefusal } from "./fix/types.js";

const execute = promisify(execFile);

/** The longest `fix --show` plays on a terminal, in milliseconds. Longer plays are sped up, then skipped to the end. */
export const FIX_SHOW_MAX_MS = 6000;
/** The pause after each typed character, before any speed-up. */
export const FIX_SHOW_CHAR_MS = 8;
/** The pause after each line, before any speed-up. */
export const FIX_SHOW_LINE_MS = 60;

const ANSI = {
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  bold: "\u001b[1m",
  reset: "\u001b[0m",
} as const;

type Style = keyof Omit<typeof ANSI, "reset"> | "plain";

/** One line of the show: the text, how it is colored, and whether it is typed out or appears at once. */
export interface ShowLine {
  text: string;
  style: Style;
  typed: boolean;
}

/** The finding counts a show ends on. `after` is what a fresh scan reports once the patches are applied. */
export interface ShowCounts {
  before: number;
  after: number;
}

/** The removed and added lines of one unified diff, with each hunk header; context and file headers are left out. */
export function diffChanges(diff: string): ShowLine[] {
  const lines: ShowLine[] = [];
  let inHunk = false;
  for (const line of diff.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true;
      lines.push({ text: line, style: "dim", typed: false });
    } else if (!inHunk) {
      continue;
    } else if (line.startsWith("-")) {
      lines.push({ text: line, style: "red", typed: true });
    } else if (line.startsWith("+")) {
      lines.push({ text: line, style: "green", typed: true });
    }
  }
  return lines;
}

function location(refusal: FixRefusal): string {
  return refusal.line === undefined ? refusal.path : `${refusal.path}:${refusal.line}`;
}

/** Every line of the show in order: each patch, then the refusals, then the final count. */
export function buildShowLines(plan: FixPlan, counts: ShowCounts): ShowLine[] {
  const lines: ShowLine[] = [];
  for (const patch of plan.patches) {
    lines.push({ text: patch.path, style: "bold", typed: false });
    lines.push(...diffChanges(patch.diff));
    lines.push({ text: "", style: "plain", typed: false });
  }
  if (plan.refusals.length > 0) {
    lines.push({ text: "Left unchanged:", style: "dim", typed: false });
    for (const refusal of plan.refusals) {
      lines.push({
        text: `  ${refusal.ruleId} at ${location(refusal)}: ${refusal.reason}`,
        style: "dim",
        typed: false,
      });
    }
    lines.push({ text: "", style: "plain", typed: false });
  }
  const word = counts.after === 1 ? "finding" : "findings";
  lines.push({
    text: `${counts.before} → ${counts.after} ${word}`,
    style: "bold",
    typed: false,
  });
  return lines;
}

function paint(text: string, style: Style, color: boolean): string {
  if (!color || style === "plain" || text === "") return text;
  return `${ANSI[style]}${text}${ANSI.reset}`;
}

/** The same content as the animation, printed at once: colored diffs on a terminal, plain `-`/`+` lines elsewhere. */
export function renderShowStatic(plan: FixPlan, counts: ShowCounts, color = false): string {
  return buildShowLines(plan, counts)
    .map((line) => `${paint(line.text, line.style, color)}\n`)
    .join("");
}

export interface ShowIo {
  isTTY: boolean;
  write: (text: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface ShowOptions {
  /** Print the static view even on a terminal. */
  noAnimation?: boolean;
  /** Overrides the terminal's color decision. */
  color?: boolean;
  io?: ShowIo;
}

function defaultIo(): ShowIo {
  return {
    isTTY: Boolean(process.stdout.isTTY),
    write: (text) => {
      process.stdout.write(text);
    },
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    now: () => Date.now(),
  };
}

/**
 * Plays the fix. Off a terminal, or with `noAnimation`, it prints the static view. On a terminal each changed line
 * is typed out with a short delay, and the whole play is held to six seconds: a long plan is typed faster, and if the
 * clock still runs out the rest is printed at once. Either way the text written equals the static view.
 */
export async function playFixShow(plan: FixPlan, counts: ShowCounts, options: ShowOptions = {}): Promise<void> {
  const io = options.io ?? defaultIo();
  const color = options.color ?? (io.isTTY && !process.env.NO_COLOR);
  if (!io.isTTY || options.noAnimation) {
    io.write(renderShowStatic(plan, counts, color));
    return;
  }

  await typeLines(buildShowLines(plan, counts), io, color);
}

/** Types the changed lines at a pace that fits the six-second cap, and prints everything left once the cap is hit. */
async function typeLines(lines: readonly ShowLine[], io: ShowIo, color: boolean): Promise<void> {
  const typedChars = lines.filter((line) => line.typed).reduce((sum, line) => sum + line.text.length, 0);
  const raw = typedChars * FIX_SHOW_CHAR_MS + lines.length * FIX_SHOW_LINE_MS;
  // Leave headroom under the cap for timer overshoot.
  const scale = Math.min(1, (FIX_SHOW_MAX_MS * 0.8) / Math.max(raw, 1));
  const charMs = FIX_SHOW_CHAR_MS * scale;
  const lineMs = FIX_SHOW_LINE_MS * scale;
  // Timers do not fire faster than about 4 ms, so type several characters per pause instead.
  const chunk = Math.max(1, Math.ceil(4 / Math.max(charMs, 0.001)));
  const started = io.now();
  const overtime = (): boolean => io.now() - started >= FIX_SHOW_MAX_MS;

  let skipping = false;
  for (const line of lines) {
    if (line.typed && !skipping) skipping = await typeText(line, io, color, { charMs, chunk, overtime });
    else io.write(paint(line.text, line.style, color));
    io.write("\n");
    skipping = skipping || overtime();
    if (!skipping && lineMs >= 1) await io.sleep(lineMs);
  }
}

/** Types one line piece by piece. Returns true when the cap was hit and the rest of the line was printed at once. */
async function typeText(
  line: ShowLine,
  io: ShowIo,
  color: boolean,
  pace: { charMs: number; chunk: number; overtime: () => boolean },
): Promise<boolean> {
  for (let index = 0; index < line.text.length; index += pace.chunk) {
    const piece = line.text.slice(index, index + pace.chunk);
    io.write(paint(piece, line.style, color));
    if (pace.overtime()) {
      io.write(paint(line.text.slice(index + pace.chunk), line.style, color));
      return true;
    }
    await io.sleep(pace.charMs * piece.length);
  }
  return false;
}

/**
 * How many findings a scan reports once the patches are applied. It scans a temporary copy of the repository with the
 * patches applied and removes the copy afterwards; the repository itself is never written.
 */
export async function countFindingsAfter(
  root: string,
  patches: readonly FilePatch[],
  options: { noCache?: boolean } = {},
): Promise<number> {
  const copy = await mkdtemp(join(tmpdir(), "evergreen-fix-show-"));
  try {
    await cp(resolve(root), copy, {
      recursive: true,
      verbatimSymlinks: true,
      filter: (source) => !/(^|[\\/])(\.git|node_modules)$/.test(source),
    });
    const child = execute("git", ["apply", "--whitespace=nowarn", "-"], {
      cwd: copy,
      maxBuffer: 64 * 1024 * 1024,
    });
    child.child.stdin?.end(renderPatches([...patches]));
    await child;
    const scanned = await scanRepository(copy, builtInDetectors, {
      noCache: options.noCache ?? false,
    });
    return scanned.findings.length;
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
}

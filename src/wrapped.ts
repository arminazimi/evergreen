import { writeFile } from "node:fs/promises";
import process from "node:process";

import { CODEOWNERS_LOCATIONS, ownersOf, parseCodeowners } from "./codeowners.js";
import { compareFindings, DiffError, git, scanRef } from "./diff.js";
import type { Detector } from "./sdk.js";
import type { Finding } from "./domain.js";
import { required } from "./required.js";

const DAY_MS = 86_400_000;

/** The longest `wrapped` play on a terminal, in milliseconds. */
export const WRAPPED_MAX_MS = 6000;

const FONT_SANS = "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => required(XML_ESCAPES[character], "the xml escape"));

export class WrappedError extends DiffError {
  override name = "WrappedError";
}

/** One CODEOWNERS owner and how many fixed findings that owner covers. */
export interface WrappedOwner {
  owner: string;
  fixed: number;
}

/** A dated finding called out on a card. */
export interface WrappedDatedFinding {
  title: string;
  ruleId: string;
  deadline: string;
  /** Whole days the deadline has been past on the review as-of day; only on longest-ended. */
  daysPast?: number;
}

/** Year-in-review facts: fixed and introduced match `evergreen diff <base>..<head> --json`. */
export interface WrappedResult {
  schemaVersion: "evergreen.wrapped.v1";
  year: number;
  base: string;
  head: string;
  /** True when the repository had no commit before the year and the first commit was used as base. */
  usedFirstCommitFallback: boolean;
  fixed: number;
  introduced: number;
  /** `fixed - introduced`: positive means more findings were cleared than added. */
  net: number;
  longestEnded?: WrappedDatedFinding;
  /** Top three CODEOWNERS owners by fixed findings; omitted when the repository has no CODEOWNERS. */
  topOwners?: WrappedOwner[];
  /** Earliest deadline among head findings that fall in the year after `year`. */
  nextDeadline?: WrappedDatedFinding;
}

export interface WrappedOptions {
  /** Calendar year to review. Defaults to the current UTC year. */
  year?: number;
  /** Day longest-ended and "past" are judged against (YYYY-MM-DD). Defaults from the year. */
  asOf?: string;
}

function gitText(root: string, args: string[]): string {
  return git(root, args).toString("utf8").trim();
}

/** Reads CODEOWNERS text from a ref without touching the working tree. */
function codeownersText(root: string, ref: string): string | undefined {
  for (const location of CODEOWNERS_LOCATIONS) {
    try {
      return gitText(root, ["show", `${ref}:${location}`]);
    } catch {
      continue;
    }
  }
  return undefined;
}

function isIsoYear(value: string): boolean {
  return /^\d{4}$/.test(value);
}

/** Parses `--year` as a four-digit calendar year. */
export function parseWrappedYear(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!isIsoYear(value)) throw new WrappedError(`"${value}" is not a year. Use a four-digit year such as 2025.`);
  return Number(value);
}

/** The day longest-ended is judged against: end of a past year, or today for the current year. */
export function defaultAsOf(year: number, today = new Date().toISOString().slice(0, 10)): string {
  const currentYear = Number(today.slice(0, 4));
  return year < currentYear ? `${year}-12-31` : today;
}

/**
 * Resolves the year window the same way `diff` resolves refs: the last commit before 1 January of
 * `year` (or the first commit when none exists), and HEAD (or the last commit of that year).
 */
export function resolveWrappedRefs(
  root: string,
  year: number,
): { base: string; head: string; usedFirstCommitFallback: boolean } {
  git(root, ["rev-parse", "--is-inside-work-tree"]);
  const beforeYear = `${year}-01-01 00:00:00 +0000`;
  const afterYear = `${year + 1}-01-01 00:00:00 +0000`;
  const currentYear = Number(new Date().toISOString().slice(0, 4));
  const head =
    year < currentYear
      ? gitText(root, ["rev-list", "-n", "1", `--before=${afterYear}`, "HEAD"])
      : gitText(root, ["rev-parse", "HEAD"]);
  if (!head) throw new WrappedError(`No commits on or before ${year}.`);
  const before = gitText(root, ["rev-list", "-n", "1", `--before=${beforeYear}`, "HEAD"]);
  if (before) return { base: before, head, usedFirstCommitFallback: false };
  const first = gitText(root, ["rev-list", "--max-parents=0", "HEAD"]).split("\n")[0] ?? "";
  if (!first) throw new WrappedError("This repository has no commits.");
  return { base: first, head, usedFirstCommitFallback: true };
}

/** The head finding whose deadline is furthest past `asOf`; ties prefer the earlier deadline. */
export function longestEndedFinding(findings: readonly Finding[], asOf: string): WrappedDatedFinding | undefined {
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  let best: WrappedDatedFinding | undefined;
  for (const finding of findings) {
    if (finding.deadline === undefined || finding.deadline >= asOf) continue;
    const deadlineMs = Date.parse(`${finding.deadline}T00:00:00Z`);
    if (Number.isNaN(deadlineMs)) continue;
    const daysPast = Math.floor((asOfMs - deadlineMs) / DAY_MS);
    const better =
      best === undefined ||
      daysPast > (best.daysPast ?? 0) ||
      (daysPast === best.daysPast && finding.deadline < best.deadline) ||
      (daysPast === best.daysPast && finding.deadline === best.deadline && finding.ruleId < best.ruleId);
    if (better) {
      best = { title: finding.title, ruleId: finding.ruleId, deadline: finding.deadline, daysPast };
    }
  }
  return best;
}

/** The earliest head finding whose deadline falls in the calendar year after `year`. */
export function nextDeadlineInComingYear(findings: readonly Finding[], year: number): WrappedDatedFinding | undefined {
  const start = `${year + 1}-01-01`;
  const end = `${year + 1}-12-31`;
  let best: WrappedDatedFinding | undefined;
  for (const finding of findings) {
    if (finding.deadline === undefined || finding.deadline < start || finding.deadline > end) continue;
    if (best === undefined || finding.deadline < best.deadline) {
      best = { title: finding.title, ruleId: finding.ruleId, deadline: finding.deadline };
    }
  }
  return best;
}

/** Top three CODEOWNERS owners by fixed findings; `undefined` when there is no CODEOWNERS text. */
export function topOwnersByFixed(fixed: readonly Finding[], text: string | undefined): WrappedOwner[] | undefined {
  if (text === undefined) return undefined;
  const rules = parseCodeowners(text);
  const counts = new Map<string, number>();
  for (const finding of fixed) {
    for (const owner of ownersOf(rules, finding.location.path)) {
      counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([owner, count]) => ({ owner, fixed: count }))
    .sort((left, right) => right.fixed - left.fixed || left.owner.localeCompare(right.owner))
    .slice(0, 3);
}

/**
 * Builds the year-in-review from git objects alone. Fixed and introduced counts match
 * `evergreen diff <base>..<head> --json` for the same refs.
 */
export async function buildWrapped(
  root: string,
  detectors: readonly Detector[],
  options: WrappedOptions = {},
): Promise<WrappedResult> {
  const year = options.year ?? Number(new Date().toISOString().slice(0, 4));
  const asOf = options.asOf ?? defaultAsOf(year);
  const { base, head, usedFirstCommitFallback } = resolveWrappedRefs(root, year);
  const [baseFindings, headFindings] = await Promise.all([
    scanRef(root, base, detectors),
    scanRef(root, head, detectors),
  ]);
  const compared = compareFindings(baseFindings, headFindings);
  const owners = topOwnersByFixed(compared.fixed, codeownersText(root, head));
  const longestEnded = longestEndedFinding(headFindings, asOf);
  const nextDeadline = nextDeadlineInComingYear(headFindings, year);
  return {
    schemaVersion: "evergreen.wrapped.v1",
    year,
    base,
    head,
    usedFirstCommitFallback,
    fixed: compared.fixed.length,
    introduced: compared.introduced.length,
    net: compared.fixed.length - compared.introduced.length,
    ...(longestEnded === undefined ? {} : { longestEnded }),
    ...(owners === undefined ? {} : { topOwners: owners }),
    ...(nextDeadline === undefined ? {} : { nextDeadline }),
  };
}

/** One terminal card: a title and the body lines under it. */
export function buildWrappedCards(result: WrappedResult): string[] {
  const cards = [
    `Findings fixed in ${result.year}\n${result.fixed}`,
    `Findings introduced in ${result.year}\n${result.introduced}`,
    `Net change\n${result.net >= 0 ? `+${result.net}` : String(result.net)}`,
  ];
  if (result.longestEnded !== undefined) {
    const item = result.longestEnded;
    cards.push(
      `Longest-ended still present\n${item.title}\nended ${item.deadline} · ${item.daysPast} day${item.daysPast === 1 ? "" : "s"} past`,
    );
  }
  if (result.topOwners !== undefined) {
    const lines =
      result.topOwners.length === 0
        ? ["(no owned fixed findings)"]
        : result.topOwners.map((entry, index) => `${index + 1}. ${entry.owner} · ${entry.fixed} fixed`);
    cards.push(`Top CODEOWNERS by fixes\n${lines.join("\n")}`);
  }
  if (result.nextDeadline !== undefined) {
    const item = result.nextDeadline;
    cards.push(`Next deadline in ${result.year + 1}\n${item.deadline}\n${item.title}`);
  }
  return cards;
}

/** All cards as static text, with an optional first-commit fallback notice. */
export function renderWrappedText(result: WrappedResult): string {
  const notice = result.usedFirstCommitFallback
    ? `No commit before ${result.year}; comparing against the first commit.\n\n`
    : "";
  return `${notice}${buildWrappedCards(result).join("\n\n")}`;
}

export interface WrappedIo {
  isTTY: boolean;
  write: (text: string) => void;
  sleep: (ms: number) => Promise<void>;
}

export interface PlayWrappedOptions {
  noAnimation?: boolean;
  io?: WrappedIo;
}

function defaultIo(): WrappedIo {
  return {
    isTTY: Boolean(process.stdout.isTTY),
    write: (text) => {
      process.stdout.write(text);
    },
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
  };
}

/**
 * Plays pre-built cards one at a time within six seconds. Used by `playWrapped` and by tests that need a
 * single-card or empty-card schedule.
 */
export async function animateWrappedCards(cards: readonly string[], io: WrappedIo, notice?: string): Promise<void> {
  if (notice !== undefined && notice !== "") io.write(`${notice}\n\n`);
  const pause = Math.floor(WRAPPED_MAX_MS / Math.max(cards.length, 1));
  for (let index = 0; index < cards.length; index += 1) {
    if (index > 0) io.write("\u001b[2J\u001b[H");
    io.write(`${cards[index]}\n`);
    if (index < cards.length - 1) await io.sleep(pause);
  }
}

/**
 * Plays the cards one at a time on a terminal, within six seconds total. Off a terminal, or with
 * `noAnimation`, prints the static text.
 */
export async function playWrapped(result: WrappedResult, options: PlayWrappedOptions = {}): Promise<void> {
  const io = options.io ?? defaultIo();
  if (!io.isTTY || options.noAnimation) {
    io.write(`${renderWrappedText(result)}\n`);
    return;
  }
  const notice = result.usedFirstCommitFallback
    ? `No commit before ${result.year}; comparing against the first commit.`
    : undefined;
  await animateWrappedCards(buildWrappedCards(result), io, notice);
}

/** A 1200×630 summary card for sharing. No script and no external references. */
export function renderWrappedSvg(result: WrappedResult, repository = "this repository"): string {
  const rows: Array<[string, string]> = [
    ["Fixed", String(result.fixed)],
    ["Introduced", String(result.introduced)],
    ["Net", result.net >= 0 ? `+${result.net}` : String(result.net)],
  ];
  if (result.longestEnded !== undefined) {
    rows.push(["Longest ended", `${result.longestEnded.deadline} · ${result.longestEnded.title}`]);
  }
  if (result.topOwners !== undefined && result.topOwners.length > 0) {
    rows.push(["Top owners", result.topOwners.map((entry) => entry.owner).join(", ")]);
  }
  if (result.nextDeadline !== undefined) {
    rows.push(["Next deadline", `${result.nextDeadline.deadline} · ${result.nextDeadline.title}`]);
  }
  const description = `${repository} ${result.year}: fixed ${result.fixed}, introduced ${result.introduced}, net ${result.net}.`;
  const rowHeight = Math.min(64, Math.floor(360 / Math.max(rows.length, 1)));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="wrapped-title wrapped-desc" font-family="${FONT_SANS}">`,
    `<title id="wrapped-title">Evergreen wrapped ${result.year} for ${escapeXml(repository)}</title>`,
    `<desc id="wrapped-desc">${escapeXml(description)}</desc>`,
    '<rect width="1200" height="630" fill="#0C1110"/>',
    '<rect width="16" height="630" fill="#3DDC97"/>',
    '<rect x="64" y="64" width="1072" height="502" rx="24" fill="#17211E" stroke="#23423A"/>',
    `<text x="96" y="140" fill="#F3F6F4" font-size="42" font-weight="700">${escapeXml(repository)}</text>`,
    `<text x="96" y="196" fill="#3DDC97" font-size="28" font-weight="600">${result.year} wrapped</text>`,
    '<text x="96" y="248" fill="#9AC7B6" font-size="18" font-weight="500">evergreen</text>',
    '<line x1="96" y1="280" x2="1104" y2="280" stroke="#23423A"/>',
    ...rows.flatMap(([label, value], index) => {
      const y = 330 + index * rowHeight;
      return [
        `<text x="96" y="${y}" fill="#9AC7B6" font-size="16" font-weight="500">${escapeXml(label)}</text>`,
        `<text x="96" y="${y + 28}" fill="#F3F6F4" font-size="22" font-weight="600">${escapeXml(value)}</text>`,
      ];
    }),
    "</svg>",
  ].join("");
}

/** Writes the summary SVG to `path`. */
export async function writeWrappedSvg(result: WrappedResult, path: string, repository?: string): Promise<void> {
  await writeFile(path, `${renderWrappedSvg(result, repository)}\n`, "utf8");
}

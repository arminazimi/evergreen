import { isoDate } from "./canonical.js";
import type { DraftRule, Importer } from "./types.js";

export const APP_STORE_REQUIREMENTS_URL = "https://developer.apple.com/news/upcoming-requirements/";
/** Refuse a page larger than this so a runaway response cannot hang the importer. */
export const MAXIMUM_BODY_BYTES = 2 * 1024 * 1024;
/** Stop after this many `<article>` blocks so a pathological listing stays bounded. */
export const MAXIMUM_ARTICLES = 2000;

const SOURCE_TITLE = "App Store upcoming requirements";
const SINCE = /^Since ([A-Za-z]+) (\d{1,2}), (\d{4})$/;
const XCODE_BUILT = /\bbuilt with\s+Xcode\s+(\d+(?:\.\d+)*)(\s+or later)?/i;
const ARTICLE_ID = /\bid="article-([^"]{1,64})"/i;
const TITLE_HREF = /href="([^"]{1,500})"/i;
const MONTHS: Record<string, string> = {
  January: "01",
  February: "02",
  March: "03",
  April: "04",
  May: "05",
  June: "06",
  July: "07",
  August: "08",
  September: "09",
  October: "10",
  November: "11",
  December: "12",
};

interface Article {
  id: string;
  href: string;
  title: string;
  since: string;
  text: string;
}

interface XcodeFloor {
  version: string;
  deadline: string;
  title: string;
  url: string;
  quote: string;
  sinceLabel: string;
}

export interface ParseArticlesResult {
  articles: Article[];
  notes: string[];
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function plainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function parseSince(value: string): string | undefined {
  const match = SINCE.exec(value.trim());
  if (!match) return undefined;
  const month = MONTHS[match[1]!];
  if (!month) return undefined;
  return `${match[3]}-${month}-${match[2]!.padStart(2, "0")}`;
}

function absoluteUrl(href: string): string {
  if (href.startsWith("https://")) return href;
  if (href.startsWith("/")) return `https://developer.apple.com${href}`;
  return new URL(href, APP_STORE_REQUIREMENTS_URL).href;
}

/** Slice one `<article…</article>` block starting at `from`, or undefined if it never closes. */
function articleBlock(body: string, from: number): { block: string; next: number } | undefined {
  const open = body.indexOf("<article", from);
  if (open < 0) return undefined;
  const close = body.indexOf("</article>", open);
  if (close < 0) return { block: body.slice(open), next: body.length };
  return { block: body.slice(open, close + "</article>".length), next: close + "</article>".length };
}

/**
 * Read id, title, date, and article-text from one article block with indexOf and small anchored
 * matches. Missing parts return a skip note instead of backtracking across the page.
 */
function parseArticleBlock(block: string): { article?: Article; note?: string } {
  const idMatch = ARTICLE_ID.exec(block.slice(0, 400));
  if (!idMatch) return {};
  const id = idMatch[1]!;

  const titleMarker = block.indexOf('class="article-title"');
  if (titleMarker < 0) return { note: `Skipped article block id=${id}: missing article-title.` };
  const titleChunk = block.slice(titleMarker, titleMarker + 800);
  const hrefMatch = TITLE_HREF.exec(titleChunk);
  const h2Open = titleChunk.indexOf("<h2>");
  const h2Close = h2Open < 0 ? -1 : titleChunk.indexOf("</h2>", h2Open);
  if (!hrefMatch || h2Open < 0 || h2Close < 0) {
    return { note: `Skipped article block id=${id}: missing article-title href or h2.` };
  }
  const title = plainText(titleChunk.slice(h2Open + 4, h2Close));
  if (title === "") return { note: `Skipped article block id=${id}: empty article title.` };

  const dateMarker = block.indexOf('class="lighter');
  if (dateMarker < 0 || !block.slice(dateMarker, dateMarker + 80).includes("article-date")) {
    return { note: `Skipped article "${title}" (id=${id}): missing article-date.` };
  }
  const dateOpen = block.indexOf(">", dateMarker);
  const dateClose = dateOpen < 0 ? -1 : block.indexOf("</p>", dateOpen);
  if (dateOpen < 0 || dateClose < 0) {
    return { note: `Skipped article "${title}" (id=${id}): missing article-date.` };
  }
  const since = plainText(block.slice(dateOpen + 1, dateClose));

  const textMarker = block.indexOf('class="article-text"');
  if (textMarker < 0) {
    return { note: `Skipped article "${title}" (id=${id}): missing article-text.` };
  }
  const textOpen = block.indexOf(">", textMarker);
  const textClose = textOpen < 0 ? -1 : block.indexOf("</span>", textOpen);
  if (textOpen < 0 || textClose < 0) {
    return { note: `Skipped article "${title}" (id=${id}): missing article-text.` };
  }

  return {
    article: {
      id,
      href: absoluteUrl(hrefMatch[1]!),
      title,
      since,
      text: plainText(block.slice(textOpen + 1, textClose)),
    },
  };
}

/**
 * Split the listing into `<article>` blocks in linear time, then parse each block. Caps body size
 * and article count so a changed or malformed page cannot hang the weekly importer job.
 */
export function parseArticles(body: string): ParseArticlesResult {
  const notes: string[] = [];
  if (Buffer.byteLength(body, "utf8") > MAXIMUM_BODY_BYTES) {
    notes.push(`Skipped page body over ${MAXIMUM_BODY_BYTES} bytes.`);
    return { articles: [], notes };
  }

  const articles: Article[] = [];
  let cursor = 0;
  let seen = 0;
  while (seen < MAXIMUM_ARTICLES) {
    const next = articleBlock(body, cursor);
    if (!next) break;
    seen += 1;
    cursor = next.next;
    const parsed = parseArticleBlock(next.block);
    if (parsed.note) notes.push(parsed.note);
    if (parsed.article) articles.push(parsed.article);
  }
  if (seen >= MAXIMUM_ARTICLES && body.indexOf("<article", cursor) >= 0) {
    notes.push(`Stopped after ${MAXIMUM_ARTICLES} article blocks.`);
  }
  return { articles, notes };
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function semverBound(version: string): string {
  const parts = version.split(".");
  while (parts.length < 3) parts.push("0");
  return parts.join(".");
}

function slugVersion(version: string): string {
  return version.replace(/\./g, "-");
}

function draftId(lower: string | undefined, upper: string): string {
  if (lower === undefined) return `swift.xcode.app-store-below-${slugVersion(upper)}`;
  const upperMajor = Number(upper.split(".")[0]!);
  return `swift.xcode.app-store-${slugVersion(lower)}-through-${upperMajor - 1}`;
}

function draftTitle(lower: string | undefined, upper: string): string {
  if (lower === undefined) return `Xcode older than ${upper} is not accepted for App Store uploads`;
  const upperMajor = Number(upper.split(".")[0]!);
  return `Xcode ${lower} through ${upperMajor - 1} are not accepted for App Store uploads`;
}

function draftVers(lower: string | undefined, upper: string): string {
  const high = semverBound(upper);
  if (lower === undefined) return `vers:semver/<${high}`;
  return `vers:semver/>=${semverBound(lower)}|<${high}`;
}

function draftRule(lower: string | undefined, floor: XcodeFloor): DraftRule {
  return {
    id: draftId(lower, floor.version),
    ecosystem: "swift",
    purl: "pkg:generic/xcode",
    vers: draftVers(lower, floor.version),
    event: "end-of-support",
    title: draftTitle(lower, floor.version),
    summary: `${floor.sinceLabel}. ${floor.quote}`,
    severity: "high",
    replacement: `Xcode ${floor.version} or later`,
    deadline: floor.deadline,
    sources: [
      {
        title: `${floor.title} — App Store upcoming requirements (Xcode ${floor.version})`,
        url: floor.url,
      },
    ],
  };
}

/** Exported for tests: Xcode upload floors derived from the listing page. */
export function xcodeFloors(articles: Article[]): { floors: XcodeFloor[]; notes: string[] } {
  const floors: XcodeFloor[] = [];
  const notes: string[] = [];

  for (const article of articles) {
    const deadline = parseSince(article.since);
    if (!deadline) {
      if (/Xcode/i.test(article.text)) notes.push(`Skipped "${article.title}": no readable Since date.`);
      continue;
    }

    if (/\bmust target iOS\b/i.test(article.text)) {
      notes.push(
        `Skipped "${article.title}": iOS/iPadOS deployment-target minima apply to App Store Connect uploads, not library Package.swift platforms (see follow-up for app-vs-library detection).`,
      );
      continue;
    }
    if (/\bnotary\b/i.test(article.text)) {
      notes.push(`Skipped "${article.title}": Apple notary service requirement, not App Store Connect app uploads.`);
      continue;
    }
    if (/\btvOS apps\b/i.test(article.text) && !/\biOS\b/i.test(article.text)) {
      notes.push(`Skipped "${article.title}": tvOS-only App Store submission requirement.`);
      continue;
    }

    const built = XCODE_BUILT.exec(article.text);
    if (!built) {
      if (/Xcode/i.test(article.text) && /App Store/i.test(article.text)) {
        notes.push(`Skipped "${article.title}": no readable "built with Xcode N" App Store upload floor.`);
      }
      continue;
    }
    if (!/App Store(?: Connect)?/i.test(article.text)) {
      notes.push(`Skipped "${article.title}": Xcode mention is not an App Store upload requirement.`);
      continue;
    }

    floors.push({
      version: built[1]!,
      deadline,
      title: article.title,
      url: article.href,
      quote: article.text.replace(/\s*Learn about submitting.*$/i, "").trim(),
      sinceLabel: article.since.trim(),
    });
  }

  floors.sort((left, right) => compareVersions(left.version, right.version) || left.deadline.localeCompare(right.deadline));
  const unique: XcodeFloor[] = [];
  for (const floor of floors) {
    const previous = unique[unique.length - 1];
    if (previous && previous.version === floor.version) {
      notes.push(`Skipped duplicate Xcode ${floor.version} floor from "${floor.title}" (keeping "${previous.title}").`);
      continue;
    }
    unique.push(floor);
  }
  return { floors: unique, notes };
}

export const swiftAppStoreImporter: Importer = {
  id: "swift-1",
  ecosystem: "swift",
  description: "App Store Connect Xcode upload minima from Apple's upcoming requirements listing",
  sources: [{ title: SOURCE_TITLE, url: APP_STORE_REQUIREMENTS_URL }],

  async import(context) {
    const body = await context.fetchText(APP_STORE_REQUIREMENTS_URL, { accept: "text/html" });
    const parsed = parseArticles(body);
    if (parsed.articles.length === 0) {
      return {
        rules: [],
        notes:
          parsed.notes.length > 0
            ? parsed.notes
            : ["No usable upcoming-requirements articles were found in the page."],
      };
    }

    const { floors, notes } = xcodeFloors(parsed.articles);
    notes.unshift(...parsed.notes);
    if (floors.length === 0) return { rules: [], notes };

    const today = isoDate(context.now);
    const rules: DraftRule[] = [];
    for (const [index, floor] of floors.entries()) {
      if (floor.deadline > today) {
        notes.push(`Skipped Xcode ${floor.version} floor from "${floor.title}": deadline ${floor.deadline} is still in the future.`);
        continue;
      }
      const lower = index === 0 ? undefined : floors[index - 1]!.version;
      rules.push(draftRule(lower, floor));
    }
    return { rules, notes };
  },
};

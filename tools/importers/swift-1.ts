import { isoDate } from "./canonical.js";
import type { DraftRule, Importer } from "./types.js";

export const APP_STORE_REQUIREMENTS_URL = "https://developer.apple.com/news/upcoming-requirements/";

const SOURCE_TITLE = "App Store upcoming requirements";
const ARTICLE =
  /<article\b[^>]*\bid="article-([^"]+)"[\s\S]*?<a class="article-title" href="([^"]+)"[^>]*>\s*<h2>([\s\S]*?)<\/h2>[\s\S]*?<p class="lighter\s+article-date">([^<]*)<\/p>[\s\S]*?<span class="article-text">([\s\S]*?)<\/span>/gi;
const SINCE = /^Since ([A-Za-z]+) (\d{1,2}), (\d{4})$/;
const XCODE_BUILT = /\bbuilt with\s+Xcode\s+(\d+(?:\.\d+)*)(\s+or later)?/i;
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

/** Exported for tests: every article block the importer can read from the listing page. */
export function parseArticles(body: string): Article[] {
  const articles: Article[] = [];
  for (const match of body.matchAll(ARTICLE)) {
    const [, id, href, titleHtml, since, html] = match;
    articles.push({
      id: id!,
      href: absoluteUrl(href!),
      title: plainText(titleHtml!),
      since: since!.trim(),
      text: plainText(html!),
    });
  }
  return articles;
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
    const articles = parseArticles(body);
    if (articles.length === 0) {
      return { rules: [], notes: ["No usable upcoming-requirements articles were found in the page."] };
    }

    const { floors, notes } = xcodeFloors(articles);
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

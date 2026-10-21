import { isoDate } from "./canonical.js";
import type { DraftRule, Importer } from "./types.js";

export const LAMBDA_RUNTIMES_URL = "https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html";
const SOURCE = { title: "AWS Lambda runtimes", url: LAMBDA_RUNTIMES_URL };

const MONTHS: Record<string, string> = {
  Jan: "01",
  January: "01",
  Feb: "02",
  February: "02",
  Mar: "03",
  March: "03",
  Apr: "04",
  April: "04",
  May: "05",
  Jun: "06",
  June: "06",
  Jul: "07",
  July: "07",
  Aug: "08",
  August: "08",
  Sep: "09",
  September: "09",
  Oct: "10",
  October: "10",
  Nov: "11",
  November: "11",
  Dec: "12",
  December: "12",
};

const IDENTIFIER = /^[a-z][a-z0-9.+_-]*$/i;
const DATE = /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),\s+(\d{4})$/;

export interface RuntimeRow {
  name: string;
  identifier: string;
  /** Deprecation date as YYYY-MM-DD when the cell is a calendar date. */
  deprecation?: string;
  /** Raw deprecation cell text, for notes when it is not a date. */
  deprecationText: string;
}

function cellText(html: string): string {
  const decoded = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)));
  return decoded.replace(/\s+/g, " ").trim();
}

function parseAwsDate(text: string): string | undefined {
  const match = DATE.exec(text.trim());
  if (!match) return undefined;
  const mm = MONTHS[match[1]!];
  if (!mm) return undefined;
  const year = match[3]!;
  const day = match[2]!.padStart(2, "0");
  const value = `${year}-${mm}-${day}`;
  const date = new Date(`${value}T00:00:00Z`);
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(mm) && date.getUTCDate() === Number(day)
    ? value
    : undefined;
}

/** Slice the page body that follows an `h2` with the given id, up to the next `h2`. */
export function sectionAfterHeading(html: string, headingId: string): string | undefined {
  const marker = `id="${headingId}"`;
  const at = html.indexOf(marker);
  if (at === -1) return undefined;
  const from = html.indexOf(">", at);
  if (from === -1) return undefined;
  const close = html.indexOf("</h2>", from);
  if (close === -1) return undefined;
  const body = html.slice(close + "</h2>".length);
  const next = body.search(/<h2\b/i);
  return next === -1 ? body : body.slice(0, next);
}

function firstTable(html: string): string | undefined {
  const open = html.search(/<table\b/i);
  if (open === -1) return undefined;
  const close = html.indexOf("</table>", open);
  if (close === -1) return undefined;
  return html.slice(open, close + "</table>".length);
}

function rowsOf(tableHtml: string): string[] {
  return [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]!);
}

function cellsOf(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((match) => match[1]!);
}

function codeIn(cellHtml: string): string | undefined {
  const match = /<code\b[^>]*>([^<]+)<\/code>/i.exec(cellHtml);
  return match ? match[1]!.trim() : undefined;
}

/**
 * Parse a Lambda runtimes table (supported or deprecated). Column 0 is the display name, column 1
 * the identifier (`<code>`), column 3 the deprecation date when present.
 */
export function parseRuntimeTable(tableHtml: string): RuntimeRow[] {
  const rows: RuntimeRow[] = [];
  for (const row of rowsOf(tableHtml).slice(1)) {
    const cells = cellsOf(row);
    if (cells.length < 2) continue;
    const identifier = codeIn(cells[1]!);
    if (!identifier || !IDENTIFIER.test(identifier) || identifier === "$LATEST") continue;
    const name = cellText(cells[0]!) || identifier;
    const deprecationText = cells[3] !== undefined ? cellText(cells[3]) : "";
    const deprecation = deprecationText ? parseAwsDate(deprecationText) : undefined;
    rows.push({ name, identifier, deprecationText, ...(deprecation !== undefined ? { deprecation } : {}) });
  }
  return rows;
}

/** Language family used to pick a supported replacement for a deprecated identifier. */
export function runtimeFamily(identifier: string): string {
  const id = identifier.toLowerCase();
  if (id === "nodejs" || id.startsWith("nodejs")) return "nodejs";
  if (id.startsWith("python")) return "python";
  if (id.startsWith("ruby")) return "ruby";
  if (id.startsWith("java")) return "java";
  if (id.startsWith("dotnet")) return "dotnet";
  if (id.startsWith("go")) return "go";
  if (id.startsWith("provided")) return "provided";
  return id;
}

function versionKey(identifier: string): number[] {
  return [...identifier.matchAll(/\d+/g)].map((match) => Number(match[0]));
}

function compareIdentifiers(left: string, right: string): number {
  const a = versionKey(left);
  const b = versionKey(right);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    if (x !== y) return x - y;
  }
  return left.localeCompare(right);
}

/**
 * Up to two currently supported identifiers in the same family, newest first. Go 1.x has no managed
 * successor on the supported table; AWS points customers at the OS-only `provided.al2023` runtime.
 */
export function pickReplacement(identifier: string, supported: readonly RuntimeRow[]): string | undefined {
  const family = runtimeFamily(identifier);
  const peers = supported
    .filter((row) => runtimeFamily(row.identifier) === family)
    .map((row) => row.identifier)
    .sort((left, right) => compareIdentifiers(right, left) || right.localeCompare(left));
  const chosen = peers.slice(0, 2);
  if (chosen.length === 0 && family === "go") {
    const provided = supported.find((row) => row.identifier === "provided.al2023");
    return provided?.identifier;
  }
  if (chosen.length === 0) return undefined;
  if (chosen.length === 1) return chosen[0];
  return `${chosen[0]} or ${chosen[1]}`;
}

function draftRule(row: RuntimeRow, deadline: string, today: string, replacement: string | undefined): DraftRule {
  const scheduled = deadline > today;
  return {
    id: `serverless.aws-lambda.${row.identifier}`,
    ecosystem: "serverless",
    purl: `pkg:generic/aws-lambda-runtime/${row.identifier}`,
    vers: "vers:semver/*",
    event: scheduled ? "scheduled-end-of-life" : "end-of-life",
    title: scheduled
      ? `AWS Lambda ${row.name} runtime reaches end of life on ${deadline}`
      : `AWS Lambda ${row.name} runtime is end-of-life`,
    summary: scheduled
      ? `The AWS Lambda runtimes table lists ${row.identifier} under Deprecated runtimes with deprecation date ${deadline}. After that date AWS no longer applies security or other updates to that managed runtime.`
      : `The AWS Lambda runtimes table lists ${row.identifier} under Deprecated runtimes with deprecation date ${deadline}. AWS no longer applies security or other updates to that managed runtime.`,
    severity: scheduled ? "low" : "high",
    ...(replacement !== undefined ? { replacement } : {}),
    deadline,
    sources: [SOURCE],
  };
}

export const awsLambdaRuntimesImporter: Importer = {
  id: "serverless-1",
  ecosystem: "serverless",
  description: "AWS Lambda managed runtimes that the official runtimes table lists as deprecated",
  sources: [SOURCE],

  async import(context) {
    const html = await context.fetchText(LAMBDA_RUNTIMES_URL, { accept: "text/html" });
    const supportedSection = sectionAfterHeading(html, "runtimes-supported");
    const deprecatedSection = sectionAfterHeading(html, "runtimes-deprecated");
    if (!supportedSection || !deprecatedSection) {
      return { rules: [], notes: ["The AWS Lambda runtimes page is missing the supported or deprecated heading this importer expects."] };
    }
    const supportedTable = firstTable(supportedSection);
    const deprecatedTable = firstTable(deprecatedSection);
    if (!supportedTable || !deprecatedTable) {
      return { rules: [], notes: ["The AWS Lambda runtimes page is missing a supported or deprecated table this importer can read."] };
    }

    const supported = parseRuntimeTable(supportedTable);
    const deprecated = parseRuntimeTable(deprecatedTable);
    if (deprecated.length === 0) {
      return { rules: [], notes: ["No deprecated runtime rows with identifiers were found."] };
    }

    const today = isoDate(context.now);
    const horizon = isoDate(new Date(Date.UTC(context.now.getUTCFullYear() + 1, context.now.getUTCMonth(), context.now.getUTCDate())));
    const notes: string[] = [];
    const rules: DraftRule[] = [];

    for (const row of deprecated) {
      if (row.deprecation === undefined) {
        notes.push(`Skipped ${row.identifier}: deprecation cell "${row.deprecationText || "(empty)"}" is not a calendar date.`);
        continue;
      }
      if (row.deprecation > horizon) {
        notes.push(`${row.identifier} is deprecated on ${row.deprecation}, which is more than twelve months after ${today}, so no rule was drafted.`);
        continue;
      }
      rules.push(draftRule(row, row.deprecation, today, pickReplacement(row.identifier, supported)));
    }

    const scheduledCount = rules.filter((rule) => rule.event === "scheduled-end-of-life").length;
    notes.unshift(
      `Drafted ${rules.length} rule${rules.length === 1 ? "" : "s"} on ${today}: ${rules.length - scheduledCount} end-of-life, ${scheduledCount} scheduled.`,
    );
    return { rules, notes };
  },
};

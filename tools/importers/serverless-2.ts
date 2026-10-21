import { isIsoDate } from "../../src/registry.js";
import { isoDate } from "./canonical.js";
import type { DraftRule, Importer } from "./types.js";

export const GCLOUD_RUNTIME_SUPPORT_URL = "https://cloud.google.com/functions/docs/runtime-support";
/** Force the English document; without `hl=en` Google may serve a translated page whose headers no longer match. */
export const GCLOUD_RUNTIME_SUPPORT_FETCH_URL = `${GCLOUD_RUNTIME_SUPPORT_URL}?hl=en`;
const SOURCE = { title: "Cloud Run functions runtime support", url: GCLOUD_RUNTIME_SUPPORT_URL };

const IDENTIFIER = /^[a-z][a-z0-9]*$/i;

export interface GCloudRuntimeRow {
  name: string;
  identifier: string;
  /** Deprecation cell as YYYY-MM-DD when parseable. */
  deprecation?: string;
  /** Decommission cell as YYYY-MM-DD when parseable; this is the rule deadline. */
  decommission?: string;
  deprecationText: string;
  decommissionText: string;
  preview: boolean;
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

function parseScheduleDate(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (isIsoDate(trimmed)) return trimmed;
  return undefined;
}

function rowsOf(tableHtml: string): string[] {
  return [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]!);
}

function cellsOf(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((match) => match[1]!);
}

/**
 * True when the table looks like a language runtime schedule: seven-or-more columns and at least
 * one data row whose third cell is a runtime identifier. Avoids relying on English header labels
 * (translated pages rename "Runtime ID" / "Decommission").
 */
export function isRuntimeScheduleTable(tableHtml: string): boolean {
  const rows = rowsOf(tableHtml);
  if (rows.length < 2) return false;
  if (cellsOf(rows[0]!).length < 7) return false;
  return rows.slice(1).some((row) => {
    const cells = cellsOf(row);
    return cells.length >= 7 && IDENTIFIER.test(cellText(cells[2]!));
  });
}

/**
 * Parse one language schedule table. Columns: Runtime, Generation, Runtime ID, Stacks,
 * Runtime base image, Deprecation, Decommission.
 */
export function parseGCloudRuntimeTable(tableHtml: string): GCloudRuntimeRow[] {
  const rows: GCloudRuntimeRow[] = [];
  for (const row of rowsOf(tableHtml).slice(1)) {
    const cells = cellsOf(row);
    if (cells.length < 7) continue;
    const identifier = cellText(cells[2]!);
    if (!IDENTIFIER.test(identifier)) continue;
    const name = cellText(cells[0]!) || identifier;
    const deprecationText = cellText(cells[5]!);
    const decommissionText = cellText(cells[6]!);
    const deprecation = parseScheduleDate(deprecationText);
    const decommission = parseScheduleDate(decommissionText);
    rows.push({
      name,
      identifier,
      deprecationText,
      decommissionText,
      preview: /\(preview\)/i.test(name),
      ...(deprecation !== undefined ? { deprecation } : {}),
      ...(decommission !== undefined ? { decommission } : {}),
    });
  }
  return rows;
}

/** Collect every runtime schedule table from the support page. */
export function parseGCloudRuntimePage(html: string): GCloudRuntimeRow[] {
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((match) => match[0]!);
  const rows: GCloudRuntimeRow[] = [];
  for (const table of tables) {
    if (!isRuntimeScheduleTable(table)) continue;
    rows.push(...parseGCloudRuntimeTable(table));
  }
  return rows;
}

export function runtimeFamily(identifier: string): string {
  const id = identifier.toLowerCase();
  if (id.startsWith("nodejs")) return "nodejs";
  if (id.startsWith("python")) return "python";
  if (id.startsWith("go")) return "go";
  if (id.startsWith("java")) return "java";
  if (id.startsWith("ruby")) return "ruby";
  if (id.startsWith("php")) return "php";
  if (id.startsWith("dotnet")) return "dotnet";
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

/** Up to two non-preview runtimes in the same family that are not yet decommissioned. */
export function pickReplacement(identifier: string, all: readonly GCloudRuntimeRow[], today: string): string | undefined {
  const family = runtimeFamily(identifier);
  const peers = all
    .filter((row) => runtimeFamily(row.identifier) === family)
    .filter((row) => !row.preview)
    .filter((row) => row.decommission === undefined || row.decommission > today)
    .map((row) => row.identifier)
    .sort((left, right) => compareIdentifiers(right, left) || right.localeCompare(left));
  const chosen = peers.slice(0, 2);
  if (chosen.length === 0) return undefined;
  if (chosen.length === 1) return chosen[0];
  return `${chosen[0]} or ${chosen[1]}`;
}

function draftRule(row: GCloudRuntimeRow, deadline: string, today: string, replacement: string | undefined): DraftRule {
  const scheduled = deadline > today;
  const deprecationClause =
    row.deprecation !== undefined
      ? `as deprecated on ${row.deprecation} and decommissioned on ${deadline}`
      : `as decommissioned on ${deadline}`;
  return {
    id: `serverless.google-cloud-functions.${row.identifier}`,
    ecosystem: "serverless",
    purl: `pkg:generic/google-cloud-functions-runtime/${row.identifier}`,
    vers: "vers:semver/*",
    event: scheduled ? "scheduled-end-of-life" : "end-of-life",
    title: scheduled
      ? `Google Cloud Functions ${row.name.replace(/\s*\(Preview\)\s*/i, " ").trim()} runtime reaches end of life on ${deadline}`
      : `Google Cloud Functions ${row.name.replace(/\s*\(Preview\)\s*/i, " ").trim()} runtime is end-of-life`,
    summary: scheduled
      ? `The Google Cloud Functions runtime support schedule lists ${row.name} (runtime ID ${row.identifier}) ${deprecationClause}. After the decommission date Google no longer provides maintenance for that runtime.`
      : `The Google Cloud Functions runtime support schedule lists ${row.name} (runtime ID ${row.identifier}) ${deprecationClause}. Google no longer provides maintenance for that runtime.`,
    severity: scheduled ? "low" : "high",
    ...(replacement !== undefined ? { replacement } : {}),
    deadline,
    sources: [SOURCE],
  };
}

export const gcloudFunctionsRuntimesImporter: Importer = {
  id: "serverless-2",
  ecosystem: "serverless",
  description: "Google Cloud Functions runtimes that the runtime support schedule lists as decommissioned or due for decommission",
  sources: [SOURCE],

  async import(context) {
    const html = await context.fetchText(GCLOUD_RUNTIME_SUPPORT_FETCH_URL, { accept: "text/html" });
    const rows = parseGCloudRuntimePage(html);
    if (rows.length === 0) {
      return { rules: [], notes: ["No Cloud Run functions runtime schedule tables were found on the page."] };
    }

    const today = isoDate(context.now);
    const horizon = isoDate(new Date(Date.UTC(context.now.getUTCFullYear() + 1, context.now.getUTCMonth(), context.now.getUTCDate())));
    const notes: string[] = [];
    const rules: DraftRule[] = [];

    for (const row of rows) {
      if (row.decommission === undefined) {
        if (row.decommissionText) {
          notes.push(`Skipped ${row.identifier}: decommission cell "${row.decommissionText}" is not a calendar date.`);
        } else {
          notes.push(`Skipped ${row.identifier}: no decommission date has been scheduled.`);
        }
        continue;
      }
      if (row.decommission > horizon) {
        notes.push(`${row.identifier} is decommissioned on ${row.decommission}, which is more than twelve months after ${today}, so no rule was drafted.`);
        continue;
      }
      rules.push(draftRule(row, row.decommission, today, pickReplacement(row.identifier, rows, today)));
    }

    const scheduledCount = rules.filter((rule) => rule.event === "scheduled-end-of-life").length;
    notes.unshift(
      `Drafted ${rules.length} rule${rules.length === 1 ? "" : "s"} on ${today}: ${rules.length - scheduledCount} end-of-life, ${scheduledCount} scheduled.`,
    );
    return { rules, notes };
  },
};

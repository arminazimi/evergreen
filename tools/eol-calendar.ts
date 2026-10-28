// Lists the lifecycle dates in the registry that fall in a window around today, as Markdown, an .ics file, and RSS/Atom feeds.
//
//   node dist/tools/eol-calendar.js [--today YYYY-MM-DD] [--months 6] [--recent-days 30] [--out-dir DIR] [--bundle FILE]
//
// It reads registry/*.json or a data release bundle; it never uses the network. Dates come from each rule's `deadline`.

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { addDays, addMonths } from "../src/forecast.js";
import { isIsoDate, validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";

export interface CalendarEntry {
  date: string;
  ruleId: string;
  ecosystem: string;
  title: string;
  severity: string;
  source: string;
}

export interface Calendar {
  today: string;
  until: string;
  since: string;
  upcoming: CalendarEntry[];
  recent: CalendarEntry[];
}

const order = (left: CalendarEntry, right: CalendarEntry) => left.date.localeCompare(right.date) || left.ruleId.localeCompare(right.ruleId);

export function buildCalendar(rules: readonly RegistryV2Rule[], today: string, months = 6, recentDays = 30): Calendar {
  if (!isIsoDate(today)) throw new Error(`"${today}" is not a date (YYYY-MM-DD).`);
  const until = addMonths(today, months);
  const since = addDays(today, -recentDays);
  const entries = rules
    .filter((rule) => rule.deadline !== undefined && isIsoDate(rule.deadline))
    .map((rule): CalendarEntry => ({ date: rule.deadline!, ruleId: rule.id, ecosystem: rule.ecosystem, title: rule.title, severity: rule.severity, source: rule.sources[0]?.url ?? "" }));
  return {
    today,
    until,
    since,
    upcoming: entries.filter((entry) => entry.date >= today && entry.date <= until).sort(order),
    recent: entries.filter((entry) => entry.date >= since && entry.date < today).sort(order),
  };
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function renderMarkdown(calendar: Calendar): string {
  const table = (entries: CalendarEntry[]) =>
    entries.length === 0
      ? "None in the registry.\n"
      : ["| Date | Ecosystem | Event | Severity | Rule | Source |", "|---|---|---|---|---|---|", ...entries.map((entry) => `| ${entry.date} | ${entry.ecosystem} | ${cell(entry.title)} | ${entry.severity} | \`${entry.ruleId}\` | [source](${entry.source}) |`)].join("\n") + "\n";
  return [
    "# Lifecycle calendar",
    "",
    `Generated for ${calendar.today} from the registry deadlines. It lists what ends between ${calendar.today} and ${calendar.until}, and what ended since ${calendar.since}.`,
    "",
    "## Upcoming",
    "",
    table(calendar.upcoming),
    "## Recently passed",
    "",
    table(calendar.recent),
  ].join("\n");
}

const escapeText = (text: string) => text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Strips characters XML 1.0 cannot represent, then escapes the rest for use in text or attribute values. */
function escapeXml(value: string | number): string {
  return String(value)
    .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

function toRfc822(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toUTCString();
}

/** An iCalendar file with one all-day event per entry. Uids and the stamp depend only on the data, so output is deterministic. */
export function renderIcs(calendar: Calendar): string {
  const stamp = `${calendar.today.replace(/-/g, "")}T000000Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Evergreen//Lifecycle calendar//EN", "CALSCALE:GREGORIAN"];
  for (const entry of [...calendar.recent, ...calendar.upcoming]) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${entry.ruleId}@evergreen`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${entry.date.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${addDays(entry.date, 1).replace(/-/g, "")}`,
      `SUMMARY:${escapeText(entry.title)}`,
      `DESCRIPTION:${escapeText(`${entry.ruleId} (${entry.severity}). Source: ${entry.source}`)}`,
      `URL:${entry.source}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  // RFC 5545 requires CRLF line endings.
  return `${lines.join("\r\n")}\r\n`;
}

/** Renders an RSS 2.0 feed of lifecycle dates. */
export function renderRss(calendar: Calendar): string {
  const lastBuildDate = toRfc822(calendar.today);
  const items: string[] = [];
  for (const entry of [...calendar.recent, ...calendar.upcoming]) {
    const pubDate = toRfc822(entry.date);
    const link = entry.source || `https://arminazimi.github.io/evergreen/rules/${entry.ruleId}.html`;
    const description = `${entry.ruleId} (${entry.severity}). Ecosystem: ${entry.ecosystem}. Date: ${entry.date}.${entry.source ? ` Source: ${entry.source}` : ""}`;
    items.push(
      "    <item>",
      `      <title>${escapeXml(entry.title)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      `      <guid isPermaLink="false">${escapeXml(entry.ruleId)}@evergreen</guid>`,
      `      <pubDate>${pubDate}</pubDate>`,
      `      <description>${escapeXml(description)}</description>`,
      `      <category>${escapeXml(entry.ecosystem)}</category>`,
      "    </item>",
    );
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>Evergreen Lifecycle Calendar</title>",
    "    <link>https://arminazimi.github.io/evergreen/</link>",
    "    <description>Upcoming and recent lifecycle dates from the Evergreen registry.</description>",
    "    <language>en</language>",
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    '    <atom:link href="https://arminazimi.github.io/evergreen/eol-calendar.rss" rel="self" type="application/rss+xml"/>',
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

/** Renders an Atom 1.0 feed of lifecycle dates. */
export function renderAtom(calendar: Calendar): string {
  const updated = `${calendar.today}T00:00:00Z`;
  const entries: string[] = [];
  for (const entry of [...calendar.recent, ...calendar.upcoming]) {
    const entryDate = `${entry.date}T00:00:00Z`;
    const link = entry.source || `https://arminazimi.github.io/evergreen/rules/${entry.ruleId}.html`;
    const summary = `${entry.ruleId} (${entry.severity}). Ecosystem: ${entry.ecosystem}. Date: ${entry.date}.${entry.source ? ` Source: ${entry.source}` : ""}`;
    entries.push(
      "  <entry>",
      `    <title>${escapeXml(entry.title)}</title>`,
      `    <link rel="alternate" href="${escapeXml(link)}"/>`,
      `    <id>urn:evergreen:rule:${escapeXml(entry.ruleId)}</id>`,
      `    <updated>${entryDate}</updated>`,
      `    <published>${entryDate}</published>`,
      `    <summary>${escapeXml(summary)}</summary>`,
      `    <category term="${escapeXml(entry.ecosystem)}"/>`,
      `    <content type="text">${escapeXml(`${entry.title} - ${summary}`)}</content>`,
      "  </entry>",
    );
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    "  <title>Evergreen Lifecycle Calendar</title>",
    '  <link rel="self" href="https://arminazimi.github.io/evergreen/eol-calendar.atom"/>',
    '  <link rel="alternate" href="https://arminazimi.github.io/evergreen/"/>',
    "  <id>https://arminazimi.github.io/evergreen/eol-calendar.atom</id>",
    `  <updated>${updated}</updated>`,
    "  <subtitle>Upcoming and recent lifecycle dates from the Evergreen registry.</subtitle>",
    "  <author>",
    "    <name>Evergreen</name>",
    "  </author>",
    ...entries,
    "</feed>",
    "",
  ].join("\n");
}

export async function loadRulesFromBundle(bundlePath: string): Promise<RegistryV2Rule[]> {
  const text = await readFile(bundlePath, "utf8");
  const bundle = JSON.parse(text) as {
    manifest?: { schemaVersion?: string };
    files?: Record<string, unknown>;
  };
  if (bundle.files && typeof bundle.files === "object") {
    const rules: RegistryV2Rule[] = [];
    for (const file of Object.values(bundle.files)) {
      if (file && typeof file === "object" && (file as { schemaVersion?: string }).schemaVersion === "evergreen.registry.v2") {
        rules.push(...validateRegistryV2(file as any).rules);
      }
    }
    return rules;
  }
  throw new Error(`"${bundlePath}" is not a valid data bundle.`);
}

export async function loadRules(source = "registry"): Promise<RegistryV2Rule[]> {
  const stats = await stat(source);
  if (stats.isDirectory()) {
    const rules: RegistryV2Rule[] = [];
    for (const name of (await readdir(source)).sort()) {
      if (!name.endsWith(".json")) continue;
      const value = JSON.parse(await readFile(join(source, name), "utf8")) as { schemaVersion?: string };
      if (value.schemaVersion === "evergreen.registry.v2") rules.push(...validateRegistryV2(value).rules);
    }
    return rules;
  }
  return loadRulesFromBundle(source);
}

export async function main(argv: string[]): Promise<number> {
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]!;
    if (!["--today", "--months", "--recent-days", "--out-dir", "--bundle", "--registry"].includes(flag) || argv[index + 1] === undefined) {
      throw new Error("Usage: eol-calendar [--today YYYY-MM-DD] [--months N] [--recent-days N] [--out-dir DIR] [--bundle FILE] [--registry DIR]");
    }
    options.set(flag, argv[index + 1]!);
  }
  const today = options.get("--today") ?? new Date().toISOString().slice(0, 10);
  const bundleFile = options.get("--bundle");
  const registrySource = options.get("--registry") ?? "registry";
  const rules = bundleFile ? await loadRulesFromBundle(bundleFile) : await loadRules(registrySource);
  const calendar = buildCalendar(rules, today, Number(options.get("--months") ?? 6), Number(options.get("--recent-days") ?? 30));
  const directory = resolve(options.get("--out-dir") ?? ".");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "eol-calendar.md"), renderMarkdown(calendar));
  await writeFile(join(directory, "eol-calendar.ics"), renderIcs(calendar));
  await writeFile(join(directory, "eol-calendar.rss"), renderRss(calendar));
  await writeFile(join(directory, "eol-calendar.atom"), renderAtom(calendar));
  process.stdout.write(`Wrote ${calendar.upcoming.length} upcoming and ${calendar.recent.length} recent entries to ${directory}.\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exit(1);
    },
  );
}

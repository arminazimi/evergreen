// Lists the lifecycle dates in the registry that fall in a window around today, as Markdown and an .ics file.
//
//   node dist/tools/eol-calendar.js [--today YYYY-MM-DD] [--months 6] [--recent-days 30] [--out-dir DIR]
//
// It reads registry/*.json only; it never uses the network. Dates come from each rule's `deadline`.

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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

export async function loadRules(registryDirectory = "registry"): Promise<RegistryV2Rule[]> {
  const rules: RegistryV2Rule[] = [];
  for (const name of (await readdir(registryDirectory)).sort()) {
    if (!name.endsWith(".json")) continue;
    const value = JSON.parse(await readFile(join(registryDirectory, name), "utf8")) as { schemaVersion?: string };
    if (value.schemaVersion === "evergreen.registry.v2") rules.push(...validateRegistryV2(value).rules);
  }
  return rules;
}

export async function main(argv: string[]): Promise<number> {
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]!;
    if (!["--today", "--months", "--recent-days", "--out-dir"].includes(flag) || argv[index + 1] === undefined) {
      throw new Error("Usage: eol-calendar [--today YYYY-MM-DD] [--months N] [--recent-days N] [--out-dir DIR]");
    }
    options.set(flag, argv[index + 1]!);
  }
  const today = options.get("--today") ?? new Date().toISOString().slice(0, 10);
  const calendar = buildCalendar(await loadRules(), today, Number(options.get("--months") ?? 6), Number(options.get("--recent-days") ?? 30));
  const directory = resolve(options.get("--out-dir") ?? ".");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "eol-calendar.md"), renderMarkdown(calendar));
  await writeFile(join(directory, "eol-calendar.ics"), renderIcs(calendar));
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

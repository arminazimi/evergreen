import type { DraftRule, Importer } from "./types.js";

export const ORACLE_ROADMAP_URL = "https://www.oracle.com/java/technologies/java-se-support-roadmap.html";
export const TEMURIN_SUPPORT_URL = "https://adoptium.net/support/";
const ORACLE_TITLE = "Oracle Java SE Support Roadmap";
const TEMURIN_TITLE = "Eclipse Temurin support";
const ORACLE_HEADER = "Release GA Date Premier Support Until Extended Support Until Sustaining Support";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH = String.raw`(?:${MONTHS.join("|")}) \d{4}`;
const SHORT = String.raw`[A-Z][a-z]{2} \d{4}`;

interface Group {
  first: number;
  last: number;
  /** The month the last release in the group stopped receiving Premier Support. */
  endedMonth: string;
  /** The first month too, for a range of releases. */
  startedMonth?: string;
}

function pageText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

/** The last day of a "September 2026" month, as `YYYY-MM-DD`. */
function endOfMonth(month: string): string {
  const [name, year] = month.split(" ") as [string, string];
  const index = MONTHS.indexOf(name);
  return new Date(Date.UTC(Number(year), index + 1, 0)).toISOString().slice(0, 10);
}

/** Non-LTS rows of the roadmap: `9 - 10 (non-LTS) <GA> <GA> <Premier until> <Premier until> Not Available`. */
function nonLtsGroups(text: string): Group[] {
  const start = text.indexOf(ORACLE_HEADER);
  if (start < 0) return [];
  const row = new RegExp(String.raw`(\d+)(?: - (\d+))? \(non-LTS\)\**\s+(${MONTH})(?: - (${MONTH}))?\s+(${MONTH})(?: - (${MONTH}))?\**\s+Not Available`, "g");
  return [...text.slice(start).matchAll(row)].map((match) => ({
    first: Number(match[1]),
    last: Number(match[2] ?? match[1]),
    endedMonth: match[6] ?? match[5]!,
    ...(match[6] ? { startedMonth: match[5]! } : {}),
  }));
}

/** Long-term-support releases that are released by the run date, newest last. */
function ltsReleases(text: string, today: string): number[] {
  const start = text.indexOf(ORACLE_HEADER);
  if (start < 0) return [];
  const row = new RegExp(String.raw`(\d+) \(LTS\)\**\s+(${MONTH})`, "g");
  return [...text.slice(start).matchAll(row)]
    .filter((match) => endOfMonth(match[2]!) <= today)
    .map((match) => Number(match[1]));
}

/** Releases the Temurin page marks EOSL, with their end-of-availability month. */
function temurinEosl(text: string): Map<number, string> {
  const row = new RegExp(String.raw`Java (\d+)(?: \(LTS\))? ${SHORT} ${SHORT}\s+\S+ EOSL \[2\] (${SHORT})`, "g");
  const result = new Map<number, string>();
  for (const match of text.matchAll(row)) {
    const [short, year] = match[2]!.split(" ") as [string, string];
    const name = MONTHS.find((month) => month.startsWith(short));
    if (name) result.set(Number(match[1]), `${name} ${year}`);
  }
  return result;
}

const sentenceList = (items: string[]) =>
  items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;

function rule(group: Group, eosl: Map<number, string>, replacement: string | undefined): DraftRule {
  const releases = Array.from({ length: group.last - group.first + 1 }, (_, index) => group.first + index);
  const span = group.first === group.last ? `Java ${group.first}` : group.last === group.first + 1 ? `Java ${group.first} and ${group.last}` : `Java ${group.first} to ${group.last}`;
  const listed = releases.filter((release) => eosl.has(release));
  const when = group.startedMonth ? `between ${group.startedMonth} and ${group.endedMonth}` : `in ${group.endedMonth}`;
  const temurin = listed.length > 0
    ? ` The Eclipse Temurin support page lists Java ${sentenceList(listed.map(String))} as EOSL, with end of availability in ${sentenceList(listed.map((release) => eosl.get(release)!))}.`
    : "";
  return {
    id: `java.jdk.end-of-support-${group.first === group.last ? group.first : `${group.first}-${group.last}`}`,
    ecosystem: "java",
    purl: "pkg:generic/java",
    vers: `vers:semver/>=${group.first}.0.0|<${group.last + 1}.0.0`,
    event: "end-of-support",
    title: `${span} ${group.first === group.last ? "is" : "are"} no longer supported`,
    summary: `The Oracle Java SE Support Roadmap lists ${span} as ${group.first === group.last ? "a non-LTS release" : "non-LTS releases"} whose Premier Support ended ${when}. It says a previous non-LTS release is superseded once a new feature release is made available.${temurin}`,
    severity: "high",
    ...(replacement ? { replacement } : {}),
    sources: [
      { title: ORACLE_TITLE, url: ORACLE_ROADMAP_URL },
      ...(listed.length > 0 ? [{ title: TEMURIN_TITLE, url: TEMURIN_SUPPORT_URL }] : []),
    ],
  };
}

export const javaJdkSupportImporter: Importer = {
  id: "java-1",
  ecosystem: "java",
  description: "Non-LTS JDK feature releases whose support has ended, from the Oracle Java SE roadmap and the Temurin support page",
  sources: [
    { title: ORACLE_TITLE, url: ORACLE_ROADMAP_URL },
    { title: TEMURIN_TITLE, url: TEMURIN_SUPPORT_URL },
  ],

  async import(context) {
    const oracle = pageText(await context.fetchText(ORACLE_ROADMAP_URL, { accept: "text/html" }));
    const groups = nonLtsGroups(oracle);
    if (groups.length === 0) return { rules: [], notes: ["No usable support table was found in the Oracle Java SE roadmap."] };
    const eosl = temurinEosl(pageText(await context.fetchText(TEMURIN_SUPPORT_URL, { accept: "text/html" })));

    // Time decides: a group has ended when its last Premier Support month is over.
    const today = context.now.toISOString().slice(0, 10);
    const ended = groups.filter((group) => endOfMonth(group.endedMonth) < today);
    const lts = ltsReleases(oracle, today);
    const newest = lts.at(-1);
    const replacement = newest === undefined ? undefined : `Java ${newest} (LTS) or later`;

    const notes = [
      `Long-term-support releases are not drafted: Java ${sentenceList(lts.map(String))} stay in Premier or Extended Support.`,
    ];
    if (eosl.size === 0) notes.push("No EOSL rows were found on the Temurin support page; the drafts cite only the Oracle roadmap.");
    return { rules: ended.map((group) => rule(group, eosl, replacement)), notes };
  },
};

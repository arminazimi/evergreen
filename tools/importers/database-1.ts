import { isoDate } from "./canonical.js";
import { ImporterError } from "./types.js";
import type { DraftRule, Importer } from "./types.js";

export const POSTGRESQL_VERSIONING_URL = "https://www.postgresql.org/support/versioning/";
export const MAXIMUM_PAGE_BYTES = 512 * 1024;

/** Majors older than this use the 9.x two-part numbering, which the registry does not cover. */
export const FIRST_DRAFTED_MAJOR = 10;

/** A supported major whose final release is closer than this is not offered as the replacement. */
const REPLACEMENT_HORIZON_DAYS = 365;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Release {
  major: number;
  supported: boolean;
  finalRelease: string;
}

function text(cell: string): string {
  return cell.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** "November 14, 2030" to "2030-11-14"; undefined for anything else. */
export function toIsoDate(value: string): string | undefined {
  const match = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(value);
  const month = match ? MONTHS.indexOf(match[1]!) : -1;
  if (!match || month < 0) return undefined;
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
}

/** The rows of the versioning table: version, current minor, supported, first release, final release. */
export function parseVersioningTable(html: string): Release[] {
  const releases: Release[] = [];
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => text(cell[1]!));
    if (cells.length !== 5 || !/^\d+$/.test(cells[0]!) || !/^(Yes|No)$/.test(cells[2]!)) continue;
    const finalRelease = toIsoDate(cells[4]!);
    if (!finalRelease) continue;
    releases.push({ major: Number(cells[0]), supported: cells[2] === "Yes", finalRelease });
  }
  return releases;
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

/**
 * Reads the PostgreSQL versioning policy table and drafts one `end-of-life` rule for each major
 * (10 and later) that the page marks unsupported and whose final release date has passed. A supported
 * major whose final release is within twelve months is drafted as a `scheduled-end-of-life` rule (decision
 * 0010); a later one is only noted, and neither is an unsupported one whose final release is in the future.
 */
export const postgresqlVersioningImporter: Importer = {
  id: "database-1",
  ecosystem: "database",
  description: "PostgreSQL major versions marked unsupported on the PostgreSQL versioning policy page",
  sources: [{ title: "PostgreSQL versioning policy", url: POSTGRESQL_VERSIONING_URL }],

  async import(context) {
    const page = await context.fetchText(POSTGRESQL_VERSIONING_URL);
    if (page.length > MAXIMUM_PAGE_BYTES) {
      throw new ImporterError(`GET ${POSTGRESQL_VERSIONING_URL} returned more than ${MAXIMUM_PAGE_BYTES} bytes.`);
    }
    const releases = parseVersioningTable(page);
    if (releases.length === 0) throw new ImporterError(`No version rows found in ${POSTGRESQL_VERSIONING_URL}.`);

    const today = isoDate(context.now);
    const horizon = addDays(today, REPLACEMENT_HORIZON_DAYS);
    const scheduledHorizon = isoDate(new Date(Date.UTC(context.now.getUTCFullYear() + 1, context.now.getUTCMonth(), context.now.getUTCDate())));
    const oldestLongLived = releases
      .filter((release) => release.supported && release.finalRelease > horizon)
      .sort((left, right) => left.major - right.major)[0];
    const replacement = oldestLongLived ? `PostgreSQL ${oldestLongLived.major} or later` : undefined;

    const rules: DraftRule[] = [];
    const notes: string[] = [];
    for (const release of releases.filter((candidate) => candidate.major >= FIRST_DRAFTED_MAJOR).sort((a, b) => a.major - b.major)) {
      if (release.supported) {
        // An announced final release within a year becomes a scheduled rule (decision 0010); a later one is only noted.
        if (release.finalRelease > today && release.finalRelease <= scheduledHorizon) {
          rules.push({
            id: `database.postgresql.end-of-life-${release.major}`,
            ecosystem: "database",
            purl: "pkg:generic/postgresql",
            vers: `vers:semver/>=${release.major}.0.0|<${release.major + 1}.0.0`,
            event: "scheduled-end-of-life",
            title: `PostgreSQL ${release.major} reaches the end of its support on ${release.finalRelease}`,
            summary: `The PostgreSQL Global Development Group lists ${release.major} as supported until its final release on ${release.finalRelease}, after which it receives no further bug or security fixes.`,
            severity: "low",
            ...(replacement ? { replacement } : {}),
            deadline: release.finalRelease,
            sources: [{ title: "PostgreSQL versioning policy", url: POSTGRESQL_VERSIONING_URL }],
          });
        } else {
          notes.push(`Skipped PostgreSQL ${release.major}: still supported until ${release.finalRelease}.`);
        }
        continue;
      }
      if (release.finalRelease > today) {
        notes.push(`Skipped PostgreSQL ${release.major}: marked unsupported but its final release (${release.finalRelease}) is in the future.`);
        continue;
      }
      rules.push({
        id: `database.postgresql.end-of-life-${release.major}`,
        ecosystem: "database",
        purl: "pkg:generic/postgresql",
        vers: `vers:semver/>=${release.major}.0.0|<${release.major + 1}.0.0`,
        event: "end-of-life",
        title: `PostgreSQL ${release.major} is no longer a supported major version`,
        summary: `The PostgreSQL Global Development Group lists ${release.major} as unsupported: its final release was on ${release.finalRelease}, so it receives no further bug or security fixes.`,
        severity: "high",
        ...(replacement ? { replacement } : {}),
        deadline: release.finalRelease,
        sources: [{ title: "PostgreSQL versioning policy", url: POSTGRESQL_VERSIONING_URL }],
      });
    }
    notes.push(`Majors below ${FIRST_DRAFTED_MAJOR} use the older two-part numbering and are not drafted.`);
    return { rules, notes };
  },
};

import { isoDate } from "./canonical.js";
import { ImporterError } from "./types.js";
import type { DraftRule, Importer } from "./types.js";

export const POWERSHELL_LIFECYCLE_URL = "https://learn.microsoft.com/powershell/scripting/install/powershell-support-lifecycle";
export const MAXIMUM_PAGE_BYTES = 512 * 1024;

/** A supported release whose end of support is closer than this is not offered as the replacement. */
const REPLACEMENT_HORIZON_DAYS = 365;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Release {
  major: number;
  minor: number;
  lts: boolean;
  endOfSupport: string;
}

function text(cell: string): string {
  return cell.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** "08-May-2024" to "2024-05-08"; undefined for anything else. */
export function toIsoDate(value: string): string | undefined {
  const match = /^(\d{1,2})-([A-Z][a-z]{2})-(\d{4})$/.exec(value);
  const month = match ? MONTHS.indexOf(match[2]!) : -1;
  if (!match || month < 0) return undefined;
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
}

/** The rows of the end-of-support tables: version, release date, end of support, .NET version. */
export function parseSupportTables(html: string): Release[] {
  const releases: Release[] = [];
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => text(cell[1]!));
    if (cells.length !== 4) continue;
    const version = /^PowerShell (\d+)\.(\d+)(?: \((LTS)\))?$/.exec(cells[0]!);
    const endOfSupport = toIsoDate(cells[2]!);
    if (!version || !endOfSupport) continue;
    releases.push({ major: Number(version[1]), minor: Number(version[2]), lts: version[3] === "LTS", endOfSupport });
  }
  return releases;
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

/**
 * Reads the PowerShell end-of-support tables and drafts one `end-of-life` rule for each PowerShell 7
 * release whose end-of-support date has passed, and one for all of PowerShell 6 (its last release's
 * date). A release with a missing or future date is never drafted. Windows PowerShell follows the
 * Windows lifecycle, not this page, so it is never drafted.
 */
export const powershellLifecycleImporter: Importer = {
  id: "shell-1",
  ecosystem: "shell",
  description: "PowerShell releases past their end-of-support date on the PowerShell support lifecycle page",
  sources: [{ title: "PowerShell support lifecycle", url: POWERSHELL_LIFECYCLE_URL }],

  async import(context) {
    const page = await context.fetchText(POWERSHELL_LIFECYCLE_URL);
    if (page.length > MAXIMUM_PAGE_BYTES) {
      throw new ImporterError(`GET ${POWERSHELL_LIFECYCLE_URL} returned more than ${MAXIMUM_PAGE_BYTES} bytes.`);
    }
    const releases = parseSupportTables(page);
    if (releases.length === 0) throw new ImporterError(`No release rows found in ${POWERSHELL_LIFECYCLE_URL}.`);

    const today = isoDate(context.now);
    const horizon = addDays(today, REPLACEMENT_HORIZON_DAYS);
    const newest = releases
      .filter((release) => release.endOfSupport > horizon)
      .sort((left, right) => left.major - right.major || left.minor - right.minor)[0];
    const replacement = newest ? `PowerShell ${newest.major}.${newest.minor}${newest.lts ? " (LTS)" : ""} or later` : undefined;

    const rules: DraftRule[] = [];
    const notes: string[] = [];
    const sixes = releases.filter((release) => release.major === 6);
    const draft = (id: string, label: string, vers: string, deadline: string, summary: string) =>
      rules.push({
        id: `shell.powershell.end-of-life-${id}`,
        ecosystem: "shell",
        purl: "pkg:generic/powershell",
        vers,
        event: "end-of-life",
        title: `${label} is no longer supported`,
        summary,
        severity: "high",
        ...(replacement ? { replacement } : {}),
        deadline,
        sources: [{ title: "PowerShell support lifecycle", url: POWERSHELL_LIFECYCLE_URL }],
      });

    for (const release of releases.filter((candidate) => candidate.major >= 7).sort((a, b) => a.minor - b.minor)) {
      if (release.endOfSupport > today) {
        notes.push(`Skipped PowerShell ${release.major}.${release.minor}: supported until ${release.endOfSupport}.`);
        continue;
      }
      draft(
        `${release.major}.${release.minor}`,
        `PowerShell ${release.major}.${release.minor}${release.lts ? " (LTS)" : ""}`,
        `vers:semver/>=${release.major}.${release.minor}.0|<${release.major}.${release.minor + 1}.0`,
        release.endOfSupport,
        `Microsoft's PowerShell support lifecycle lists ${release.major}.${release.minor} as retired: support ended on ${release.endOfSupport}, so it receives no further updates, including security updates.`,
      );
    }
    if (sixes.length > 0 && sixes.every((release) => release.endOfSupport <= today)) {
      const last = sixes.map((release) => release.endOfSupport).sort().at(-1)!;
      draft(
        "6",
        "PowerShell 6.x",
        "vers:semver/>=6.0.0|<7.0.0",
        last,
        `Microsoft's PowerShell support lifecycle lists every PowerShell 6 release as retired; the last reached end of support on ${last}.`,
      );
    }
    notes.push("Windows PowerShell follows the Windows support lifecycle and is not drafted.");
    return { rules, notes };
  },
};

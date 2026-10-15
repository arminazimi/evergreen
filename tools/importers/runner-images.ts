import { isIsoDate } from "../../src/registry.js";
import { isoDate } from "./canonical.js";
import { fetchJson } from "./types.js";
import type { DraftRule, Importer } from "./types.js";

export const RUNNER_IMAGES_README_URL = "https://raw.githubusercontent.com/actions/runner-images/main/README.md";
const README_PAGE = "https://github.com/actions/runner-images#available-images";
const REPO = "actions/runner-images";
const GITHUB_JSON = "application/vnd.github+json";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "November 2nd, 2026" → "2026-11-02". */
export function parseLongDate(text: string): string | undefined {
  const match = /\b([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})\b/.exec(text);
  const month = match ? MONTHS.indexOf(match[1]!) : -1;
  if (!match || month < 0) return undefined;
  const date = `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
  return isIsoDate(date) ? date : undefined;
}

interface ImageRow {
  image: string;
  labels: string[];
  /** The announcement issue the README links from a `deprecated` badge, if any. */
  issue: number | undefined;
}

/** The rows of the "Available Images" table in the runner-images README. */
export function parseImageTable(readme: string): ImageRow[] {
  const section = /^## Available Images\s*$([\s\S]*?)(?=^#{1,3} )/m.exec(readme)?.[1] ?? "";
  const rows: ImageRow[] = [];
  for (const line of section.split("\n")) {
    if (!line.startsWith("|") || /^\|\s*-/.test(line) || /^\|\s*Image\s*\|/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 3) continue;
    const [first = "", , labelCell = ""] = cells;
    rows.push({
      image: first.split(/\[|<br>/)[0]!.trim(),
      labels: [...labelCell.matchAll(/`([^`]+)`/g)].map((match) => match[1]!),
      issue: Number(/\[!\[deprecated\][^\]]*\]\(https:\/\/github\.com\/actions\/runner-images\/issues\/(\d+)\)/.exec(first)?.[1]) || undefined,
    });
  }
  return rows;
}

interface Announcement {
  title?: string;
  body?: string;
  html_url?: string;
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** `macOS 14` and `macOS 14 Arm64` share one announcement; the family is the first name with its architecture suffix dropped. */
const family = (image: string) => image.replace(/\s+arm64$/i, "");

export const runnerImagesImporter: Importer = {
  id: "runner-images",
  ecosystem: "github-runners",
  description: "GitHub-hosted runner images that GitHub has announced it is deprecating or has retired",
  sources: [
    { title: "GitHub-hosted runner images", url: README_PAGE },
    { title: "Image deprecation policy", url: "https://github.com/actions/runner-images#image-deprecation-policy" },
  ],

  async import(context) {
    const today = isoDate(context.now);
    const rules: DraftRule[] = [];
    const notes: string[] = [];

    const readme = await context.fetchText(RUNNER_IMAGES_README_URL);
    const rows = parseImageTable(readme);
    if (rows.length === 0) throw new Error("The runner-images README has no Available Images table this importer can read.");

    const byIssue = new Map<number, ImageRow[]>();
    for (const row of rows) if (row.issue !== undefined) byIssue.set(row.issue, [...(byIssue.get(row.issue) ?? []), row]);
    if (byIssue.size === 0) notes.push("No image in the README is marked deprecated.");

    for (const [issue, group] of [...byIssue].sort(([a], [b]) => a - b)) {
      const name = family(group[0]!.image);
      const labels = [...new Set(group.flatMap((row) => row.labels))].sort();
      const announcement = await fetchJson<Announcement>(context, `https://api.github.com/repos/${REPO}/issues/${issue}`, { accept: GITHUB_JSON });

      const target = /###\s*Target date\s*\n([\s\S]*?)(?=\n###|$)/.exec(announcement.body ?? "")?.[1] ?? "";
      const deprecation = parseLongDate(/^\s*Deprecation:\s*(.+)$/m.exec(target)?.[1] ?? "");
      const retirement = parseLongDate(/^\s*Retirement:\s*(.+)$/m.exec(target)?.[1] ?? "");
      if (!deprecation && !retirement) {
        notes.push(`Skipped ${name} (issue #${issue}): its announcement has no readable Target date section.`);
        continue;
      }

      const retired = retirement !== undefined && retirement <= today;
      const both = deprecation !== undefined && retirement !== undefined;
      const dates = both
        ? `deprecated the ${name} runner images from ${deprecation} and ${retired ? "retired" : "retires"} them on ${retirement}`
        : deprecation
          ? `deprecated the ${name} runner images from ${deprecation}`
          : `${retired ? "retired" : "retires"} the ${name} runner images on ${retirement}`;
      rules.push({
        id: `github-runners.${slug(name)}`,
        ecosystem: "github-runners",
        purl: `pkg:generic/github-runner/${slug(name)}`,
        vers: "vers:semver/*",
        event: retired ? "removed" : "deprecated",
        title: `${name} runner images are ${retired ? "retired" : "deprecated"}`,
        summary: `GitHub ${dates}. Jobs that use ${labels.map((label) => `\`${label}\``).join(", ")} ${retired ? "no longer run" : "stop running once the images are retired"}.`,
        severity: "high",
        ...(retirement ? { deadline: retirement } : {}),
        sources: [
          { title: `Announcement: ${announcement.title ?? `${name} runner image deprecation`}`.slice(0, 200), url: announcement.html_url ?? `https://github.com/${REPO}/issues/${issue}` },
          { title: "GitHub-hosted runner images", url: README_PAGE },
        ],
        "x-github-runners": { labels },
      });
    }
    return { rules, notes };
  },
};

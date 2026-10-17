import type { DraftRule, Importer } from "./types.js";

export const KUBERNETES_RELEASES_URL = "https://kubernetes.io/releases/";
const SOURCE_TITLE = "Kubernetes release history";
const END_OF_LIFE_HEADER = "Minor Version Final Patch Release End Of Life Date";
const RULES_TO_DRAFT = 5;

interface ReleaseLine {
  /** For example `1.33`. */
  minor: string;
  endOfLife: string;
}

function pageText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

const minorNumber = (minor: string) => Number(minor.split(".")[1]);

/**
 * Lines in the "End-of-Life Releases" table. A row is `Minor Final-patch End-of-life-date`, so the
 * date after the final patch is the end-of-life date; the table is read only when its header
 * still has that column order.
 */
function endOfLifeLines(text: string): ReleaseLine[] | undefined {
  const start = text.indexOf(END_OF_LIFE_HEADER);
  if (start < 0) return undefined;
  const lines = new Map<string, string>();
  for (const row of text.slice(start + END_OF_LIFE_HEADER.length).matchAll(/\b(1\.\d+) (1\.\d+\.\d+) (\d{4}-\d{2}-\d{2})\b/g)) {
    if (row[2]!.startsWith(`${row[1]}.`)) lines.set(row[1]!, row[3]!);
  }
  return [...lines].map(([minor, endOfLife]) => ({ minor, endOfLife })).sort((left, right) => minorNumber(left.minor) - minorNumber(right.minor));
}

/** Release lines that are still maintained: "1.37 Latest Release: 1.37.1 (released: ...) End of Life: 2027-10-28". */
function maintainedLines(text: string): ReleaseLine[] {
  const lines = new Map<string, string>();
  for (const row of text.matchAll(/\b(1\.\d+) Latest Release: 1\.\d+\.\d+ \(released: \d{4}-\d{2}-\d{2} ?\) End of Life: (\d{4}-\d{2}-\d{2})\b/g)) {
    lines.set(row[1]!, row[2]!);
  }
  return [...lines].map(([minor, endOfLife]) => ({ minor, endOfLife })).sort((left, right) => minorNumber(left.minor) - minorNumber(right.minor));
}

function rule(line: ReleaseLine, oldest: string | undefined): DraftRule {
  const next = `1.${minorNumber(line.minor) + 1}`;
  return {
    id: `kubernetes.release.end-of-life-${line.minor}`,
    ecosystem: "kubernetes",
    purl: "pkg:generic/kubernetes",
    vers: `vers:semver/>=${line.minor}.0|<${next}.0`,
    event: "end-of-life",
    title: `Kubernetes ${line.minor} is end-of-life`,
    summary: `The Kubernetes release history lists Kubernetes ${line.minor} as end-of-life on ${line.endOfLife}; the release no longer receives security updates or bug fixes.`,
    severity: "high",
    ...(oldest ? { replacement: `Kubernetes ${oldest} or later` } : {}),
    deadline: line.endOfLife,
    sources: [{ title: SOURCE_TITLE, url: KUBERNETES_RELEASES_URL }],
  };
}

export const kubernetesReleasesImporter: Importer = {
  id: "kubernetes-2",
  ecosystem: "kubernetes",
  description: "Kubernetes minor releases that have reached their published end-of-life date, from the release history",
  sources: [{ title: SOURCE_TITLE, url: KUBERNETES_RELEASES_URL }],

  async import(context) {
    const text = pageText(await context.fetchText(KUBERNETES_RELEASES_URL, { accept: "text/html" }));
    const table = endOfLifeLines(text);
    if (!table || table.length === 0) {
      return { rules: [], notes: ["No usable end-of-life table was found in the Kubernetes release history."] };
    }

    // Time decides: a line is ended when its published date is not after the run date.
    const today = context.now.toISOString().slice(0, 10);
    const ended = table.filter((line) => line.endOfLife <= today).slice(-RULES_TO_DRAFT);
    const maintained = maintainedLines(text).filter((line) => line.endOfLife > today);
    const oldest = maintained[0]?.minor;

    const notes: string[] = [];
    notes.push(
      maintained.length > 0
        ? `Supported release lines: ${maintained.map((line) => line.minor).join(", ")}.`
        : "No maintained release lines were found; the drafts have no replacement.",
    );
    notes.push("The drafts describe Kubernetes releases, not API versions; no detector reads them yet.");
    return { rules: ended.map((line) => rule(line, oldest)), notes };
  },
};

import { isoDate } from "./canonical.js";
import { parseImageTable, parseLongDate, RUNNER_IMAGES_README_URL } from "./runner-images.js";
import { fetchJson } from "./types.js";
import type { DraftRule, Importer } from "./types.js";

const README_PAGE = "https://github.com/actions/runner-images#available-images";
const REPO = "actions/runner-images";
const GITHUB_JSON = "application/vnd.github+json";

interface Announcement {
  title?: string;
  body?: string;
  html_url?: string;
}

/** The Azure Pipelines vmImage label that has no size or architecture suffix, e.g. `macos-14`. */
const AZURE_BASE_LABEL = /^(ubuntu|macos|windows)-[\d.]+$/;

function azureFamilyVersion(labels: string[]): { family: string; version: string; label: string } | undefined {
  const base = labels.filter((label) => AZURE_BASE_LABEL.test(label)).sort((left, right) => left.length - right.length)[0];
  if (!base) return undefined;
  const [family, ...rest] = base.split("-");
  return { family: family!, version: rest.join("-"), label: base };
}

function replacementFor(body: string, label: string): string | undefined {
  const section = /###\s*Mitigation ways\s*\n([\s\S]*?)(?=\n###|$)/.exec(body)?.[1] ?? "";
  const line = section.split("\n").find((entry) => entry.includes(`\`${label}\``));
  if (!line) return undefined;
  const targets = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]!).filter((target) => target !== label);
  return targets.length > 0 ? targets.join(", ") : undefined;
}

/** `macOS 14` and `macOS 14 Arm64` share one announcement and one Azure family. */
const familyName = (image: string) => image.replace(/\s+arm64$/i, "");

export const ciImagesImporter: Importer = {
  id: "ci-images-1",
  ecosystem: "ci-images",
  description: "Azure Pipelines hosted images the runner-images announcements retire, filtered to Azure DevOps",
  sources: [{ title: "GitHub-hosted runner images", url: README_PAGE }],

  async import(context) {
    const today = isoDate(context.now);
    const rules: DraftRule[] = [];
    const notes: string[] = [];

    const readme = await context.fetchText(RUNNER_IMAGES_README_URL);
    const rows = parseImageTable(readme);
    if (rows.length === 0) throw new Error("The runner-images README has no Available Images table this importer can read.");

    const byIssue = new Map<number, typeof rows>();
    for (const row of rows) if (row.issue !== undefined) byIssue.set(row.issue, [...(byIssue.get(row.issue) ?? []), row]);
    if (byIssue.size === 0) notes.push("No image in the README is marked deprecated.");

    for (const [issue, group] of [...byIssue].sort(([left], [right]) => left - right)) {
      const labels = [...new Set(group.flatMap((row) => row.labels))].sort();
      const mapped = azureFamilyVersion(labels);
      if (!mapped) {
        notes.push(`Skipped ${familyName(group[0]!.image)} (issue #${issue}): it has no Azure Pipelines vmImage label.`);
        continue;
      }

      const announcement = await fetchJson<Announcement>(context, `https://api.github.com/repos/${REPO}/issues/${issue}`, { accept: GITHUB_JSON });
      const azureAffected = /-\s*\[x\]\s*Azure DevOps/.test(announcement.body ?? "");
      if (!azureAffected) {
        notes.push(`Skipped ${familyName(group[0]!.image)} (issue #${issue}): its announcement does not list Azure DevOps as affected.`);
        continue;
      }

      const target = /###\s*Target date\s*\n([\s\S]*?)(?=\n###|$)/.exec(announcement.body ?? "")?.[1] ?? "";
      const retirement = parseLongDate(/^\s*Retirement:\s*(.+)$/m.exec(target)?.[1] ?? "");
      if (!retirement) {
        notes.push(`Skipped ${familyName(group[0]!.image)} (issue #${issue}): its announcement has no readable Retirement date.`);
        continue;
      }

      const retired = retirement <= today;
      const replacement = replacementFor(announcement.body ?? "", mapped.label);
      if (!replacement) {
        notes.push(`Skipped ${familyName(group[0]!.image)} (issue #${issue}): its announcement names no replacement label.`);
        continue;
      }

      rules.push({
        id: `ci-images.azure-pipelines.${mapped.family}-${mapped.version}`,
        ecosystem: "ci-images",
        purl: `pkg:generic/azure-pipelines/${mapped.family}-image`,
        vers: `vers:intdot/${mapped.version}`,
        event: retired ? "removed" : "scheduled-end-of-life",
        title: `Azure Pipelines ${familyName(group[0]!.image)} hosted image is ${retired ? "retired" : "scheduled for removal"}`,
        summary: `The ${familyName(group[0]!.image)} hosted image is ${retired ? "retired" : `scheduled for removal on ${retirement}`}, per the runner-images announcement.`,
        severity: retired ? "high" : "low",
        replacement,
        ...(retirement ? { deadline: retirement } : {}),
        sources: [
          { title: `Announcement: ${announcement.title ?? `${familyName(group[0]!.image)} image retirement`}`.slice(0, 200), url: announcement.html_url ?? `https://github.com/${REPO}/issues/${issue}` },
          { title: "GitHub-hosted runner images", url: README_PAGE },
        ],
      });
    }
    return { rules, notes };
  },
};

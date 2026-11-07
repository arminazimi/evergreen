// Renders the committed Renovate comparison from the aggregated result. Pure string building.

import type { Family } from "../../differential/renovate.js";
import type { ComparisonResult, DisagreementRow, GroupResult, OutcomeCounts, TimingSummary } from "./types.js";

const FAMILY_LABEL: Record<Family, string> = {
  "base-image": "Base images (Dockerfile, Compose)",
  "deprecated-package": "Deprecated npm packages",
  "github-action": "GitHub Actions",
};

const ms = (value: number): string => (value >= 10_000 ? `${(value / 1000).toFixed(1)} s` : `${value} ms`);
const timing = (time: TimingSummary): string => `${ms(time.totalMs)} / ${ms(time.medianMs)} / ${ms(time.maxMs)}`;
const cell = (value: string): string => value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
const label = (selection: string): string => (selection === "blind" ? "Blind" : "Targeted");

function compared(counts: OutcomeCounts): number {
  return counts.agree + counts["evergreen-only"] + counts["renovate-only"];
}

export function renderJson(result: ComparisonResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function summaryTable(groups: readonly GroupResult[]): string[] {
  const lines = [
    "| Selection | Repositories | Renovate unfinished | Evergreen findings | Not comparable | Agree | Evergreen only | Renovate only | Inconclusive |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const group of groups) {
    const { outcomes } = group;
    lines.push(
      `| ${label(group.selection)} | ${group.repositories} | ${group.renovateUnfinished.length} | ${group.evergreenFindings} | ${group.notComparableFindings} | ${outcomes.agree} | ${outcomes["evergreen-only"]} | ${outcomes["renovate-only"]} | ${outcomes.inconclusive} |`,
    );
  }
  return lines;
}

function familyTable(groups: readonly GroupResult[]): string[] {
  const lines = [
    "| Selection | Family | Compared | Agree | Evergreen only | Renovate only | Inconclusive |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const group of groups) {
    for (const family of Object.keys(FAMILY_LABEL) as Family[]) {
      const counts = group.byFamily[family];
      lines.push(
        `| ${label(group.selection)} | ${FAMILY_LABEL[family]} | ${compared(counts)} | ${counts.agree} | ${counts["evergreen-only"]} | ${counts["renovate-only"]} | ${counts.inconclusive} |`,
      );
    }
  }
  return lines;
}

function timingTable(groups: readonly GroupResult[]): string[] {
  const lines = [
    "| Selection | Evergreen total / median / max | Renovate total / median / max |",
    "| --- | --- | --- |",
  ];
  for (const group of groups) {
    lines.push(`| ${label(group.selection)} | ${timing(group.evergreenTime)} | ${timing(group.renovateTime)} |`);
  }
  return lines;
}

function disagreementTable(rows: readonly DisagreementRow[], title: string): string[] {
  if (rows.length === 0) return [`### ${title}`, "", "None.", ""];
  const lines = [
    `### ${title}`,
    "",
    "| Repository | Selection | Family | Dependency | Evergreen rules | Renovate saw |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    const link = `https://github.com/${row.repository}/blob/${row.commit}/${row.path}`;
    lines.push(
      `| ${row.repository} | ${label(row.selection)} | ${row.family} | [\`${cell(row.name)}\`](${link}) in \`${cell(row.path)}\` | ${row.evergreen.length > 0 ? row.evergreen.map((rule) => `\`${rule}\``).join(", ") : "none"} | ${row.renovate} |`,
    );
  }
  return [...lines, ""];
}

export function renderMarkdown(result: ComparisonResult): string {
  const unfinished = result.groups.flatMap((group) => group.renovateUnfinished);
  const evergreenOnly = result.disagreements.filter((row) => row.outcome === "evergreen-only");
  const renovateOnly = result.disagreements.filter((row) => row.outcome === "renovate-only");
  const inconclusive = result.disagreements.filter((row) => row.outcome === "inconclusive");
  return [
    "# Evergreen compared with Renovate",
    "",
    "Run under [docs/COMPARISON_METHOD.md](../../../docs/COMPARISON_METHOD.md). Method, repositories, and measures were",
    "fixed before this result existed. Read [README.md](README.md) for what the numbers do and do not say.",
    "",
    `Renovate ${result.renovateVersions.join(", ")}; Evergreen ${result.evergreenVersions.join(", ")} at ${result.evergreenCommits.map((commit) => commit.slice(0, 8)).join(", ")} (the base commit the run executed from); concurrency ${result.concurrency.join(", ")}.`,
    "",
    "## Summary",
    "",
    ...summaryTable(result.groups),
    "",
    "A pair is counted only where both tools can speak about the same dependency in the same file. Blind and targeted",
    "repositories are never added together.",
    "",
    "## By family",
    "",
    ...familyTable(result.groups),
    "",
    "## Time",
    "",
    "Wall clock per repository, observational and measured on one machine with the concurrency above. It is a reference",
    "point, not a performance guarantee, and the two tools do different work.",
    "",
    ...timingTable(result.groups),
    "",
    "## Not comparable",
    "",
    "Evergreen findings in families Renovate has no model for. They are neither wins nor misses.",
    "",
    "| Rule family | Findings |",
    "| --- | ---: |",
    ...result.notComparableRules.map((item) => `| \`${item.family}\` | ${item.findings} |`),
    "",
    "## Renovate runs that did not finish",
    "",
    unfinished.length === 0 ? "None." : unfinished.map((name) => `- ${name}`).join("\n"),
    "",
    "## Every disagreement",
    "",
    ...disagreementTable(renovateOnly, `Renovate only (${renovateOnly.length})`),
    ...disagreementTable(evergreenOnly, `Evergreen only (${evergreenOnly.length})`),
    ...disagreementTable(inconclusive, `Inconclusive (${inconclusive.length})`),
  ].join("\n");
}

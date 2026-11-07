// Renders the committed Dependabot comparison from the aggregated result. Pure string building.

import type { ComparisonResult, ConfiguredRepository, EcosystemResult, GroupResult, OutcomeCounts } from "./types.js";

const cell = (value: string): string => value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
const label = (selection: string): string => (selection === "blind" ? "Blind" : "Targeted");

function total(counts: OutcomeCounts): number {
  return counts.covered + counts.uncovered + counts.filtered + counts["not-comparable"];
}

export function renderJson(result: ComparisonResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function summaryTable(groups: readonly GroupResult[]): string[] {
  const lines = [
    "| Selection | Repositories | With a config | Without a config | Evergreen findings | Covered | Uncovered | Uncovered, no config | Uncovered, config present | Filtered | No entry |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const group of groups) {
    const { outcomes } = group;
    lines.push(
      `| ${label(group.selection)} | ${group.repositories} | ${group.repositoriesWithConfig} | ${group.repositoriesWithoutConfig} | ${group.evergreenFindings} | ${outcomes.covered} | ${outcomes.uncovered} | ${group.uncoveredWithoutConfig} | ${group.uncoveredWithConfig} | ${outcomes.filtered} | ${outcomes["not-comparable"]} |`,
    );
  }
  return lines;
}

function ecosystemTable(groups: readonly GroupResult[]): string[] {
  const lines = [
    "| Selection | package-ecosystem | Covered | Uncovered | Filtered | Total |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
  ];
  for (const group of groups) {
    for (const item of group.byEcosystem) lines.push(ecosystemRow(group, item));
  }
  return lines;
}

function ecosystemRow(group: GroupResult, item: EcosystemResult): string {
  const { counts } = item;
  const totalMapped = counts.covered + counts.uncovered + counts.filtered;
  return `| ${label(group.selection)} | ${item.packageEcosystem} | ${counts.covered} | ${counts.uncovered} | ${counts.filtered} | ${totalMapped} |`;
}

function notComparableTable(groups: readonly GroupResult[]): string[] {
  const lines = ["| Selection | Rule family | Findings |", "| --- | --- | ---: |"];
  for (const group of groups) {
    for (const item of group.notComparableRules) {
      lines.push(`| ${label(group.selection)} | \`${item.family}\` | ${item.findings} |`);
    }
  }
  return lines;
}

function repositoryRow(row: ConfiguredRepository): string {
  const link = `https://github.com/${row.repository}/blob/${row.commit}/${row.configPath}`;
  return `| ${row.repository} | ${label(row.selection)} | [\`${cell(row.configPath)}\`](${link}) | ${row.entries} | ${row.findings} | ${row.covered} | ${row.uncovered} | ${row.filtered} | ${row.notComparable} |`;
}

function repositoryTable(rows: readonly ConfiguredRepository[]): string[] {
  if (rows.length === 0) return ["None.", ""];
  const lines = [
    "| Repository | Selection | Config | Entries | Findings | Covered | Uncovered | Filtered | No entry |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(repositoryRow),
  ];
  return [...lines, ""];
}

function configErrors(result: ComparisonResult): string[] {
  if (result.configErrors.length === 0) return ["None.", ""];
  return [
    "| Repository | Parser message |",
    "| --- | --- |",
    ...result.configErrors.map((error) => `| ${error.repository} | ${cell(error.detail)} |`),
    "",
  ];
}

function configTotals(groups: readonly GroupResult[]): string {
  const entries = groups.reduce((sum, group) => sum + group.configEntries, 0);
  const filtered = groups.reduce((sum, group) => sum + group.filteredConfigEntries, 0);
  return `- **Config entries:** ${entries}, of which ${filtered} declare \`ignore\` or \`allow\`.`;
}

export function renderMarkdown(result: ComparisonResult): string {
  const versions = `Evergreen ${result.evergreenVersions.join(", ")} at ${result.evergreenCommits
    .map((commit) => commit.slice(0, 8))
    .join(", ")} (the base commit the run executed from).`;
  return [
    "# Evergreen compared with Dependabot",
    "",
    "Run under [docs/COMPARISON_METHOD.md](../../../docs/COMPARISON_METHOD.md), whose section 7 records that Dependabot",
    "cannot be run against a pinned commit. This is therefore **not a head-to-head result**: Dependabot was not run, and",
    "no finding here was reported by it. What is measured is the update surface each repository's committed",
    "`dependabot.yml` declares, checked against the same pinned checkouts. Read [README.md](README.md) for what the",
    "numbers do and do not say.",
    "",
    versions,
    "",
    "## Summary",
    "",
    ...summaryTable(result.groups),
    "",
    "- **Covered:** a matching `package-ecosystem` and directory is declared, with no `ignore` or `allow` list. The",
    "  package and directory are inside the update surface the repository asked Dependabot to watch. This does not mean",
    "  Dependabot reported the lifecycle fact; it only means it can see that dependency.",
    "- **Uncovered:** the bridge maps the finding to a Dependabot `package-ecosystem`, but no declared entry watches that",
    "  ecosystem and directory. It is split by whether the repository commits a Dependabot configuration at all.",
    "- **Filtered:** a matching entry declares `ignore` or `allow`. Those dependency-level filters are not evaluated, so",
    "  the finding is counted neither as covered nor as uncovered.",
    "- **No entry:** the bridge has no `package-ecosystem` for the finding, so no update entry could carry it. The",
    "  mapping is Evergreen's bridge, not Dependabot's ecosystem list; a missing mapping is a limit of the bridge.",
    "",
    "## By Dependabot package-ecosystem",
    "",
    "Findings the bridge maps to a Dependabot `package-ecosystem`, grouped by that ecosystem. Runtime findings, retired",
    "APIs, host-image policies, and Dockerfile syntax are not in this table at all; they have no update entry.",
    "",
    ...ecosystemTable(result.groups),
    "",
    "## Findings with no Dependabot update entry",
    "",
    "Grouped by the first two rule-id segments. They are not misses of Dependabot and not wins for Evergreen: the bridge",
    "has no update entry to put them in.",
    "",
    ...notComparableTable(result.groups),
    "",
    "## Repositories with a Dependabot config",
    "",
    "Every repository in the comparison that commits a Dependabot configuration, with its pinned file linked. Rows with",
    "no findings are still listed, because the configuration is part of the evidence.",
    "",
    ...repositoryTable(result.configuredRepositories),
    "",
    "## Config files that could not be read",
    "",
    ...configErrors(result),
    "## Totals",
    "",
    `- **Findings:** ${result.groups.reduce((sum, group) => sum + total(group.outcomes), 0)} across ${result.groups.reduce((sum, group) => sum + group.repositories, 0)} repositories.`,
    configTotals(result.groups),
    `- **Configured repositories:** ${result.configuredRepositories.length}.`,
    `- **Continuity repositories:** ${result.continuity.length === 0 ? "none" : result.continuity.map((name) => `\`${name}\``).join(", ")}.`,
    `- **Dependabot:** ${result.dependabot.run} — ${result.dependabot.reason}`,
    "",
  ].join("\n");
}

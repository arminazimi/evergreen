// Markdown rendering for the monthly progress report.
//
// Imported by tools/monthly-report.ts. Kept separate so the collector stays under the
// hand-written file-size ceiling in docs/QUALITY.md.

import { renderQualitySection } from "./quality-metrics.js";
import { escapeTableCell } from "./markdown.js";
import type { MonthlyReportData } from "./monthly-report.js";

/**
 * Published first-review target for a first-time contributor's pull request, in working days.
 *
 * The target is stated in CONTRIBUTING.md ("Review expectations") and repeated in every report so it
 * stays visible. The report reads local files and git history, which do not record when a pull request
 * was first reviewed, so it prints the target without a measured value instead of inventing one.
 */
export const FIRST_REVIEW_TARGET_WORKING_DAYS = 2;

/** Formats integer numbers with standard comma separators. */
function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

/** Signed change against the previous month, never treating a missing value as zero. */
function formatChange(value: number | "unavailable", previous: number | null): string {
  if (value === "unavailable") return "unavailable";
  if (previous === null) return "—";
  const diff = value - previous;
  if (diff === 0) return "0";
  return `${diff > 0 ? "+" : "-"}${formatNumber(Math.abs(diff))}`;
}

/** Generates the Markdown monthly progress report. */
export function generateMonthlyReport(data: MonthlyReportData): string {
  const lines: string[] = [];

  lines.push(`# Evergreen Monthly Progress Report: ${data.month}`);
  lines.push("");
  lines.push(`Generated on ${data.asOfDate} · Evergreen \`${data.version}\``);
  lines.push("Repository: `arminazimi/evergreen`");
  lines.push("");

  // Momentum highlights
  lines.push("## Momentum highlights");
  lines.push("");
  lines.push("| Area | Current total | Momentum |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| Lifecycle rules | ${formatNumber(data.rules.total)} rules | ${formatNumber(data.rules.reviewedInMonth || data.rules.total)} reviewed across ${Object.keys(data.rules.byEcosystem).length} ecosystems |`,
  );
  lines.push(
    `| Supported ecosystems | ${data.ecosystems.total} ecosystems | ${data.ecosystems.supported} supported, ${data.ecosystems.experimental} experimental |`,
  );
  lines.push(
    `| Validation corpus | ${formatNumber(data.corpus.totalRepositories)} repositories | ${formatNumber(data.corpus.totalExpectedFindings)} expected findings across ${Object.keys(data.corpus.byEcosystem).length} ecosystems |`,
  );
  const contributorHighlight = data.contributors.isShallow
    ? `${data.contributors.totalContributors} contributors, ${data.contributors.totalExternalContributors} external (partial: shallow history)`
    : `${data.contributors.totalContributors} contributors, ${data.contributors.totalExternalContributors} external`;
  lines.push(
    `| Contributors | ${contributorHighlight} | ${formatNumber(data.contributors.monthCommits)} commits in ${data.month}; ${data.contributors.monthExternalContributors} external contributors |`,
  );
  const starsCell =
    data.adoption.githubStars !== "unavailable"
      ? `${formatNumber(data.adoption.githubStars)} GitHub stars`
      : "unavailable";
  const adoptionMomentum = (() => {
    if (
      data.adoption.githubStars !== "unavailable" &&
      data.adoption.previousStars !== null &&
      data.adoption.previousStars !== data.adoption.githubStars
    ) {
      const diff = data.adoption.githubStars - data.adoption.previousStars;
      const sign = diff > 0 ? "+" : "";
      return `${formatNumber(data.adoption.githubStars)} stars (${sign}${diff} vs last month)`;
    }
    if (data.adoption.snapshotDate) {
      return `snapshot ${data.adoption.snapshotDate}`;
    }
    if (data.adoption.githubStars !== "unavailable") {
      return `${formatNumber(data.adoption.githubStars)} stars`;
    }
    return "unavailable";
  })();
  lines.push(`| Adoption | ${starsCell} | ${adoptionMomentum} |`);
  const debtRow = data.quality.rows.find((row) => row.criterion === "Remaining debt");
  const qualityMomentum = debtRow
    ? `${debtRow.current}${data.quality.snapshotDate ? ` (snapshot ${data.quality.snapshotDate})` : ""}`
    : data.quality.snapshotDate
      ? `snapshot ${data.quality.snapshotDate}`
      : "unavailable";
  lines.push(`| Reference quality | ${debtRow?.current ?? "unavailable"} | ${qualityMomentum} |`);
  lines.push("");

  // Lifecycle rules section
  lines.push("## Lifecycle rules");
  lines.push("");
  lines.push(
    `Evergreen tracks evidence-backed lifecycle events across ${Object.keys(data.rules.byEcosystem).length} ecosystems. Every rule links to an authoritative, versioned public source.`,
  );
  lines.push("");
  lines.push(`- **Total rules:** ${formatNumber(data.rules.total)}`);
  const replacementPct =
    data.rules.total > 0 ? ((data.rules.withReplacements / data.rules.total) * 100).toFixed(1) : "0.0";
  lines.push(`- **Rules with replacements:** ${formatNumber(data.rules.withReplacements)} (${replacementPct}%)`);
  const migrationPct = data.rules.total > 0 ? ((data.rules.withMigration / data.rules.total) * 100).toFixed(1) : "0.0";
  lines.push(`- **Rules with migration guidance:** ${formatNumber(data.rules.withMigration)} (${migrationPct}%)`);
  const usagePct = data.rules.total > 0 ? ((data.rules.withUsage / data.rules.total) * 100).toFixed(1) : "0.0";
  lines.push(`- **Rules with AST / code usage matchers:** ${formatNumber(data.rules.withUsage)} (${usagePct}%)`);
  lines.push("");

  lines.push("### Rules by event");
  lines.push("");
  lines.push("| Event | Rules |");
  lines.push("| --- | --- |");
  const eventEntries = Object.entries(data.rules.byEvent).sort((a, b) => b[1] - a[1]);
  for (const [event, count] of eventEntries) {
    lines.push(`| ${event} | ${formatNumber(count)} |`);
  }
  lines.push("");

  lines.push("### Rules by severity");
  lines.push("");
  lines.push("| Severity | Rules |");
  lines.push("| --- | --- |");
  const severityOrder = ["critical", "high", "medium", "low", "info"];
  for (const sev of severityOrder) {
    if (data.rules.bySeverity[sev] !== undefined) {
      lines.push(`| ${sev} | ${formatNumber(data.rules.bySeverity[sev]!)} |`);
    }
  }
  lines.push("");

  lines.push("### Rules by ecosystem");
  lines.push("");
  lines.push("| Ecosystem | Rules |");
  lines.push("| --- | --- |");
  const ecoEntries = Object.entries(data.rules.byEcosystem).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [eco, count] of ecoEntries) {
    lines.push(`| ${eco} | ${formatNumber(count)} |`);
  }
  lines.push("");

  // Ecosystem coverage section
  lines.push("## Ecosystem coverage");
  lines.push("");
  lines.push("Evergreen provides lifecycle detectors across languages, package managers, and configuration files.");
  lines.push("");
  lines.push("| Ecosystem | Status | Maturity | Detectors |");
  lines.push("| --- | --- | --- | --- |");
  const sortedEcosystems = [...data.ecosystems.ecosystems].sort((a, b) => a.id.localeCompare(b.id));
  for (const eco of sortedEcosystems) {
    lines.push(`| ${eco.id} | ${eco.status} | ${eco.maturity} | \`${eco.detectorIds.join("`, `")}\` |`);
  }
  lines.push("");

  // Validation corpus section
  lines.push("## Validation corpus");
  lines.push("");
  lines.push(
    "To ensure accuracy and guard against regressions, Evergreen validates all detectors against a pinned benchmark corpus.",
  );
  lines.push("");
  lines.push(`- **Total repositories:** ${formatNumber(data.corpus.totalRepositories)}`);
  const targeted = data.corpus.bySelection.targeted ?? 0;
  const blind = data.corpus.bySelection.blind ?? 0;
  lines.push(`- **Targeted repositories:** ${formatNumber(targeted)}`);
  lines.push(`- **Blind / held-out repositories:** ${formatNumber(blind)}`);
  lines.push(`- **Total expected findings:** ${formatNumber(data.corpus.totalExpectedFindings)}`);
  lines.push("");

  lines.push("| Ecosystem | Repositories | Expected findings |");
  lines.push("| --- | --- | --- |");
  const corpusEcoEntries = Object.entries(data.corpus.byEcosystem).sort(
    (a, b) => b[1].repositories - a[1].repositories || a[0].localeCompare(b[0]),
  );
  for (const [eco, metrics] of corpusEcoEntries) {
    lines.push(`| ${eco} | ${formatNumber(metrics.repositories)} | ${formatNumber(metrics.expectedFindings)} |`);
  }
  lines.push("");

  // Adoption section
  lines.push("## Adoption");
  lines.push("");
  lines.push(
    "Adoption is measured from public sources, plus the Search Console landing pages the maintainer enters by hand. Evergreen has no telemetry.",
  );
  lines.push("");
  if (data.adoption.snapshotDate) {
    lines.push(`*Snapshot: ${data.adoption.snapshotDate}*`);
    lines.push("");
  }
  lines.push("### North-star trend");
  lines.push("");
  if (data.adoption.githubStars !== "unavailable") {
    const trend =
      data.adoption.previousStars !== null
        ? ` (${data.adoption.githubStars >= data.adoption.previousStars ? "+" : ""}${data.adoption.githubStars - data.adoption.previousStars} vs previous month)`
        : "";
    lines.push(`**GitHub stars:** ${formatNumber(data.adoption.githubStars)}${trend}`);
  } else {
    lines.push("**GitHub stars:** unavailable");
  }
  lines.push("");
  lines.push("### Channel breakdown");
  lines.push("");
  lines.push("The change compares the newest snapshot of this month with the newest snapshot of the previous month.");
  lines.push("");
  lines.push("| Channel | Count | Change vs last month |");
  lines.push("| --- | --- | --- |");
  for (const channel of data.adoption.channels) {
    const countCell =
      channel.value === "unavailable"
        ? "unavailable"
        : channel.note
          ? `${formatNumber(channel.value)} (${channel.note})`
          : formatNumber(channel.value);
    lines.push(`| ${channel.label} | ${countCell} | ${formatChange(channel.value, channel.previous)} |`);
  }
  lines.push("");
  lines.push("### Top landing pages");
  lines.push("");
  if (data.adoption.landingPages.length > 0) {
    lines.push(
      `Entered by the maintainer from Search Console's Performance report for ${data.month}; Search Console data is visible only to the verified owner.`,
    );
    lines.push("");
    lines.push("| Landing page | Clicks | Impressions |");
    lines.push("| --- | --- | --- |");
    for (const page of data.adoption.landingPages) {
      lines.push(
        `| ${escapeTableCell(page.page)} | ${formatNumber(page.clicks)} | ${formatNumber(page.impressions)} |`,
      );
    }
  } else {
    lines.push(`No Search Console landing pages were entered for ${data.month}.`);
  }
  lines.push("");
  if (data.adoption.snapshotDate) {
    lines.push(
      `Methodology and sources: [docs/ADOPTION.md](docs/ADOPTION.md) · Snapshot: [\`metrics/adoption/${data.adoption.snapshotDate}.json\`](metrics/adoption/${data.adoption.snapshotDate}.json)`,
    );
  } else {
    lines.push("Methodology and sources: [docs/ADOPTION.md](docs/ADOPTION.md)");
  }
  lines.push("");

  lines.push(...renderQualitySection(data.quality));

  // Review responsiveness section
  lines.push("## Review responsiveness");
  lines.push("");
  lines.push(
    `Evergreen's published target is a first review within **${FIRST_REVIEW_TARGET_WORKING_DAYS} working days** of a first-time contributor opening a pull request; the clock starts when the pull request is opened for review, or when a draft is marked ready for review. See [CONTRIBUTING.md](CONTRIBUTING.md#review-expectations).`,
  );
  lines.push("");
  lines.push("| Metric | This report | Target |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| First review of a first-time contributor's pull request | not measured | ${FIRST_REVIEW_TARGET_WORKING_DAYS} working days |`,
  );
  lines.push("");
  lines.push(
    "*This report reads local files and git history, which do not record when a pull request was first reviewed. The target is published here every month so it stays visible; the report does not print a number it cannot reproduce.*",
  );
  lines.push("");

  // Contributors section
  lines.push("## Contributors");
  lines.push("");
  if (data.contributors.isShallow) {
    lines.push("*Note: Contributor counts are partial because the history is shallow.*");
    lines.push("");
  }
  lines.push(
    `Evergreen is built with contributions from ${data.contributors.totalContributors} authors and co-authors across ${formatNumber(data.contributors.totalCommits)} commits:`,
  );
  lines.push("");
  for (const contributor of data.contributors.contributors) {
    lines.push(`- ${contributor}`);
  }
  lines.push("");
  lines.push("### External contributors");
  lines.push("");
  lines.push(
    `${data.contributors.totalExternalContributors} external contributors in total, ${data.contributors.monthExternalContributors} in ${data.month}. External means an author or \`Co-authored-by\` name that is not a maintainer in [MAINTAINERS.md](MAINTAINERS.md) and not a bot. Source: \`git log\` authors and \`Co-authored-by\` trailers, with \`.mailmap\` applied.`,
  );
  lines.push("");
  for (const contributor of data.contributors.externalContributors) {
    lines.push(
      `- ${contributor}${data.contributors.monthExternalContributorsList.includes(contributor) ? ` (active in ${data.month})` : ""}`,
    );
  }
  lines.push("");

  return lines.join("\n");
}

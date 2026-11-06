// Renders the endoflife.date comparison as one Markdown page. It reads only the result object, so the same
// data produces the same page on every machine.

import type { ComparisonResult, Disagreement, Tally, VendorCheckedRow } from "./types.js";

const percent = (part: number, total: number): string =>
  total === 0 ? "n/a" : `${((part / total) * 100).toFixed(1)}%`;

function tallyRow(label: string, tally: Tally): string {
  return `| ${label} | ${tally.measured} | ${tally.agree} | ${tally.disagree} | ${percent(tally.agree, tally.measured)} |`;
}

function agreementSection(result: ComparisonResult): string[] {
  const all = result.agreement.all;
  return [
    "## Date agreement",
    "",
    "A cycle is measured only when endoflife.date publishes an end date for every cycle the rule covers. " +
      "A rule with no date on either side is counted in the bucket below the table, never as a miss.",
    "",
    "| Sample | Measured | Agree | Disagree | Agreement |",
    "| --- | ---: | ---: | ---: | ---: |",
    tallyRow(`All ${all.rules} registry rules`, all),
    tallyRow(`Ground-truth set (${result.agreement.groundTruth.rules} distinct rules)`, result.agreement.groundTruth),
    "",
    "| Bucket | All registry rules | Ground-truth set |",
    "| --- | ---: | ---: |",
    `| Not a mapped product | ${all.notComparable} | ${result.agreement.groundTruth.notComparable} |`,
    `| Not a lifecycle event | ${all.notLifecycleEvent} | ${result.agreement.groundTruth.notLifecycleEvent} |`,
    `| No snapshot entry | ${all.noSnapshot} | ${result.agreement.groundTruth.noSnapshot} |`,
    `| No release cycle in range | ${all.noCycle} | ${result.agreement.groundTruth.noCycle} |`,
    `| No date in the Evergreen rule | ${all.noRuleDate} | ${result.agreement.groundTruth.noRuleDate} |`,
    `| No end date in endoflife.date | ${all.noEndoflifeDate} | ${result.agreement.groundTruth.noEndoflifeDate} |`,
    "",
  ];
}

function coverageSection(result: ComparisonResult): string[] {
  const coverage = result.coverage;
  return [
    "## Product coverage",
    "",
    "| Measure | Value |",
    "| --- | ---: |",
    `| endoflife.date products in the snapshot | ${coverage.endoflifeProducts} |`,
    `| Evergreen registry rules | ${coverage.evergreenRules} |`,
    `| Evergreen product families (distinct purls) | ${coverage.evergreenProductFamilies} |`,
    `| Families mapped to an endoflife.date product | ${coverage.mappedProductFamilies} |`,
    `| endoflife.date products with at least one Evergreen rule | ${coverage.sharedProducts.length} |`,
    `| endoflife.date products with no Evergreen rule | ${coverage.endoflifeOnlyProducts.length} |`,
    "",
    "The coverage gap runs both ways: endoflife.date is broader across products, while Evergreen covers " +
      "families endoflife.date does not model. The families below are not a win or a loss; they are outside " +
      "the comparison because the other side publishes no release cycle for them.",
    "",
    "| Reason | Families | Rules | Examples |",
    "| --- | ---: | ---: | --- |",
    ...coverage.notComparableFamilies.map(
      (family) => `| \`${family.code}\` | ${family.families} | ${family.rules} | ${family.examples.join(", ")} |`,
    ),
    "",
  ];
}

function productsSection(result: ComparisonResult): string[] {
  return [
    "### Coverage and agreement by product",
    "",
    "| Product | Evergreen rules | Evergreen families | endoflife.date cycles | Measured | Agree | Disagree |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...result.products.map(
      (product) =>
        `| ${product.product} | ${product.evergreenRules} | ${product.evergreenFamilies} | ${product.endoflifeCycles} | ${product.measured} | ${product.agree} | ${product.disagree} |`,
    ),
    "",
  ];
}

function evidenceList(disagreement: Disagreement): string[] {
  const lines = [
    `- [Evergreen rule](${disagreement.sources.evergreen}) · [endoflife.date](${disagreement.sources.endoflife})`,
  ];
  for (const reference of disagreement.references.slice(0, 3)) {
    const location = `${reference.path}${reference.line === undefined ? "" : `:${reference.line}`}`;
    lines.push(`- [${reference.repository} ${location}](${reference.url})`);
  }
  if (disagreement.references.length === 0) {
    lines.push("- No pinned corpus repository exercises this rule; it is outside the ground-truth sample.");
  }
  return lines;
}

function disagreementsSection(result: ComparisonResult): string[] {
  if (result.disagreements.length === 0) return ["## Where the data differs", "", "No disagreement was found.", ""];
  return [
    "## Where the data differs",
    "",
    "A disagreement is a date difference, not a verdict. Both sides' sources are linked; the corpus note " +
      "decides correctness only where it names an independently checked date (next section).",
    "",
    "| Rule | Product / cycles | Evergreen | endoflife.date | Δ days | In ground truth |",
    "| --- | --- | --- | --- | ---: | --- |",
    ...result.disagreements.map(
      (item) =>
        `| ${item.ruleId} | ${item.product} / ${item.cycles.join(", ")} | ${item.evergreenDate} | ${item.endoflifeDate} | ${item.differenceDays} | ${item.inGroundTruth ? "yes" : "no"} |`,
    ),
    "",
    ...result.disagreements.flatMap((item) => [`### ${item.ruleId}`, "", ...evidenceList(item), ""]),
  ];
}

function correctnessRow(row: VendorCheckedRow): string {
  return `| ${row.ruleId} | ${row.product ?? ""} | ${row.vendorDate} | ${row.evergreenDate ?? ""} | ${row.endoflifeDate ?? ""} | ${row.evergreenMatches ? "yes" : "no"} | ${row.endoflifeMatches ? "yes" : "no"} |`;
}

function correctnessSection(result: ComparisonResult): string[] {
  const correctness = result.correctness;
  return [
    "## Vendor-checked correctness",
    "",
    `${correctness.sample} ground-truth rules carry an independently vendor-checked lifecycle date in the ` +
      "corpus note. Each tool's date is compared with that date, not with the other tool.",
    "",
    "| Measure | Evergreen | endoflife.date |",
    "| --- | ---: | ---: |",
    `| Matches the vendor-checked date | ${correctness.evergreenMatches} / ${correctness.sample} | ${correctness.endoflifeMatches} / ${correctness.sample} |`,
    "",
    "| Rule | Product | Vendor-checked date | Evergreen date | endoflife.date | Evergreen matches | endoflife.date matches |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...correctness.rows.map(correctnessRow),
    "",
  ];
}

function reproduceSection(result: ComparisonResult): string[] {
  return [
    "## Reproduce",
    "",
    "```bash",
    "npm ci",
    "npm run build",
    "node dist/benchmarks/comparison/compare-endoflife-date.js          # rewrite this page and endoflife-date.json",
    "node dist/benchmarks/comparison/compare-endoflife-date.js --check  # exit 1 when either file is stale",
    "```",
    "",
    `The snapshot was retrieved on ${result.snapshot.retrievedAt} from ${result.snapshot.source.catalog} and the ` +
      `per-product endpoints, which are MIT-licensed; refreshing it is a maintainer action with network access. ` +
      "The comparison itself reads only committed files.",
    "",
  ];
}

/** Renders the committed Markdown page. */
export function renderMarkdown(result: ComparisonResult): string {
  return [
    "# Evergreen measured against endoflife.date",
    "",
    "<!-- Result record. The command in README.md rewrites this page; endoflife-date.json is the data. -->",
    "",
    "This page applies the protocol in [the comparison method](../docs/COMPARISON_METHOD.md) to the " +
      "endoflife.date product data. It compares product coverage and the lifecycle dates both sides publish, " +
      "using the pinned corpus as the sample. Results are published as they are, including where Evergreen loses.",
    "",
    `* Snapshot: ${result.snapshot.retrievedAt}, ${result.snapshot.products} products with ${result.snapshot.cycles} release cycles.`,
    `* Evergreen: ${result.evergreen.registryRules} registry rules across ${result.evergreen.productFamilies} product families.`,
    `* Ground truth: ${result.evergreen.groundTruthRepositories} repositories, ${result.evergreen.groundTruthRecords} expected findings, ${result.evergreen.groundTruthRules} distinct rules.`,
    "",
    ...coverageSection(result),
    ...productsSection(result),
    ...agreementSection(result),
    ...disagreementsSection(result),
    ...correctnessSection(result),
    ...reproduceSection(result),
  ].join("\n");
}

/** Renders the committed JSON result. */
export function renderJson(result: ComparisonResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

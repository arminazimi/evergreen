// Generates one public reference page per lifecycle rule, and an index, from registry/*.json.
//
//   node dist/tools/build-reference-pages.js [--check]
//
// Output: docs/rules/<rule id>.md and docs/rules/index.md. With --check nothing is
// written: the command exits 1 and names every file that differs from what the registry would produce, so
// a page can never silently disagree with the data. It reads registry/*.json only and never uses the network.

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getCapabilityManifest } from "../src/capabilities.js";
import { DEFAULT_MAX_REVIEW_AGE_DAYS, REGISTRY_V2_SCHEMA_VERSION, validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2, RegistryV2Rule } from "../src/registry.js";

const REPOSITORY_URL = "https://github.com/arminazimi/evergreen";
const RULES_DIRECTORY = "docs/rules";

const EVENT_LABELS: Record<RegistryV2Rule["event"], string> = {
  deprecated: "Deprecated",
  "end-of-support": "End of support",
  "end-of-life": "End of life",
  removed: "Removed",
};

/** Detector pages that exist; other detectors are described in the detector guide. */
const DETECTOR_PAGES = new Set(["container", "go", "java", "kubernetes"]);

export interface GeneratedFile {
  /** Repository-relative path. */
  path: string;
  contents: string;
}

const dataUrl = (ecosystem: string) => `${REPOSITORY_URL}/blob/main/registry/${ecosystem}.json`;

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/** A string safe inside a YAML double-quoted scalar. */
const yaml = (value: string) => JSON.stringify(value);

/** A table cell: no pipes or newlines. */
const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

/** A short description for search results: the summary, cut at a sentence or word boundary. */
function description(rule: RegistryV2Rule): string {
  const text = rule.summary.replace(/\s+/g, " ").trim();
  if (text.length <= 200) return text;
  const cut = text.slice(0, 200);
  const sentence = cut.lastIndexOf(". ");
  return sentence > 80 ? cut.slice(0, sentence + 1) : `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
}

function detectorsFor(ecosystem: string): string[] {
  return getCapabilityManifest().ecosystems.find((entry) => entry.id === ecosystem)?.detectorIds.slice().sort() ?? [];
}

export function renderRulePage(rule: RegistryV2Rule, maxReviewAgeDays: number): string {
  const reviewDue = addDays(rule.provenance.reviewedAt, maxReviewAgeDays);
  const lines: string[] = [
    "---",
    `title: ${yaml(rule.title)}`,
    `description: ${yaml(description(rule))}`,
    "---",
    "",
    `# ${rule.title}`,
    "",
    rule.summary,
    "",
    "| | |",
    "| --- | --- |",
    `| Status | ${EVENT_LABELS[rule.event]} |`,
    `| Severity | ${rule.severity} |`,
    `| Ecosystem | \`${rule.ecosystem}\` |`,
    `| Component | \`${cell(rule.purl)}\` |`,
    `| Affected versions | \`${cell(rule.vers)}\` |`,
    `| Date from the source | ${rule.deadline ?? "The source gives no day"} |`,
    ...(rule.replacement ? [`| Replacement | ${cell(rule.replacement)} |`] : []),
    `| Evidence last seen | ${rule.provenance.observedAt} |`,
    `| Reviewed | ${rule.provenance.reviewedAt} by ${cell(rule.provenance.reviewer)}${rule.provenance.importer ? `, drafted by the \`${rule.provenance.importer}\` importer` : ""} |`,
    `| Review due | ${reviewDue} (${maxReviewAgeDays} days after the last review) |`,
    `| Rule ID | \`${rule.id}\` |`,
    "",
    "## Sources",
    "",
    ...rule.sources.map((source) => `- [${source.title}](${source.url})`),
  ];

  if (rule.migration) {
    lines.push("", "## Migration", "", "**Constraints**", "", ...rule.migration.constraints.map((constraint) => `- ${constraint}`));
    lines.push("", "**Steps**", "", ...rule.migration.steps.map((step, index) => `${index + 1}. **${step.title}.** ${step.instructions}`));
    lines.push("", "**Verification**", "", ...rule.migration.verification.map((check) => `- \`${check.command}\`: ${check.purpose}`));
  }

  const detectors = detectorsFor(rule.ecosystem);
  lines.push("", "## Detected by", "");
  if (detectors.length === 0) {
    lines.push(`No built-in detector reads \`${rule.ecosystem}\` declarations yet; the rule is data in the [lifecycle registry](${dataUrl(rule.ecosystem)}).`);
  } else {
    const links = detectors.map((id) => (DETECTOR_PAGES.has(id) ? `[\`${id}\`](../detectors/${id}.md)` : `\`${id}\``));
    lines.push(`The ${links.join(" and ")} detector${detectors.length > 1 ? "s" : ""}. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).`);
  }

  lines.push(
    "",
    "## Data",
    "",
    `This page is generated from [\`registry/${rule.ecosystem}.json\`](${dataUrl(rule.ecosystem)}), rule \`${rule.id}\`, in the \`${REGISTRY_V2_SCHEMA_VERSION}\` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.`,
    "",
  );
  return lines.join("\n");
}

export function renderIndex(registries: readonly RegistryV2[]): string {
  const lines = [
    "---",
    'title: "Lifecycle reference"',
    'description: "One page per lifecycle rule: status, affected versions, dates, sources, migration, and the detector that reads it."',
    "---",
    "",
    "# Lifecycle reference",
    "",
    "Every lifecycle claim Evergreen makes comes from a reviewed rule with an authoritative source. Each rule has a page with its status, affected versions, dates, sources, and migration steps. These pages are generated from the registry; see [Lifecycle rules](../RULES.md).",
  ];
  for (const registry of registries) {
    lines.push("", `## ${registry.ecosystem}`, "");
    for (const rule of [...registry.rules].sort((left, right) => left.id.localeCompare(right.id))) {
      lines.push(`- [${rule.title}](${rule.id}.html) — ${EVENT_LABELS[rule.event].toLowerCase()}, \`${rule.id}\``);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** The v2 registries in `registry/`, in ecosystem order. Other JSON files there are not rule registries. */
export async function loadRegistries(directory = "registry"): Promise<RegistryV2[]> {
  const registries: RegistryV2[] = [];
  for (const name of (await readdir(directory)).filter((file) => file.endsWith(".json")).sort()) {
    const value = JSON.parse(await readFile(join(directory, name), "utf8")) as { schemaVersion?: string };
    if (value.schemaVersion === REGISTRY_V2_SCHEMA_VERSION) registries.push(validateRegistryV2(value));
  }
  return registries.sort((left, right) => left.ecosystem.localeCompare(right.ecosystem));
}

export function buildFiles(registries: readonly RegistryV2[]): GeneratedFile[] {
  const files: GeneratedFile[] = [
    { path: `${RULES_DIRECTORY}/index.md`, contents: renderIndex(registries) },
  ];
  const seen = new Set<string>();
  for (const registry of registries) {
    const days = registry.freshness?.maxReviewAgeDays ?? DEFAULT_MAX_REVIEW_AGE_DAYS;
    for (const rule of registry.rules) {
      if (seen.has(rule.id)) throw new Error(`Rule id "${rule.id}" appears in more than one registry.`);
      seen.add(rule.id);
      files.push({ path: `${RULES_DIRECTORY}/${rule.id}.md`, contents: renderRulePage(rule, days) });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

/** Files that differ from `files`, and generated pages that no rule produces any more. */
export async function drift(files: readonly GeneratedFile[], root = "."): Promise<string[]> {
  const problems: string[] = [];
  for (const file of files) {
    const actual = await readFile(resolve(root, file.path), "utf8").catch(() => undefined);
    if (actual === undefined) problems.push(`missing: ${file.path}`);
    else if (actual !== file.contents) problems.push(`differs: ${file.path}`);
  }
  const expected = new Set(files.map((file) => file.path));
  for (const name of await readdir(resolve(root, RULES_DIRECTORY)).catch(() => [] as string[])) {
    const path = `${RULES_DIRECTORY}/${name}`;
    if (name.endsWith(".md") && !expected.has(path)) problems.push(`stale: ${path}`);
  }
  return problems.sort();
}

export async function write(files: readonly GeneratedFile[], root = "."): Promise<void> {
  const expected = new Set(files.map((file) => file.path));
  await mkdir(resolve(root, RULES_DIRECTORY), { recursive: true });
  for (const name of await readdir(resolve(root, RULES_DIRECTORY))) {
    if (name.endsWith(".md") && !expected.has(`${RULES_DIRECTORY}/${name}`)) await rm(resolve(root, RULES_DIRECTORY, name));
  }
  for (const file of files) await writeFile(resolve(root, file.path), file.contents);
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const files = buildFiles(await loadRegistries());
  if (argv.includes("--check")) {
    const problems = await drift(files);
    if (problems.length === 0) return 0;
    console.error(`The reference pages are out of date with registry/ (${problems.length} files). Run \`npm run build:reference\` and commit the result:`);
    for (const problem of problems.slice(0, 20)) console.error(`  ${problem}`);
    if (problems.length > 20) console.error(`  … and ${problems.length - 20} more`);
    return 1;
  }
  await write(files);
  console.log(`Wrote ${files.length} files in docs/rules/.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();

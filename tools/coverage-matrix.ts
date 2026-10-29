// Generates three marked sections: "Ecosystem coverage" in docs/COMPATIBILITY.md from the capability
// manifest and docs/coverage-descriptions.json; "Accuracy by detector" in docs/VALIDATION.md from the
// last full corpus run in benchmarks/thresholds.json; and the State of EOL aggregates in
// docs/state-of-eol.md from corpus expected findings joined to registry rules.
//
//   node dist/tools/coverage-matrix.js            # rewrites the marked tables
//   node dist/tools/coverage-matrix.js --check    # exits 1 if a committed table is out of date
//
// Only the bytes between each pair of markers are replaced; the rest of each document stays as written.
// It reads local files only, uses no clock, and never uses the network.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { maturityLabels } from "../benchmarks/maturity.js";
import { maturityLevels } from "../benchmarks/thresholds.js";
import type { FullRunRecord, MaturityLevel, Thresholds } from "../benchmarks/thresholds.js";
import { getCapabilityManifest } from "../src/capabilities.js";
import type { CapabilityManifest } from "../src/capabilities.js";
import { parsePurl } from "../src/purl.js";
import { REGISTRY_V2_SCHEMA_VERSION, validateRegistryV2 } from "../src/registry.js";
import type { LifecycleEvent, RegistryV2Rule } from "../src/registry.js";

export const COMPATIBILITY_PATH = "docs/COMPATIBILITY.md";
export const DESCRIPTIONS_PATH = "docs/coverage-descriptions.json";
export const START_MARKER = "<!-- coverage-matrix:start -->";
export const END_MARKER = "<!-- coverage-matrix:end -->";

export const VALIDATION_PATH = "docs/VALIDATION.md";
export const THRESHOLDS_PATH = "benchmarks/thresholds.json";
export const ACCURACY_START_MARKER = "<!-- accuracy-tables:start -->";
export const ACCURACY_END_MARKER = "<!-- accuracy-tables:end -->";

export const STATE_OF_EOL_PATH = "docs/state-of-eol.md";
export const CORPUS_PATH = "benchmarks/public-repositories.json";
export const REGISTRY_DIRECTORY = "registry";
export const STATE_OF_EOL_START_MARKER = "<!-- state-of-eol:start -->";
export const STATE_OF_EOL_END_MARKER = "<!-- state-of-eol:end -->";

export interface CoverageRow {
  /** The manifest ecosystems this row describes. Node.js and npm share one row. */
  ecosystems: string[];
  name: string;
  coverage: string;
}

export interface CoverageDescriptions {
  schemaVersion: "evergreen.coverage-descriptions.v1";
  rows: CoverageRow[];
  /** The row for ecosystems with no detector, which has no manifest entry. */
  unsupported: { name: string; coverage: string };
}

export interface CorpusExpectedFinding {
  ruleId: string;
}

export interface CorpusRepository {
  repository: string;
  expected?: CorpusExpectedFinding[];
}

export interface CorpusFile {
  repositories: CorpusRepository[];
}

export interface StateOfEolLineRow {
  product: string;
  purl: string;
  ruleId: string;
  title: string;
  event: LifecycleEvent;
  findings: number;
  repositories: number;
}

export interface StateOfEolProductRow {
  product: string;
  purl: string;
  findings: number;
  lines: number;
  repositories: number;
}

export interface StateOfEolSummary {
  repositories: number;
  findings: number;
  products: number;
  lines: number;
  byProduct: StateOfEolProductRow[];
  byLine: StateOfEolLineRow[];
}

const rank = (level: MaturityLevel): number => maturityLevels.indexOf(level);

function ecosystemFor(manifest: CapabilityManifest, id: string) {
  const ecosystem = manifest.ecosystems.find((entry) => entry.id === id);
  if (!ecosystem) throw new Error(`Coverage row names "${id}", which is not in the capability manifest.`);
  return ecosystem;
}

/** Every manifest ecosystem has exactly one row, and every row names only manifest ecosystems. */
export function validateDescriptions(manifest: CapabilityManifest, descriptions: CoverageDescriptions): void {
  const known = new Set(manifest.ecosystems.map((ecosystem) => ecosystem.id));
  const described = new Set<string>();
  for (const row of descriptions.rows) {
    if (row.ecosystems.length === 0) throw new Error(`Coverage row "${row.name}" names no ecosystem.`);
    const detectors = new Set<string>();
    for (const id of row.ecosystems) {
      if (!known.has(id)) throw new Error(`Coverage row "${row.name}" names "${id}", which is not in the capability manifest.`);
      if (described.has(id)) throw new Error(`Ecosystem "${id}" has more than one coverage description.`);
      described.add(id);
      detectors.add(ecosystemFor(manifest, id).detectorIds.slice().sort().join(","));
    }
    if (detectors.size > 1) throw new Error(`Coverage row "${row.name}" groups ecosystems served by different detectors.`);
  }
  for (const ecosystem of manifest.ecosystems) {
    if (!described.has(ecosystem.id)) throw new Error(`Ecosystem "${ecosystem.id}" has no coverage description.`);
  }
}

/** The status word for a row: the lowest maturity among its ecosystems (decision 0013). */
function statusFor(manifest: CapabilityManifest, row: CoverageRow): string {
  const levels = row.ecosystems.map((id) => {
    const maturity = ecosystemFor(manifest, id).maturity;
    if (!maturity) throw new Error(`Ecosystem "${id}" has no maturity in the capability manifest.`);
    return maturity;
  });
  const lowest = levels.reduce((low, level) => (rank(level) < rank(low) ? level : low), levels[0]!);
  return maturityLabels[lowest];
}

export function renderCoverageTable(manifest: CapabilityManifest, descriptions: CoverageDescriptions): string {
  validateDescriptions(manifest, descriptions);
  return [
    "| Detector ecosystem | Status | Coverage |",
    "| --- | --- | --- |",
    ...descriptions.rows.map((row) => `| ${row.name} | ${statusFor(manifest, row)} | ${row.coverage} |`),
    `| ${descriptions.unsupported.name} | Unsupported | ${descriptions.unsupported.coverage} |`,
  ].join("\n");
}

/** Replaces only the table between the two markers; every other byte is returned unchanged. */
export function replaceCoverageTable(document: string, table: string): string {
  const start = document.indexOf(START_MARKER);
  const end = document.indexOf(END_MARKER);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`${COMPATIBILITY_PATH} must contain ${START_MARKER} before ${END_MARKER}.`);
  }
  return `${document.slice(0, start + START_MARKER.length)}\n${table}\n${document.slice(end)}`;
}

export async function loadDescriptions(root = "."): Promise<CoverageDescriptions> {
  const value = JSON.parse(await readFile(resolve(root, DESCRIPTIONS_PATH), "utf8")) as CoverageDescriptions;
  if (value.schemaVersion !== "evergreen.coverage-descriptions.v1") {
    throw new Error(`${DESCRIPTIONS_PATH} must use schemaVersion "evergreen.coverage-descriptions.v1".`);
  }
  return value;
}

/** The document with the table regenerated in memory; writing is left to `main`. */
export async function buildDocument(root = "."): Promise<string> {
  const document = await readFile(resolve(root, COMPATIBILITY_PATH), "utf8");
  const descriptions = await loadDescriptions(root);
  return replaceCoverageTable(document, renderCoverageTable(getCapabilityManifest(), descriptions));
}

const ratio = (numerator: number, denominator: number): string =>
  denominator === 0 ? "n/a" : (numerator / denominator).toFixed(3);

/**
 * Precision and recall per detector from the last full corpus run, next to the maturity each detector has earned
 * (decision 0013). A detector the run did not score shows dashes; one that reported nothing shows `n/a` where a
 * ratio has no denominator.
 */
export function renderAccuracyTable(thresholds: Thresholds): string {
  const run = thresholds.lastFullRun;
  if (!run) throw new Error(`${THRESHOLDS_PATH} has no lastFullRun; record a full corpus run first.`);
  const ids = [...new Set([...Object.keys(thresholds.detectors), ...Object.keys(run.perDetector)])].sort();
  const rows = ids.map((id) => {
    const level = thresholds.detectors[id]?.level;
    const label = level ? maturityLabels[level] : "—";
    const score = run.perDetector[id];
    if (!score) return `| ${id} | ${label} | — | — | — | — | — |`;
    const { truePositives: tp, falsePositives: fp, falseNegatives: fn } = score;
    return `| ${id} | ${label} | ${tp} | ${fp} | ${fn} | ${ratio(tp, tp + fp)} | ${ratio(tp, tp + fn)} |`;
  });
  return [
    `Measured on ${run.repositories} pinned repositories at commit \`${run.commit}\` on ${run.date}. Regenerate with \`npm run build:coverage\` after \`npm run record:corpus-run\`.`,
    "",
    "| Detector | Maturity | True positives | False positives | False negatives | Precision | Recall |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/** Replaces only the bytes between the accuracy markers. */
export function replaceAccuracyTable(document: string, table: string): string {
  const start = document.indexOf(ACCURACY_START_MARKER);
  const end = document.indexOf(ACCURACY_END_MARKER);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`${VALIDATION_PATH} must contain ${ACCURACY_START_MARKER} before ${ACCURACY_END_MARKER}.`);
  }
  return `${document.slice(0, start + ACCURACY_START_MARKER.length)}\n${table}\n${document.slice(end)}`;
}

/** docs/VALIDATION.md with the accuracy table regenerated in memory. */
export async function buildValidationDocument(root = "."): Promise<string> {
  const document = await readFile(resolve(root, VALIDATION_PATH), "utf8");
  const thresholds = JSON.parse(await readFile(resolve(root, THRESHOLDS_PATH), "utf8")) as Thresholds;
  return replaceAccuracyTable(document, renderAccuracyTable(thresholds));
}

/** The human product name for a Package URL: `namespace/name` when present, otherwise `name`. */
export function productNameFromPurl(purl: string): string {
  const parsed = parsePurl(purl);
  return parsed.namespace ? `${parsed.namespace}/${parsed.name}` : parsed.name;
}

const cell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", " ");

/** Load every v2 registry rule keyed by id. Other JSON files under registry/ are skipped. */
export async function loadRegistryRulesById(root = "."): Promise<Map<string, RegistryV2Rule>> {
  const directory = resolve(root, REGISTRY_DIRECTORY);
  const rules = new Map<string, RegistryV2Rule>();
  for (const name of (await readdir(directory)).filter((file) => file.endsWith(".json")).sort()) {
    const value = JSON.parse(await readFile(join(directory, name), "utf8")) as { schemaVersion?: string };
    if (value.schemaVersion !== REGISTRY_V2_SCHEMA_VERSION) continue;
    for (const rule of validateRegistryV2(value).rules) {
      if (rules.has(rule.id)) throw new Error(`Rule id "${rule.id}" appears in more than one registry.`);
      rules.set(rule.id, rule);
    }
  }
  return rules;
}

/**
 * Aggregate corpus expected findings by product (Package URL) and release line (rule). Each expected
 * finding must name a bundled rule.
 */
export function aggregateStateOfEol(
  corpus: CorpusFile,
  rules: ReadonlyMap<string, RegistryV2Rule>,
): StateOfEolSummary {
  interface LineAccumulator {
    product: string;
    purl: string;
    ruleId: string;
    title: string;
    event: LifecycleEvent;
    findings: number;
    repositories: Set<string>;
  }
  const byLine = new Map<string, LineAccumulator>();
  let findings = 0;
  for (const repository of corpus.repositories) {
    for (const expected of repository.expected ?? []) {
      const rule = rules.get(expected.ruleId);
      if (!rule) throw new Error(`Corpus expected finding names unknown rule "${expected.ruleId}".`);
      findings += 1;
      const existing = byLine.get(rule.id);
      if (existing) {
        existing.findings += 1;
        existing.repositories.add(repository.repository);
        continue;
      }
      byLine.set(rule.id, {
        product: productNameFromPurl(rule.purl),
        purl: rule.purl,
        ruleId: rule.id,
        title: rule.title,
        event: rule.event,
        findings: 1,
        repositories: new Set([repository.repository]),
      });
    }
  }

  const lineRows: StateOfEolLineRow[] = [...byLine.values()]
    .map((row) => ({
      product: row.product,
      purl: row.purl,
      ruleId: row.ruleId,
      title: row.title,
      event: row.event,
      findings: row.findings,
      repositories: row.repositories.size,
    }))
    .sort(
      (left, right) =>
        right.findings - left.findings ||
        left.product.localeCompare(right.product) ||
        left.ruleId.localeCompare(right.ruleId),
    );

  const products = new Map<string, { product: string; purl: string; findings: number; lines: number; repositories: Set<string> }>();
  for (const repository of corpus.repositories) {
    for (const expected of repository.expected ?? []) {
      const rule = rules.get(expected.ruleId)!;
      const group = products.get(rule.purl) ?? {
        product: productNameFromPurl(rule.purl),
        purl: rule.purl,
        findings: 0,
        lines: 0,
        repositories: new Set<string>(),
      };
      group.findings += 1;
      group.repositories.add(repository.repository);
      products.set(rule.purl, group);
    }
  }
  for (const row of lineRows) {
    const group = products.get(row.purl);
    if (group) group.lines += 1;
  }

  const byProduct: StateOfEolProductRow[] = [...products.values()]
    .map((row) => ({
      product: row.product,
      purl: row.purl,
      findings: row.findings,
      lines: row.lines,
      repositories: row.repositories.size,
    }))
    .sort(
      (left, right) =>
        right.findings - left.findings || left.product.localeCompare(right.product) || left.purl.localeCompare(right.purl),
    );

  return {
    repositories: corpus.repositories.length,
    findings,
    products: byProduct.length,
    lines: lineRows.length,
    byProduct,
    byLine: lineRows,
  };
}

/** Markdown for the State of EOL page: method and corpus revision, then product and line tables. */
export function renderStateOfEolSection(summary: StateOfEolSummary, run: FullRunRecord): string {
  return [
    `Measured on the public corpus of ${summary.repositories} pinned repositories (${summary.findings} expected findings). The last full corpus run was commit \`${run.commit}\` on ${run.date} (${run.repositories} repositories, precision ${run.precision}, recall ${run.recall}). Method: [Validation](VALIDATION.md). Corpus: [\`benchmarks/public-repositories.json\`](../benchmarks/public-repositories.json). Regenerate with \`npm run build:coverage\` after \`npm run record:corpus-run\`.`,
    "",
    "| Measure | Value |",
    "| --- | ---: |",
    `| Repositories | ${summary.repositories} |`,
    `| Expected findings | ${summary.findings} |`,
    `| Products with findings | ${summary.products} |`,
    `| Release lines with findings | ${summary.lines} |`,
    "",
    "### By product",
    "",
    "| Product | Findings | Release lines | Repositories |",
    "| --- | ---: | ---: | ---: |",
    ...summary.byProduct.map(
      (row) => `| ${cell(row.product)} | ${row.findings} | ${row.lines} | ${row.repositories} |`,
    ),
    "",
    "### By product and release line",
    "",
    "| Product | Release line | Rule | Event | Findings | Repositories |",
    "| --- | --- | --- | --- | ---: | ---: |",
    ...summary.byLine.map(
      (row) =>
        `| ${cell(row.product)} | ${cell(row.title)} | [\`${row.ruleId}\`](rules/${row.ruleId}.html) | ${row.event} | ${row.findings} | ${row.repositories} |`,
    ),
  ].join("\n");
}

/** Replaces only the bytes between the State of EOL markers. */
export function replaceStateOfEolSection(document: string, section: string): string {
  const start = document.indexOf(STATE_OF_EOL_START_MARKER);
  const end = document.indexOf(STATE_OF_EOL_END_MARKER);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`${STATE_OF_EOL_PATH} must contain ${STATE_OF_EOL_START_MARKER} before ${STATE_OF_EOL_END_MARKER}.`);
  }
  return `${document.slice(0, start + STATE_OF_EOL_START_MARKER.length)}\n${section}\n${document.slice(end)}`;
}

/** docs/state-of-eol.md with the aggregate tables regenerated in memory. */
export async function buildStateOfEolDocument(root = "."): Promise<string> {
  const document = await readFile(resolve(root, STATE_OF_EOL_PATH), "utf8");
  const corpus = JSON.parse(await readFile(resolve(root, CORPUS_PATH), "utf8")) as CorpusFile;
  const thresholds = JSON.parse(await readFile(resolve(root, THRESHOLDS_PATH), "utf8")) as Thresholds;
  if (!thresholds.lastFullRun) throw new Error(`${THRESHOLDS_PATH} has no lastFullRun; record a full corpus run first.`);
  const rules = await loadRegistryRulesById(root);
  const summary = aggregateStateOfEol(corpus, rules);
  return replaceStateOfEolSection(document, renderStateOfEolSection(summary, thresholds.lastFullRun));
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const targets = [
    { path: COMPATIBILITY_PATH, build: () => buildDocument() },
    { path: VALIDATION_PATH, build: () => buildValidationDocument() },
    { path: STATE_OF_EOL_PATH, build: () => buildStateOfEolDocument() },
  ];
  let stale = false;
  for (const target of targets) {
    const file = resolve(target.path);
    const current = await readFile(file, "utf8");
    const next = await target.build();
    if (argv.includes("--check")) {
      if (current !== next) {
        console.error(`${target.path} is out of date. Run: npm run build:coverage`);
        stale = true;
      }
      continue;
    }
    if (current !== next) await writeFile(file, next);
    console.log(`Wrote the generated table in ${target.path}.`);
  }
  return stale ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();

// Generates the "Ecosystem coverage" table in docs/COMPATIBILITY.md from the capability manifest and
// docs/coverage-descriptions.json.
//
//   node dist/tools/coverage-matrix.js            # rewrites the marked table
//   node dist/tools/coverage-matrix.js --check    # exits 1 if the committed table is out of date
//
// Only the bytes between the two markers are replaced; the rest of docs/COMPATIBILITY.md stays as written.
// It reads local files only, uses no clock, and never uses the network.

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { maturityLabels } from "../benchmarks/maturity.js";
import { maturityLevels } from "../benchmarks/thresholds.js";
import type { MaturityLevel } from "../benchmarks/thresholds.js";
import { getCapabilityManifest } from "../src/capabilities.js";
import type { CapabilityManifest } from "../src/capabilities.js";

export const COMPATIBILITY_PATH = "docs/COMPATIBILITY.md";
export const DESCRIPTIONS_PATH = "docs/coverage-descriptions.json";
export const START_MARKER = "<!-- coverage-matrix:start -->";
export const END_MARKER = "<!-- coverage-matrix:end -->";

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

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const path = resolve(COMPATIBILITY_PATH);
  const current = await readFile(path, "utf8");
  const next = replaceCoverageTable(current, renderCoverageTable(getCapabilityManifest(), await loadDescriptions()));
  if (argv.includes("--check")) {
    if (current === next) return 0;
    console.error(`${COMPATIBILITY_PATH} is out of date. Run: npm run build:coverage`);
    return 1;
  }
  if (current !== next) await writeFile(path, next);
  console.log(`Wrote the ecosystem coverage table in ${COMPATIBILITY_PATH}.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();

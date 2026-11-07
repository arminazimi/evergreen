// One command that rebuilds every committed comparison table from the committed inputs and
// compares it with the published result. It reads only committed files: no network, no repository
// code, and no clock, so a clean checkout reproduces the same bytes.
//
//   npm run comparison:reproduce                 # verify, then print the pinned versions and counts
//   npm run comparison:reproduce -- --record     # rewrite the tables and the known result
//
// The known result is benchmarks/comparison/reproduce.json: the pinned versions, the input counts,
// the headline counts, and the SHA-256 of every generated file. --record is for a maintainer who has
// deliberately re-run a collection step; this command never runs the collectors or a scanned
// repository.
//
// Collecting new raw records is separate and documented in each comparison's README:
//   renovate/README.md, dependabot/README.md, and README.md (endoflife.date).

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  corpusEntries,
  loadRegistryRules,
  RESULT_JSON_PATH as ENDOFLIFE_JSON_PATH,
  RESULT_MARKDOWN_PATH as ENDOFLIFE_MARKDOWN_PATH,
  SNAPSHOT_PATH,
} from "./compare-endoflife-date.js";
import { buildResult as buildDependabotResult } from "./dependabot/aggregate.js";
import { loadRecords as loadDependabotRecords } from "./dependabot/build.js";
import { renderJson as renderDependabotJson, renderMarkdown as renderDependabotMarkdown } from "./dependabot/report.js";
import type { ComparisonResult as DependabotResult } from "./dependabot/types.js";
import { buildResult as buildEndoflifeDateResult } from "./endoflife/result.js";
import {
  renderJson as renderEndoflifeDateJson,
  renderMarkdown as renderEndoflifeDateMarkdown,
} from "./endoflife/report.js";
import { loadSnapshot } from "./endoflife/snapshot.js";
import { buildResult as buildRenovateResult } from "./renovate/aggregate.js";
import { loadRecords as loadRenovateRecords } from "./renovate/build.js";
import { renderJson as renderRenovateJson, renderMarkdown as renderRenovateMarkdown } from "./renovate/report.js";
import type { ComparisonResult as RenovateResult } from "./renovate/types.js";

export const RECORD_SCHEMA_VERSION = "evergreen.comparison.reproduce.v1" as const;
export const REPRODUCE_PATH = "benchmarks/comparison/reproduce.json";
const RENOVATE_DIR = "benchmarks/comparison/renovate";
const DEPENDABOT_DIR = "benchmarks/comparison/dependabot";
const NODE_RANGE = ">=22";

/** A table this command writes, with its contents rendered from committed inputs. */
export interface GeneratedFile {
  path: string;
  contents: string;
}

/** Counts for one selection group: the repositories, then the outcome tally. */
export interface SelectionCounts {
  repositories: number;
  outcomes: Record<string, number>;
}

/** One comparison, rebuilt in memory. */
export interface BuiltComparison {
  name: string;
  /** The versions and fixed inputs that produced the published tables. */
  pins: Record<string, string>;
  /** How many committed input records the rebuild read. */
  inputs: Record<string, number>;
  /** The headline counts a reader compares against the published tables. */
  known: Record<string, number | SelectionCounts>;
  files: GeneratedFile[];
}

/** The committed known result: pins, counts, and a SHA-256 for every generated file. */
export interface ReproductionRecord {
  schemaVersion: typeof RECORD_SCHEMA_VERSION;
  method: "docs/COMPARISON_METHOD.md";
  command: "npm run comparison:reproduce";
  node: string;
  comparisons: Array<Omit<BuiltComparison, "files"> & { files: Array<{ path: string; sha256: string }> }>;
}

export type ComparisonBuilder = (root: string) => Promise<BuiltComparison>;

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function groups(result: RenovateResult | DependabotResult): Record<string, SelectionCounts> {
  return Object.fromEntries(
    result.groups.map((group) => [
      group.selection,
      { repositories: group.repositories, outcomes: { ...group.outcomes } },
    ]),
  );
}

async function buildRenovate(root: string): Promise<BuiltComparison> {
  const records = await loadRenovateRecords(resolve(root, RENOVATE_DIR));
  const result = buildRenovateResult(records);
  return {
    name: "renovate",
    pins: {
      renovate: result.renovateVersions.join(", "),
      evergreen: result.evergreenVersions.join(", "),
      commits: result.evergreenCommits.join(", "),
    },
    inputs: { rawRecords: records.length },
    known: groups(result),
    files: [
      { path: `${RENOVATE_DIR}/renovate.json`, contents: renderRenovateJson(result) },
      { path: `${RENOVATE_DIR}/renovate.md`, contents: `${renderRenovateMarkdown(result)}\n` },
    ],
  };
}

async function buildDependabot(root: string): Promise<BuiltComparison> {
  const records = await loadDependabotRecords(resolve(root, DEPENDABOT_DIR));
  const result = buildDependabotResult(records);
  return {
    name: "dependabot",
    pins: {
      dependabot: result.dependabot.run,
      evergreen: result.evergreenVersions.join(", "),
      commits: result.evergreenCommits.join(", "),
    },
    inputs: { rawRecords: records.length },
    known: groups(result),
    files: [
      { path: `${DEPENDABOT_DIR}/dependabot.json`, contents: renderDependabotJson(result) },
      { path: `${DEPENDABOT_DIR}/dependabot.md`, contents: `${renderDependabotMarkdown(result)}\n` },
    ],
  };
}

async function buildEndoflifeDate(root: string): Promise<BuiltComparison> {
  const [rules, snapshot, entries, snapshotBytes] = await Promise.all([
    loadRegistryRules(root),
    loadSnapshot(resolve(root, SNAPSHOT_PATH)),
    corpusEntries(root),
    readFile(resolve(root, SNAPSHOT_PATH)),
  ]);
  const result = buildEndoflifeDateResult({ rules, snapshot, entries });
  return {
    name: "endoflife-date",
    pins: { snapshot: result.snapshot.retrievedAt, snapshotSha256: sha256(snapshotBytes) },
    inputs: {
      registryRules: result.evergreen.registryRules,
      corpusRepositories: result.evergreen.groundTruthRepositories,
      snapshotProducts: result.snapshot.products,
      snapshotCycles: result.snapshot.cycles,
    },
    known: {
      products: result.products.length,
      measured: result.agreement.all.measured,
      agree: result.agreement.all.agree,
      disagree: result.agreement.all.disagree,
      groundTruthRules: result.agreement.groundTruth.rules,
      groundTruthMeasured: result.agreement.groundTruth.measured,
      groundTruthAgree: result.agreement.groundTruth.agree,
      groundTruthDisagree: result.agreement.groundTruth.disagree,
      vendorChecked: result.correctness.sample,
    },
    files: [
      { path: ENDOFLIFE_JSON_PATH, contents: renderEndoflifeDateJson(result) },
      { path: ENDOFLIFE_MARKDOWN_PATH, contents: renderEndoflifeDateMarkdown(result) },
    ],
  };
}

/** The comparisons in their documented order; a test can replace them. */
export const BUILDERS: readonly ComparisonBuilder[] = [buildRenovate, buildDependabot, buildEndoflifeDate];

/** Rebuilds every comparison from the committed inputs, in the order the tables are published. */
export async function buildComparisons(
  root: string,
  builders: readonly ComparisonBuilder[] = BUILDERS,
): Promise<BuiltComparison[]> {
  const built: BuiltComparison[] = [];
  for (const builder of builders) built.push(await builder(root));
  return built;
}

/** Replaces each rendered file with its SHA-256, so the record holds no generated table copy. */
export function recordComparisons(comparisons: readonly BuiltComparison[]): ReproductionRecord {
  return {
    schemaVersion: RECORD_SCHEMA_VERSION,
    method: "docs/COMPARISON_METHOD.md",
    command: "npm run comparison:reproduce",
    node: NODE_RANGE,
    comparisons: comparisons.map(({ files, ...comparison }) => ({
      ...comparison,
      files: files.map((file) => ({ path: file.path, sha256: sha256(file.contents) })),
    })),
  };
}

export function renderRecord(record: ReproductionRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

function formatSelection(counts: SelectionCounts): string {
  const outcomes = Object.entries(counts.outcomes)
    .map(([outcome, value]) => `${outcome} ${value}`)
    .join(", ");
  return `${counts.repositories} repositories${outcomes === "" ? "" : ` (${outcomes})`}`;
}

/** The human-readable half of the known result, printed by both modes. */
export function renderSummary(comparisons: readonly BuiltComparison[]): string[] {
  const lines: string[] = [];
  for (const comparison of comparisons) {
    const pins = Object.entries(comparison.pins)
      .map(([name, value]) => `${name} ${value}`)
      .join(" · ");
    lines.push(`${comparison.name}: ${pins}`);
    lines.push(
      `  inputs: ${Object.entries(comparison.inputs)
        .map(([name, value]) => `${name} ${value}`)
        .join(", ")}`,
    );
    lines.push(
      `  known: ${Object.entries(comparison.known)
        .map(([name, value]) => (typeof value === "number" ? `${name} ${value}` : `${name} ${formatSelection(value)}`))
        .join(" · ")}`,
    );
  }
  return lines;
}

/** Every committed file the rebuild must reproduce, plus the known result itself. */
async function verify(root: string, comparisons: BuiltComparison[]): Promise<string[]> {
  const problems: string[] = [];
  for (const comparison of comparisons) {
    for (const file of comparison.files) {
      const committed = await readFile(resolve(root, file.path), "utf8").catch(() => undefined);
      if (committed === undefined) problems.push(`${file.path} is missing`);
      else if (committed !== file.contents) problems.push(`${file.path} does not match the committed result`);
    }
  }
  const record = renderRecord(recordComparisons(comparisons));
  const committedRecord = await readFile(resolve(root, REPRODUCE_PATH), "utf8").catch(() => undefined);
  if (committedRecord === undefined) problems.push(`${REPRODUCE_PATH} is missing`);
  else if (committedRecord !== record) {
    problems.push(`${REPRODUCE_PATH} does not match the pinned versions, inputs, or known result`);
  }
  return problems;
}

export interface ReproduceOptions {
  root?: string;
  builders?: readonly ComparisonBuilder[];
  log?: (line: string) => void;
  error?: (line: string) => void;
}

export async function main(argv: readonly string[], options: ReproduceOptions = {}): Promise<number> {
  const root = options.root ?? process.cwd();
  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const error = options.error ?? ((line: string) => process.stderr.write(`${line}\n`));
  const recordMode = argv.includes("--record");
  if (recordMode && argv.includes("--check")) {
    error("comparison: --record and --check are different modes; choose one");
    return 2;
  }
  const comparisons = await buildComparisons(root, options.builders);
  if (recordMode) {
    for (const comparison of comparisons) {
      for (const file of comparison.files) {
        const path = resolve(root, file.path);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, file.contents);
      }
    }
    const recordPath = resolve(root, REPRODUCE_PATH);
    await mkdir(dirname(recordPath), { recursive: true });
    await writeFile(recordPath, renderRecord(recordComparisons(comparisons)));
    for (const line of renderSummary(comparisons)) log(line);
    log(
      `comparison: wrote ${comparisons.reduce((sum, comparison) => sum + comparison.files.length, 0)} files ` +
        `and ${REPRODUCE_PATH}`,
    );
    return 0;
  }
  const problems = await verify(root, comparisons);
  if (problems.length > 0) {
    for (const problem of problems) error(`comparison: ${problem}`);
    error(
      `comparison: rerun with --record after a deliberate collection step: npm run comparison:reproduce -- --record`,
    );
    return 1;
  }
  for (const line of renderSummary(comparisons)) log(line);
  log(
    `comparison: ${comparisons.reduce((sum, comparison) => sum + comparison.files.length, 0)} files match ` +
      `${REPRODUCE_PATH}`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}

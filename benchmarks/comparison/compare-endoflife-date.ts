// Measures Evergreen's lifecycle data against endoflife.date, offline, and writes the result files.
//
//   node dist/benchmarks/comparison/compare-endoflife-date.js          # rewrite the JSON and Markdown result
//   node dist/benchmarks/comparison/compare-endoflife-date.js --check  # exit 1 when either committed file is stale
//
// The snapshot is refreshed by a maintainer with network access; this command reads only committed files,
// so the result is reproducible in CI and never runs repository code.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { REGISTRY_V2_SCHEMA_VERSION, validateRegistryV2 } from "../../src/registry.js";
import { buildResult } from "./endoflife/result.js";
import { renderJson, renderMarkdown } from "./endoflife/report.js";
import { loadSnapshot } from "./endoflife/snapshot.js";
import type { CorpusEntry, RegistryRule } from "./endoflife/types.js";

export const SNAPSHOT_PATH = "benchmarks/comparison/endoflife-date.snapshot.json";
export const RESULT_JSON_PATH = "benchmarks/comparison/endoflife-date.json";
export const RESULT_MARKDOWN_PATH = "benchmarks/comparison/endoflife-date.md";

const REGISTRY_DIRECTORY = "registry";
const CORPUS_DIRECTORY = "benchmarks/public-repositories";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads every validated v2 registry file, sorted by file name so rule order is deterministic. */
export async function loadRegistryRules(root: string): Promise<RegistryRule[]> {
  const directory = resolve(root, REGISTRY_DIRECTORY);
  const rules: RegistryRule[] = [];
  for (const name of (await readdir(directory)).filter((file) => file.endsWith(".json")).sort()) {
    const value: unknown = JSON.parse(await readFile(join(directory, name), "utf8"));
    if (!isRecord(value) || value.schemaVersion !== REGISTRY_V2_SCHEMA_VERSION) continue;
    for (const rule of validateRegistryV2(value).rules) {
      rules.push({
        id: rule.id,
        ecosystem: rule.ecosystem,
        purl: rule.purl,
        vers: rule.vers,
        event: rule.event,
        ...(rule.deadline === undefined ? {} : { deadline: rule.deadline }),
      });
    }
  }
  return rules;
}

function parseExpected(raw: unknown, where: string): CorpusEntry["expected"][number] {
  if (!isRecord(raw)) throw new Error(`${where}: expected finding is not an object`);
  if (typeof raw.ruleId !== "string" || typeof raw.path !== "string") {
    throw new Error(`${where}: expected finding needs a string ruleId and path`);
  }
  if (raw.line !== undefined && typeof raw.line !== "number") throw new Error(`${where}: line must be a number`);
  const source = raw.groundTruthSource;
  const groundTruthSource =
    isRecord(source) && typeof source.kind === "string"
      ? { kind: source.kind, ...(typeof source.note === "string" ? { note: source.note } : {}) }
      : undefined;
  return {
    ruleId: raw.ruleId,
    path: raw.path,
    ...(raw.line === undefined ? {} : { line: raw.line }),
    ...(groundTruthSource === undefined ? {} : { groundTruthSource }),
  };
}

/** Reads the pinned corpus directly: its JSON carries the ground-truth notes, which the shared type omits. */
async function corpusEntries(root: string): Promise<CorpusEntry[]> {
  const directory = resolve(root, CORPUS_DIRECTORY);
  const entries: CorpusEntry[] = [];
  for (const ecosystem of (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    const files = (await readdir(join(directory, ecosystem))).filter((file) => file.endsWith(".json")).sort();
    for (const file of files) {
      const where = `${CORPUS_DIRECTORY}/${ecosystem}/${file}`;
      const value: unknown = JSON.parse(await readFile(join(directory, ecosystem, file), "utf8"));
      if (!isRecord(value) || typeof value.repository !== "string" || typeof value.commit !== "string") {
        throw new Error(`${where}: needs string repository and commit`);
      }
      if (!Array.isArray(value.expected)) throw new Error(`${where}: expected must be an array`);
      entries.push({
        repository: value.repository,
        commit: value.commit,
        expected: value.expected.map((finding) => parseExpected(finding, where)),
      });
    }
  }
  return entries;
}

async function check(paths: readonly (readonly [string, string])[]): Promise<void> {
  const stale: string[] = [];
  for (const [path, expected] of paths) {
    try {
      if ((await readFile(resolve(path), "utf8")) !== expected) stale.push(path);
    } catch {
      stale.push(path);
    }
  }
  if (stale.length > 0) {
    console.error(`comparison: stale files, rerun without --check: ${stale.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("comparison: endoflife.date result is up to date");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd();
  const [rules, snapshot] = await Promise.all([loadRegistryRules(root), loadSnapshot(resolve(root, SNAPSHOT_PATH))]);
  const result = buildResult({ rules, snapshot, entries: await corpusEntries(root) });
  const files = [
    [RESULT_JSON_PATH, renderJson(result)],
    [RESULT_MARKDOWN_PATH, renderMarkdown(result)],
  ] as const;
  if (process.argv.includes("--check")) {
    await check(files);
  } else {
    for (const [path, contents] of files) await writeFile(resolve(path), contents);
    const measured = result.agreement.all.measured;
    const agree = result.agreement.all.agree;
    console.log(
      `comparison: ${result.products.length} products, ${measured} measured cycles, ${agree} agree, ` +
        `${result.agreement.all.disagree} disagree, ${result.correctness.sample} vendor-checked`,
    );
  }
}

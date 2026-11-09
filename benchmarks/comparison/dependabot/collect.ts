// Maintainer action: checks every selected pinned checkout for a committed Dependabot
// configuration and records one raw file per repository. It runs offline, reads the corpus cache,
// and never executes repository code.
//
//   export EVERGREEN_CORPUS_CACHE=~/.cache/evergreen-corpus && npm run corpus:warm
//   node dist/benchmarks/comparison/dependabot/collect.js [--cache <dir>] [--concurrency 16] [--force] [--only owner/name]
//
// Dependabot itself is not run: docs/COMPARISON_METHOD.md section 7 records why that is not possible
// against a pinned commit.

import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { builtInDetectors } from "../../../src/detectors/index.js";
import { buildDependabotUpdates } from "../../../src/dependabot-config.js";
import type { Finding } from "../../../src/domain.js";
import { scanRepository } from "../../../src/engine/index.js";
import { REGISTRY_V2_SCHEMA_VERSION, validateRegistryV2 } from "@velella/ebb/registry";
import type { RegistryV2, RegistryV2Rule } from "@velella/ebb/registry";
import { inBatches } from "../../corpus-harness.js";
import { loadPublicCorpus } from "../../public-corpus.js";
import { parseDependabotConfig } from "./config.js";
import { checkoutDirName, rawFileName, selectRepositories, type Selected } from "../renovate/select.js";
import { RAW_SCHEMA_VERSION, type ConfigEntry, type DependabotTarget, type RawRecord } from "./types.js";

export const RAW_DIR = "benchmarks/comparison/dependabot/raw";
const DIFFERENTIAL_REPORTS = "benchmarks/differential/reports";
const CONFIG_PATHS = [".github/dependabot.yml", ".github/dependabot.yaml"] as const;
const run = promisify(execFile);

interface Options {
  cache: string;
  concurrency: number;
  force: boolean;
  only?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRegistry(value: unknown): value is RegistryV2 {
  return (
    isRecord(value) &&
    value.schemaVersion === REGISTRY_V2_SCHEMA_VERSION &&
    typeof value.ecosystem === "string" &&
    Array.isArray(value.rules)
  );
}

async function evergreenCommit(): Promise<string> {
  return (await run("git", ["rev-parse", "HEAD"])).stdout.trim();
}

function parseOptions(argv: readonly string[]): Options {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]!;
    if (flag === "--force") values.set(flag, "true");
    else if (["--cache", "--concurrency", "--only"].includes(flag) && argv[index + 1]) values.set(flag, argv[++index]!);
    else throw new Error(`Unknown or incomplete flag: ${flag}`);
  }
  return {
    cache: resolve(
      values.get("--cache") ?? process.env.EVERGREEN_CORPUS_CACHE ?? join(homedir(), ".cache/evergreen-corpus"),
    ),
    concurrency: Number(values.get("--concurrency") ?? 16),
    force: values.has("--force"),
    ...(values.has("--only") ? { only: values.get("--only")! } : {}),
  };
}

async function continuityRepositories(): Promise<Set<string>> {
  const names = new Set<string>();
  for (const file of await readdir(DIFFERENTIAL_REPORTS)) {
    if (!file.endsWith(".json")) continue;
    const report = JSON.parse(await readFile(join(DIFFERENTIAL_REPORTS, file), "utf8")) as { repository?: string };
    if (report.repository) names.add(report.repository);
  }
  return names;
}

/** Every committed registry rule, read from `registry/*.json`: the same set the scan uses. */
async function registryRules(root: string): Promise<RegistryV2Rule[]> {
  const rules: RegistryV2Rule[] = [];
  const dir = join(root, "node_modules/@velella/ebb/registry");
  for (const name of (await readdir(dir)).filter((file) => file.endsWith(".json")).sort()) {
    const parsed: unknown = JSON.parse(await readFile(join(dir, name), "utf8"));
    if (!isRegistry(parsed)) continue;
    rules.push(...validateRegistryV2(parsed).rules);
  }
  return rules;
}

interface CommittedConfig {
  configPath?: string;
  entries: ConfigEntry[];
  parseError?: string;
}

async function readConfig(checkout: string): Promise<CommittedConfig> {
  for (const path of CONFIG_PATHS) {
    let text: string;
    try {
      text = await readFile(join(checkout, path), "utf8");
    } catch {
      continue;
    }
    try {
      return { configPath: path, entries: parseDependabotConfig(text) };
    } catch (error) {
      return { configPath: path, entries: [], parseError: error instanceof Error ? error.message : String(error) };
    }
  }
  return { entries: [] };
}

/** The update entry the bridge maps one finding to, or null when it has no Dependabot model. */
function targetOf(checkout: string, finding: Finding, rules: readonly RegistryV2Rule[]): DependabotTarget | null {
  const entries = buildDependabotUpdates(
    { schemaVersion: "evergreen.scan.v1", root: checkout, scannedAt: "", diagnostics: [], findings: [finding] },
    rules,
  );
  const entry = entries[0];
  return entry === undefined ? null : { packageEcosystem: entry.packageEcosystem, directory: entry.directory };
}

async function collectOne(
  options: Options,
  item: Selected,
  evergreen: { version: string; commit: string },
  rules: readonly RegistryV2Rule[],
) {
  const checkout = join(options.cache, checkoutDirName(item.entry));
  const exists = await stat(checkout).then(
    (value) => value.isDirectory(),
    () => false,
  );
  if (!exists)
    throw new Error(`missing checkout ${checkout}; warm the corpus cache with EVERGREEN_CORPUS_CACHE=${options.cache}`);

  const config = await readConfig(checkout);
  const started = performance.now();
  const scan = await scanRepository(checkout, builtInDetectors);
  const durationMs = Math.round(performance.now() - started);

  const record: RawRecord = {
    schemaVersion: RAW_SCHEMA_VERSION,
    repository: item.entry.repository,
    commit: item.entry.commit,
    ecosystem: item.entry.ecosystem,
    selection: item.selection,
    continuity: item.continuity,
    evergreen: {
      ...evergreen,
      durationMs,
      findings: scan.findings.map((finding) => ({
        ruleId: finding.ruleId,
        path: finding.location.path,
        ...(finding.location.line === undefined ? {} : { line: finding.location.line }),
        dependabot: targetOf(checkout, finding, rules),
      })),
    },
    dependabot: {
      run: "not-run",
      ...(config.configPath === undefined ? {} : { configPath: config.configPath }),
      entries: config.entries,
      ...(config.parseError === undefined ? {} : { parseError: config.parseError }),
    },
  };
  await writeFile(join(RAW_DIR, rawFileName(item.entry.repository)), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export async function main(argv: string[]): Promise<number> {
  const options = parseOptions(argv);
  const rules = await registryRules(process.cwd());
  await mkdir(RAW_DIR, { recursive: true });
  const corpus = await loadPublicCorpus();
  const evergreen = {
    version: (JSON.parse(await readFile("package.json", "utf8")) as { version: string }).version,
    commit: await evergreenCommit(),
  };
  let selected = selectRepositories(corpus.repositories, await continuityRepositories());
  if (options.only) selected = selected.filter((item) => item.entry.repository === options.only);
  const done = new Set(await readdir(RAW_DIR));
  const todo = options.force ? selected : selected.filter((item) => !done.has(rawFileName(item.entry.repository)));
  process.stdout.write(`${selected.length} selected, ${todo.length} to collect, concurrency ${options.concurrency}\n`);

  let finished = 0;
  await inBatches(todo, options.concurrency, async (item) => {
    const record = await collectOne(options, item, evergreen, rules);
    const declaredEntries = record.dependabot.entries.length;
    process.stdout.write(
      `[${++finished}/${todo.length}] ${item.entry.repository} findings=${record.evergreen.findings.length} entries=${declaredEntries}\n`,
    );
  });
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}

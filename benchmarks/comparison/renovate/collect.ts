// Maintainer action: runs Renovate and Evergreen on the pinned corpus checkouts and records one raw file each.
// It needs the network (Renovate looks registries up) and a Renovate install, so it is not part of `npm run check`.
//
//   export EVERGREEN_CORPUS_CACHE=~/.cache/evergreen-corpus && npm run corpus:warm
//   export RENOVATE_TOKEN=<read-only token> GITHUB_COM_TOKEN=<read-only token>
//   node dist/benchmarks/comparison/renovate/collect.js --renovate <renovate/dist/renovate.js> [--node <node 24>]
//
// Repositories are only read. Renovate runs with --dry-run=lookup and the local platform; nothing is written to them.

import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { builtInDetectors } from "../../../src/detectors/index.js";
import { scanRepository } from "../../../src/engine/index.js";
import { inBatches } from "../../corpus-harness.js";
import { renovateDependencies } from "../../differential/renovate.js";
import { loadPublicCorpus } from "../../public-corpus.js";
import { rawFileName, selectRepositories, checkoutDirName, type Selected } from "./select.js";
import { RAW_SCHEMA_VERSION, type RawRecord, type RenovateStatus } from "./types.js";

export const RAW_DIR = "benchmarks/comparison/renovate/raw";
const DIFFERENTIAL_REPORTS = "benchmarks/differential/reports";
const RENOVATE_TIMEOUT_MS = 10 * 60 * 1000;
const run = promisify(execFile);

interface Options {
  renovate: string;
  node: string;
  cache: string;
  concurrency: number;
  force: boolean;
  only?: string;
}

function parseOptions(argv: readonly string[]): Options {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]!;
    if (flag === "--force") values.set(flag, "true");
    else if (["--renovate", "--node", "--cache", "--concurrency", "--only"].includes(flag) && argv[index + 1])
      values.set(flag, argv[++index]!);
    else throw new Error(`Unknown or incomplete flag: ${flag}`);
  }
  const renovate = values.get("--renovate");
  if (!renovate) throw new Error("--renovate <path to renovate/dist/renovate.js> is required.");
  return {
    renovate: resolve(renovate),
    node: values.get("--node") ?? process.execPath,
    cache: resolve(
      values.get("--cache") ?? process.env.EVERGREEN_CORPUS_CACHE ?? join(homedir(), ".cache/evergreen-corpus"),
    ),
    concurrency: Number(values.get("--concurrency") ?? 4),
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

async function renovateVersion(renovate: string): Promise<string> {
  const manifest = JSON.parse(await readFile(join(dirname(renovate), "..", "package.json"), "utf8")) as {
    version?: string;
  };
  return manifest.version ?? "unknown";
}

interface RenovateRun {
  status: RenovateStatus;
  detail?: string;
  durationMs: number;
  reportPath: string;
}

function runRenovate(options: Options, checkout: string, work: string): Promise<RenovateRun> {
  const reportPath = join(work, "renovate.json");
  const started = performance.now();
  return new Promise((resolveRun) => {
    const child = spawn(
      options.node,
      [options.renovate, "--platform=local", "--dry-run=lookup", "--report-type=file", `--report-path=${reportPath}`],
      { cwd: checkout, env: { ...process.env, RENOVATE_BASE_DIR: work }, stdio: "ignore" },
    );
    const timer = setTimeout(() => child.kill("SIGKILL"), RENOVATE_TIMEOUT_MS);
    const finish = (status: RenovateStatus, detail?: string) => {
      clearTimeout(timer);
      resolveRun({
        status,
        ...(detail === undefined ? {} : { detail }),
        durationMs: Math.round(performance.now() - started),
        reportPath,
      });
    };
    child.on("error", (error) => finish("failed", error.message));
    child.on("close", (code, signal) => {
      if (signal === "SIGKILL") finish("timeout", "killed after 10 minutes");
      else if (code === 0) finish("ok");
      else finish("failed", `exit ${code ?? signal}`);
    });
  });
}

async function evergreenCommit(): Promise<string> {
  return (await run("git", ["rev-parse", "HEAD"])).stdout.trim();
}

async function collectOne(options: Options, item: Selected, evergreen: { version: string; commit: string }) {
  const checkout = join(options.cache, checkoutDirName(item.entry));
  const work = await mkdtemp(join(tmpdir(), "renovate-comparison-"));
  try {
    const scanStarted = performance.now();
    const scan = await scanRepository(checkout, builtInDetectors);
    const scanMs = Math.round(performance.now() - scanStarted);
    const renovate = await runRenovate(options, checkout, work);
    let dependencies: RawRecord["renovate"]["dependencies"] = [];
    if (renovate.status === "ok") {
      dependencies = renovateDependencies(JSON.parse(await readFile(renovate.reportPath, "utf8")));
    }
    const record: RawRecord = {
      schemaVersion: RAW_SCHEMA_VERSION,
      repository: item.entry.repository,
      commit: item.entry.commit,
      ecosystem: item.entry.ecosystem,
      selection: item.selection,
      continuity: item.continuity,
      concurrency: options.concurrency,
      evergreen: {
        ...evergreen,
        durationMs: scanMs,
        findings: scan.findings.map((finding) => ({
          ruleId: finding.ruleId,
          path: finding.location.path,
          ...(finding.location.line === undefined ? {} : { line: finding.location.line }),
        })),
      },
      renovate: {
        version: await renovateVersion(options.renovate),
        durationMs: renovate.durationMs,
        status: renovate.status,
        ...(renovate.detail === undefined ? {} : { detail: renovate.detail }),
        dependencies,
      },
    };
    await writeFile(join(RAW_DIR, rawFileName(item.entry.repository)), `${JSON.stringify(record, null, 2)}\n`);
    return record.renovate.status;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export async function main(argv: string[]): Promise<number> {
  const options = parseOptions(argv);
  if (!process.env.RENOVATE_TOKEN || !process.env.GITHUB_COM_TOKEN)
    throw new Error(
      "Set RENOVATE_TOKEN and GITHUB_COM_TOKEN to a read-only token (docs/COMPARISON_METHOD.md, section 6).",
    );
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
  const failures: string[] = [];
  await inBatches(todo, options.concurrency, async (item) => {
    const status = await collectOne(options, item, evergreen);
    if (status !== "ok") failures.push(`${item.entry.repository} (${status})`);
    process.stdout.write(`[${++finished}/${todo.length}] ${item.entry.repository} renovate=${status}\n`);
  });
  if (failures.length > 0) process.stdout.write(`Renovate did not finish: ${failures.join(", ")}\n`);
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

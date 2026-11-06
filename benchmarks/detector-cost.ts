import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine/index.js";
import { restoreFixtureNames } from "../src/fixture-names.js";
import type { Detector } from "../src/sdk.js";
import { countFiles } from "./monorepo.js";

/**
 * Per-detector scan cost on the committed fixture corpus (`tests/fixtures`, every ecosystem side by side).
 *
 * Each detector runs alone over the same tree with caches off, so the numbers compare ecosystems like for like:
 * wall time per file in the tree, plus the heap the scan grew by. The corpus is offline and deterministic. A
 * detector that finds nothing is flagged, because a fast scan of nothing measures no work.
 */
export interface DetectorCost {
  readonly detector: string;
  readonly medianWallMs: number;
  /** Median wall time divided by the files in the tree, in microseconds. */
  readonly microsecondsPerFile: number;
  /** Largest heap growth over the measured runs, in bytes (a scan that frees memory reports 0). */
  readonly heapGrowthBytes: number;
  readonly findings: number;
}

export interface DetectorCostReport {
  readonly schemaVersion: "evergreen.detector-cost.v1";
  readonly corpus: string;
  readonly files: number;
  readonly runs: number;
  readonly platform: NodeJS.Platform;
  readonly nodeVersion: string;
  readonly detectors: readonly DetectorCost[];
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0);
}

/** Copies the corpus to a clean temporary directory so scans never touch the checkout. */
export async function createCorpusCopy(corpus = resolve("tests/fixtures")): Promise<{
  directory: string;
  cleanup: () => Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-detector-cost-"));
  await cp(corpus, directory, { recursive: true });
  await restoreFixtureNames(directory);
  return { directory, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

export interface DetectorCostOptions {
  readonly corpus?: string | undefined;
  readonly detectors?: readonly Detector[] | undefined;
  readonly runs?: number | undefined;
}

export async function measureDetectorCosts(options: DetectorCostOptions = {}): Promise<DetectorCostReport> {
  const detectors = options.detectors ?? builtInDetectors;
  const runs = options.runs ?? 3;
  const corpus = await createCorpusCopy(options.corpus);
  try {
    const files = await countFiles(corpus.directory);
    const costs: DetectorCost[] = [];
    for (const detector of detectors) {
      await scanRepository(corpus.directory, [detector], { noCache: true }); // warm-up: module and parser start-up
      const walls: number[] = [];
      let heapGrowthBytes = 0;
      let findings = 0;
      for (let index = 0; index < runs; index += 1) {
        const heapBefore = process.memoryUsage().heapUsed;
        const startedAt = performance.now();
        const result = await scanRepository(corpus.directory, [detector], { noCache: true });
        walls.push(performance.now() - startedAt);
        heapGrowthBytes = Math.max(heapGrowthBytes, process.memoryUsage().heapUsed - heapBefore);
        findings = result.findings.length;
      }
      const medianWallMs = median(walls);
      costs.push({
        detector: detector.id,
        medianWallMs,
        microsecondsPerFile: files === 0 ? 0 : (medianWallMs * 1000) / files,
        heapGrowthBytes,
        findings,
      });
    }
    return {
      schemaVersion: "evergreen.detector-cost.v1",
      corpus: "tests/fixtures",
      files,
      runs,
      platform: process.platform,
      nodeVersion: process.version,
      detectors: costs.sort((a, b) => b.microsecondsPerFile - a.microsecondsPerFile),
    };
  } finally {
    await corpus.cleanup();
  }
}

export function formatDetectorCosts(report: DetectorCostReport): string {
  const lines = [
    `Per-detector scan cost over ${report.files} files (${report.corpus}, median of ${report.runs} runs):`,
    "| detector | ms | µs/file | heap growth (MB) | findings |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];
  for (const cost of report.detectors) {
    lines.push(
      `| ${cost.detector} | ${cost.medianWallMs.toFixed(0)} | ${cost.microsecondsPerFile.toFixed(0)} | ${(
        cost.heapGrowthBytes / 1024 / 1024
      ).toFixed(1)} | ${cost.findings} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Detectors whose corpus scan found nothing: their timing covers no real work. */
export function idleDetectors(report: DetectorCostReport): string[] {
  return report.detectors.filter((cost) => cost.findings === 0).map((cost) => cost.detector);
}

async function main(argv: readonly string[]): Promise<number> {
  const flag = argv.indexOf("--runs");
  const report = await measureDetectorCosts({ runs: flag === -1 ? undefined : Number(argv[flag + 1]) });
  process.stdout.write(argv.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : formatDetectorCosts(report));
  const idle = idleDetectors(report);
  if (idle.length > 0)
    process.stderr.write(`No findings on the corpus (timing covers no real work): ${idle.join(", ")}\n`);
  return argv.includes("--check") && idle.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}

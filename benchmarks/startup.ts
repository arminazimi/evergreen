import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * The CLI start-up budget, enforced by the `perf-budget` CI job: `evergreen --version` must answer without loading the
 * command table. The ceiling carries about an order of magnitude over the development-machine median (see
 * docs/BENCHMARKS.md), so only a regression that pulls the whole CLI back onto this path trips it, not runner noise.
 */
export const STARTUP_BUDGET = { maxMedianWallMs: 400 } as const;

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0);
}

export function evaluateStartup(medianWallMs: number, budget: { maxMedianWallMs: number } = STARTUP_BUDGET): string[] {
  return medianWallMs > budget.maxMedianWallMs
    ? [`startup median ${medianWallMs.toFixed(0)} ms exceeded the ${budget.maxMedianWallMs} ms budget`]
    : [];
}

function measure(cli: string, runs: number): number[] {
  const samples: number[] = [];
  for (let index = 0; index < runs + 1; index += 1) {
    const started = performance.now();
    const result = spawnSync(process.execPath, [cli, "--version"], { encoding: "utf8" });
    const elapsed = performance.now() - started;
    if (result.status !== 0) throw new Error(`evergreen --version exited ${result.status}: ${result.stderr}`);
    if (index > 0) samples.push(elapsed); // the first run warms the disk cache and is discarded
  }
  return samples;
}

function main(argv: readonly string[]): number {
  const flag = argv.indexOf("--runs");
  const runs = flag === -1 ? 7 : Number(argv[flag + 1]);
  const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.js");
  const medianMs = median(measure(cli, runs));
  const violations = evaluateStartup(medianMs);
  process.stdout.write(
    `evergreen --version: median ${medianMs.toFixed(0)} ms over ${runs} runs (budget ${STARTUP_BUDGET.maxMedianWallMs} ms)\n`,
  );
  for (const violation of violations) process.stderr.write(`${violation}\n`);
  return argv.includes("--check") && violations.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main(process.argv.slice(2));

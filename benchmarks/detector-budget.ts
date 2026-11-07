import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { builtInDetectors } from "../src/detectors/index.js";
import type { Detector } from "../src/sdk.js";
import { measureDetectorCosts, type DetectorCost } from "./detector-cost.js";

/**
 * The per-detector scan performance budget, enforced by the `perf-budget` CI job.
 *
 * Each detector scans the committed fixture corpus (`tests/fixtures`) alone with caches off. Its median wall time
 * must stay under the ceiling in `benchmarks/detector-budgets.json`. Ceilings are about eight times the median
 * measured over repeated local runs, with a 750 ms floor, so runner noise does not trip the gate. A detector that
 * exceeds its ceiling is measured again (`retries` times) and only fails when its best median is still over: a
 * noisy neighbour slows one measurement, a slow change slows all of them.
 */
export interface DetectorBudgets {
  readonly schemaVersion: "evergreen.detector-budgets.v1";
  readonly corpus: string;
  /** Scans measured per detector; the median is compared with the ceiling. */
  readonly runs: number;
  /** Extra measurements of a detector that is over its ceiling, before it fails. */
  readonly retries: number;
  /** Ceiling on each detector's median wall time over the corpus, by detector id. */
  readonly maxMedianWallMs: Readonly<Record<string, number>>;
}

export interface DetectorBudgetResult {
  readonly schemaVersion: "evergreen.detector-budget-result.v1";
  readonly platform: NodeJS.Platform;
  readonly nodeVersion: string;
  readonly files: number;
  readonly measured: readonly (DetectorCost & {
    readonly budgetMs: number | undefined;
  })[];
  readonly violations: readonly string[];
  readonly withinBudget: boolean;
}

export const DETECTOR_BUDGETS_PATH = "benchmarks/detector-budgets.json";

export async function loadDetectorBudgets(path = resolve(DETECTOR_BUDGETS_PATH)): Promise<DetectorBudgets> {
  return JSON.parse(await readFile(path, "utf8")) as DetectorBudgets;
}

/**
 * Pure gate: one violation per detector over its ceiling, naming the detector, plus one per built-in detector that
 * has no ceiling (so a new detector cannot ship unbudgeted) and one per ceiling with no detector (stale entry).
 */
export function evaluateDetectorBudgets(
  costs: readonly Pick<DetectorCost, "detector" | "medianWallMs">[],
  budgets: DetectorBudgets,
): string[] {
  const violations: string[] = [];
  const known = new Set<string>();
  for (const cost of costs) {
    known.add(cost.detector);
    const ceiling = budgets.maxMedianWallMs[cost.detector];
    if (ceiling === undefined) {
      violations.push(`detector ${cost.detector} has no budget in ${DETECTOR_BUDGETS_PATH}`);
    } else if (cost.medianWallMs > ceiling) {
      violations.push(
        `detector ${cost.detector}: median scan time ${cost.medianWallMs.toFixed(0)} ms exceeded the ${ceiling} ms budget`,
      );
    }
  }
  for (const id of Object.keys(budgets.maxMedianWallMs)) {
    if (!known.has(id)) violations.push(`${DETECTOR_BUDGETS_PATH} budgets ${id}, which is not a built-in detector`);
  }
  return violations;
}

export interface DetectorBudgetOptions {
  readonly detectors?: readonly Detector[] | undefined;
  readonly budgets?: DetectorBudgets | undefined;
  /** Artificial delay added to the named detector's scan, to prove the gate trips. */
  readonly simulatedSlowdown?: { readonly detector: string; readonly ms: number } | undefined;
}

function slowedDown(detector: Detector, slowdown: DetectorBudgetOptions["simulatedSlowdown"]): Detector {
  if (slowdown === undefined || slowdown.detector !== detector.id) return detector;
  return {
    ...detector,
    scan: async (context) => {
      await delay(slowdown.ms);
      return detector.scan(context);
    },
  };
}

export async function runDetectorBudget(options: DetectorBudgetOptions = {}): Promise<DetectorBudgetResult> {
  const budgets = options.budgets ?? (await loadDetectorBudgets());
  const detectors = (options.detectors ?? builtInDetectors).map((detector) =>
    slowedDown(detector, options.simulatedSlowdown),
  );
  const first = await measureDetectorCosts({ detectors, runs: budgets.runs });
  const best = new Map(first.detectors.map((cost) => [cost.detector, cost]));
  for (let attempt = 0; attempt < budgets.retries; attempt += 1) {
    const slow = detectors.filter((detector) => {
      const ceiling = budgets.maxMedianWallMs[detector.id];
      return ceiling !== undefined && (best.get(detector.id)?.medianWallMs ?? 0) > ceiling;
    });
    if (slow.length === 0) break;
    const again = await measureDetectorCosts({
      detectors: slow,
      runs: budgets.runs,
    });
    for (const cost of again.detectors) {
      const previous = best.get(cost.detector);
      if (previous === undefined || cost.medianWallMs < previous.medianWallMs) best.set(cost.detector, cost);
    }
  }
  const costs = [...best.values()];
  const violations = evaluateDetectorBudgets(costs, budgets);
  return {
    schemaVersion: "evergreen.detector-budget-result.v1",
    platform: process.platform,
    nodeVersion: process.version,
    files: first.files,
    measured: costs
      .map((cost) => ({
        ...cost,
        budgetMs: budgets.maxMedianWallMs[cost.detector],
      }))
      .sort((a, b) => a.detector.localeCompare(b.detector)),
    violations,
    withinBudget: violations.length === 0,
  };
}

export function formatDetectorBudgetSummary(result: DetectorBudgetResult): string {
  const lines = [
    `Per-detector scan budget over ${result.files} files (${result.withinBudget ? "PASSED" : "FAILED"}):`,
    "| detector | median ms | budget ms |",
    "| --- | ---: | ---: |",
  ];
  for (const cost of result.measured) {
    lines.push(`| ${cost.detector} | ${cost.medianWallMs.toFixed(0)} | ${cost.budgetMs ?? "none"} |`);
  }
  return `${lines.join("\n")}\n`;
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const flag = argv.indexOf("--simulate-slowdown");
  const spec = flag === -1 ? undefined : argv[flag + 1];
  const [detector, ms] = spec?.split(":") ?? [];
  if (flag !== -1 && (!detector || !Number.isFinite(Number(ms)))) {
    throw new Error("--simulate-slowdown expects <detector>:<milliseconds>");
  }
  const result = await runDetectorBudget({
    simulatedSlowdown: detector ? { detector, ms: Number(ms) } : undefined,
  });
  process.stdout.write(
    argv.includes("--json") ? `${JSON.stringify(result, null, 2)}\n` : formatDetectorBudgetSummary(result),
  );
  if (argv.includes("--check") && !result.withinBudget) {
    for (const violation of result.violations) console.error(`::error::${violation}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runCli();
}

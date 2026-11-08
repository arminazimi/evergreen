import { resolve } from "node:path";

import { evaluateBaseline, expiredSuppressionsFail, readBaseline } from "./baseline.js";
import type { ExpiredPolicy } from "./baseline.js";
import type { ScanResult } from "./domain.js";
import type { ScanOptions } from "./engine/index.js";
import { applyMinSupport } from "@velella/ebb/min-support";
import { scanWithBuiltIns } from "./scan-builtins.js";

/** One scan as an interface asks for it: the repository and the policies applied to what the engine finds. */
export interface ScanRequest {
  root: string;
  /** A baseline file, relative to `root`, whose suppressions are applied. */
  baselinePath?: string;
  /** The reference day (YYYY-MM-DD) for baseline expiry and minimum support. Defaults to today in UTC. */
  today?: string;
  baselineWarnDays?: number;
  onExpired?: ExpiredPolicy;
  /** Warn on lines whose support ends within this many days. */
  minSupportDays?: number;
  engine?: ScanOptions;
}

export interface ScanRequestOutcome {
  result: ScanResult;
  /** True when `onExpired` is `fail` and a suppression has expired. */
  expiredFailure: boolean;
}

/**
 * The one place a request becomes findings: scan with the built-in detectors, then apply minimum support and the
 * baseline in that order. The CLI, MCP server, language server, and GitHub Action all call this, so the same
 * request returns the same findings through each. Adapters only translate their input into a request and the
 * outcome into their output.
 */
export async function runScanRequest(request: ScanRequest): Promise<ScanRequestOutcome> {
  let result = await scanWithBuiltIns(request.root, request.engine);
  const today = request.today ?? new Date().toISOString().slice(0, 10);
  if (request.minSupportDays !== undefined) result = applyMinSupport(result, request.minSupportDays, today);
  if (!request.baselinePath) return { result, expiredFailure: false };
  const evaluated = evaluateBaseline(result, await readBaseline(resolve(request.root, request.baselinePath)), {
    today,
    ...(request.baselineWarnDays === undefined ? {} : { warnWithinDays: request.baselineWarnDays }),
    ...(request.onExpired === undefined ? {} : { onExpired: request.onExpired }),
  });
  return {
    result: evaluated.result,
    expiredFailure: expiredSuppressionsFail(request.onExpired, evaluated.expired),
  };
}

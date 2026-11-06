import { builtInDetectors } from "./detectors/index.js";
import { diffRefs } from "./diff.js";
import type { DiffResult } from "./diff.js";
import type { ScanResult } from "./domain.js";
import { scanRepository } from "./engine/index.js";
import type { ScanOptions } from "./engine/index.js";

/** Scans with the built-in detectors so adapters never import the detectors package. */
export function scanWithBuiltIns(root: string, options?: ScanOptions): Promise<ScanResult> {
  return scanRepository(root, builtInDetectors, options);
}

/** Diffs two refs with the built-in detectors so adapters never import the detectors package. */
export function diffWithBuiltIns(root: string, range: string): Promise<DiffResult> {
  return diffRefs(root, range, builtInDetectors);
}

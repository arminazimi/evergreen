// One threshold per detector, in `benchmarks/thresholds/<detector>.json`. The assembled document
// that every consumer reads is `benchmarks/thresholds.json`; regenerate it after adding or editing
// a detector with `node dist/benchmarks/thresholds/index.js`. A new detector is one new file, so two
// additions in parallel never edit the same item.
//
// `budget` and `lastFullRun` are not per-detector configuration: they are the run record that
// `npm run record:corpus-run` rewrites in the document, so the assembler carries them over.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { DetectorThreshold, Thresholds } from "../thresholds.js";

export const THRESHOLDS_DIRECTORY = "benchmarks/thresholds";
export const THRESHOLDS_DOCUMENT = "benchmarks/thresholds.json";

/**
 * A per-detector file: the threshold fields plus an optional position that keeps the assembled
 * document's order stable. The position is registry metadata and is never written to the document.
 */
interface ThresholdFile extends DetectorThreshold {
  order?: number;
}

/** One threshold per detector, in document order: each file's `order`, then its id. */
export function loadDetectorThresholds(directory = THRESHOLDS_DIRECTORY): Record<string, DetectorThreshold> {
  const entries: Array<{ id: string; order: number; threshold: DetectorThreshold }> = [];
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    const id = file.slice(0, -".json".length);
    const { order, ...threshold } = JSON.parse(readFileSync(resolve(directory, file), "utf8")) as ThresholdFile;
    entries.push({ id, order: order ?? Number.MAX_SAFE_INTEGER, threshold });
  }
  // `order` keeps the committed document's order, including the detectors that were appended out of
  // alphabetical order. A file without it lands at the end; ties break by id, so parallel additions
  // stay stable whatever order the directory lists them in.
  entries.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const detectors: Record<string, DetectorThreshold> = {};
  for (const { id, threshold } of entries) {
    detectors[id] = { level: threshold.level, stable: threshold.stable, minPrecision: threshold.minPrecision };
  }
  return detectors;
}

/** The thresholds document with `detectors` assembled from the per-item files. */
export function assembleThresholds(directory = THRESHOLDS_DIRECTORY, document = THRESHOLDS_DOCUMENT): Thresholds {
  const current = JSON.parse(readFileSync(document, "utf8")) as Thresholds;
  return {
    schemaVersion: current.schemaVersion,
    ...(current.budget === undefined ? {} : { budget: current.budget }),
    detectors: loadDetectorThresholds(directory),
    ...(current.lastFullRun === undefined ? {} : { lastFullRun: current.lastFullRun }),
  };
}

/** The assembled document as committed: two-space JSON with a trailing newline. */
export function assembleThresholdsText(directory = THRESHOLDS_DIRECTORY, document = THRESHOLDS_DOCUMENT): string {
  return `${JSON.stringify(assembleThresholds(directory, document), null, 2)}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const files = readdirSync(THRESHOLDS_DIRECTORY).filter((name) => name.endsWith(".json"));
  writeFileSync(THRESHOLDS_DOCUMENT, assembleThresholdsText());
  console.log(`Wrote ${THRESHOLDS_DOCUMENT} from ${files.length} detector files.`);
}

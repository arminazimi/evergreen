import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Finding } from "../src/domain.js";
import { computeFileHash } from "../src/scan-cache.js";
import { DETECTOR_API_VERSION } from "../src/sdk.js";
import type { Detector, DetectorFinding } from "../src/sdk.js";

const scratchRoots: string[] = [];

/** Creates a scratch directory that `cleanupScratch` removes after a test file finishes. */
export async function scratch(name: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `evergreen-engine-${name}-`));
  scratchRoots.push(directory);
  return directory;
}

/** Removes every scratch directory a test file created. */
export async function cleanupScratch(): Promise<void> {
  await Promise.all(scratchRoots.map((directory) => rm(directory, { recursive: true, force: true })));
}

export type DetectorOptions = {
  inputs?: Detector["inputs"];
  scan?: Detector["scan"];
  analyze?: Detector["analyze"];
  version?: string;
};

export function detectorOf(id: string, options: DetectorOptions = {}): Detector & { version?: string } {
  return {
    apiVersion: DETECTOR_API_VERSION,
    id,
    scan: options.scan ?? (async () => []),
    ...(options.inputs ? { inputs: options.inputs } : {}),
    ...(options.analyze ? { analyze: options.analyze } : {}),
    ...(options.version ? { version: options.version } : {}),
  };
}

export function detectorFinding(path: string, overrides: Partial<DetectorFinding> = {}): DetectorFinding {
  return {
    id: `fixture:${path}`,
    ruleId: "fixture.rule",
    title: "Title",
    summary: "Summary",
    severity: "low",
    location: { path },
    sources: [{ title: "Source", url: "https://example.com/source" }],
    ...overrides,
  };
}

export function findingOf(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "npm:one",
    ruleId: "npm.package.eol",
    detector: "npm",
    title: "Title",
    summary: "Summary",
    severity: "low",
    confidence: "exact",
    location: { path: "package.json" },
    sources: [{ title: "Source", url: "https://example.com/source" }],
    ...overrides,
  };
}

/** The detector version the engine derives from a detector's declared version and code. */
export function detectorVersionOf(detector: Detector & { version?: string }): string {
  return `${detector.version ?? detector.apiVersion}:${computeFileHash(
    detector.scan.toString() + (detector.analyze ? detector.analyze.toString() : ""),
  )}`;
}

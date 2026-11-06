// Stage 2 — detect: run each detector, consulting the scan cache so unchanged files are not parsed
// again, and attribute every finding to the detector that produced it.

import { join, resolve } from "node:path";
import { basename } from "node:path/posix";

import { declaresInput } from "../detector-inputs.js";
import type { Confidence, Finding, UnclassifiedReference } from "../domain.js";
import type { ScanFileSystem } from "../file-system.js";
import { computeFileHash } from "../scan-cache.js";
import type { DetectorFileDescriptor, DetectorManifest, ScanCache } from "../scan-cache.js";
import { assertDetectorCompatible } from "../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding } from "../sdk.js";
import { isSkippedScanDirectory, trimTrailingSlashes } from "./discover.js";

/** Lockfiles whose entries are resolved versions rather than declarations. */
const LOCKFILE_NAME =
  /(^|[-.])(lock|lockfile)(\.[a-z]+)?$|\.lock$|^(go\.sum|pubspec\.lock|packages\.lock\.json|gemfile\.lock|composer\.lock|cargo\.lock|poetry\.lock|uv\.lock|pipfile\.lock|npm-shrinkwrap\.json)$/i;

/**
 * Detectors whose findings depend on the relationship between multiple files (for example,
 * a package manifest and a lockfile, workspace manifests, or source usage across files).
 * These detectors cannot evaluate a changed file in isolation, so they invalidate and re-run
 * at the manifest level whenever any input file changes.
 */
export const CROSS_FILE_DETECTORS = new Set([
  "npm",
  "python",
  "go",
  "rust",
  "java",
  "dotnet",
  "php",
  "ruby",
  "swift",
  "dart",
  "scala",
  "elixir",
  "android",
  "cpp",
  "database",
]);

/**
 * Checks whether caching should be disabled for a detector.
 * A detector that omits `inputs` makes no promise about which files it reads, and a detector
 * that reads skipped directory trees (such as CLE reading `node_modules`) cannot be safely keyed
 * by normal repository file traversal without risking stale results.
 */
export function shouldDisableCacheForDetector(detector: Detector): boolean {
  if (!detector.inputs) return true;
  const dirs = detector.inputs.directories;
  if (dirs && dirs.some((d) => isSkippedScanDirectory(trimTrailingSlashes(d)))) {
    return true;
  }
  return false;
}

/** What a finding is worth when its detector did not say: a lockfile entry is inferred-from-lock, any other read is exact. */
export function defaultConfidence(finding: DetectorFinding): Confidence {
  return finding.confidence ?? (LOCKFILE_NAME.test(basename(finding.location.path)) ? "inferred-from-lock" : "exact");
}

/** A detector's output after the engine has attributed it to that detector. */
export interface DetectorResult {
  findings: Finding[];
  unclassified: UnclassifiedReference[];
}

/** The hash of a detector's code, so a code change invalidates its cached results. */
export function detectorCode(detector: Detector): string {
  return computeFileHash(detector.scan.toString() + (detector.analyze ? detector.analyze.toString() : ""));
}

/** The version the engine records for a detector: its declared version and a hash of its code. */
export function detectorVersion(detector: Detector): string {
  const version =
    "version" in detector && typeof detector.version === "string" ? detector.version : detector.apiVersion;
  return `${version}:${detectorCode(detector)}`;
}

/** Everything a detection pass needs beyond the detector list. */
export interface DetectOptions {
  readonly context: DetectorContext;
  readonly root: string;
  readonly repoFiles: readonly string[];
  readonly cache: ScanCache;
  readonly fileSystem: ScanFileSystem;
  readonly dataVersion: string;
  readonly noCache: boolean;
  readonly getFileHash: (relPath: string) => Promise<string>;
}

/** Runs every detector; results come back in the order the detectors were given. */
export async function detectAll(detectors: readonly Detector[], options: DetectOptions): Promise<DetectorResult[]> {
  return Promise.all(detectors.map(async (detector) => detectOne(detector, options)));
}

async function detectOne(detector: Detector, options: DetectOptions): Promise<DetectorResult> {
  assertDetectorCompatible(detector);
  if (options.noCache || shouldDisableCacheForDetector(detector)) {
    return analyzeDetector(detector, options.context);
  }
  const files = inputFiles(detector, options.repoFiles);
  if (detector.inputs !== undefined && files.length === 0) return { findings: [], unclassified: [] };
  const descriptors = await describeFiles(files, options.getFileHash);
  const version = detectorVersion(detector);
  const manifest = await options.cache.getDetectorManifest(options.root, detector.id, version, options.dataVersion);
  if (manifest !== undefined && manifestMatches(manifest, descriptors)) {
    return { findings: [...manifest.findings], unclassified: [...manifest.unclassified] };
  }
  return CROSS_FILE_DETECTORS.has(detector.id)
    ? detectAcrossFiles(detector, options, descriptors, version)
    : detectPerFile(detector, options, descriptors, version);
}

/** The detector's input files, sorted so cache keys stay deterministic. */
function inputFiles(detector: Detector, repoFiles: readonly string[]): string[] {
  const inputs = detector.inputs;
  const relevant = inputs === undefined ? repoFiles : repoFiles.filter((path) => declaresInput(inputs, path));
  return [...relevant].sort((left, right) => left.localeCompare(right));
}

async function describeFiles(
  files: readonly string[],
  getFileHash: (relPath: string) => Promise<string>,
): Promise<DetectorFileDescriptor[]> {
  return Promise.all(files.map(async (path) => ({ path, hash: await getFileHash(path) })));
}

function manifestMatches(manifest: DetectorManifest, descriptors: readonly DetectorFileDescriptor[]): boolean {
  return (
    manifest.files.length === descriptors.length &&
    manifest.files.every((file, index) => {
      const current = descriptors[index];
      return current !== undefined && file.path === current.path && file.hash === current.hash;
    })
  );
}

/** Runs a detector (analyze when present, scan otherwise) and attributes its output to it. */
async function analyzeDetector(detector: Detector, context: DetectorContext): Promise<DetectorResult> {
  const analysis = detector.analyze
    ? await detector.analyze(context)
    : { findings: await detector.scan(context), unclassified: [] };
  return attribute(detector, analysis);
}

function attribute(detector: Detector, analysis: DetectorAnalysis): DetectorResult {
  return {
    findings: analysis.findings.map((finding) => ({
      ...finding,
      detector: detector.id,
      confidence: defaultConfidence(finding),
    })),
    unclassified: analysis.unclassified.map((reference) => ({
      ...reference,
      detector: detector.id,
    })),
  };
}

async function detectAcrossFiles(
  detector: Detector,
  options: DetectOptions,
  descriptors: readonly DetectorFileDescriptor[],
  version: string,
): Promise<DetectorResult> {
  const result = await analyzeDetector(detector, options.context);
  await cacheFiles(detector, options, version, descriptors, result);
  await options.cache.setDetectorManifest(options.root, {
    detectorId: detector.id,
    detectorVersion: version,
    dataVersion: options.dataVersion,
    files: [...descriptors],
    findings: result.findings,
    unclassified: result.unclassified,
  });
  return result;
}

/** File-isolated detectors reuse per-file cache entries and re-parse only the files that changed. */
async function detectPerFile(
  detector: Detector,
  options: DetectOptions,
  descriptors: readonly DetectorFileDescriptor[],
  version: string,
): Promise<DetectorResult> {
  const { cached, changed } = await readCachedFiles(detector, options, version, descriptors);
  if (changed.length === 0) return cached;
  const fresh =
    changed.length === descriptors.length
      ? await analyzeDetector(detector, options.context)
      : await analyzeSubset(detector, options, changed);
  await cacheFiles(detector, options, version, changed, fresh);
  const result = mergeResults(cached, fresh);
  await options.cache.setDetectorManifest(options.root, {
    detectorId: detector.id,
    detectorVersion: version,
    dataVersion: options.dataVersion,
    files: [...descriptors],
    findings: result.findings,
    unclassified: result.unclassified,
  });
  return result;
}

async function readCachedFiles(
  detector: Detector,
  options: DetectOptions,
  version: string,
  descriptors: readonly DetectorFileDescriptor[],
): Promise<{ cached: DetectorResult; changed: DetectorFileDescriptor[] }> {
  const entries = await Promise.all(
    descriptors.map(async (descriptor) => ({
      descriptor,
      entry: await options.cache.get({
        filePath: descriptor.path,
        fileHash: descriptor.hash,
        detectorId: detector.id,
        detectorVersion: version,
        dataVersion: options.dataVersion,
      }),
    })),
  );
  const cached: DetectorResult = { findings: [], unclassified: [] };
  const changed: DetectorFileDescriptor[] = [];
  for (const { descriptor, entry } of entries) {
    if (!entry) {
      changed.push(descriptor);
      continue;
    }
    cached.findings.push(...entry.findings);
    cached.unclassified.push(...entry.unclassified);
  }
  return { cached, changed };
}

/** Copies only the changed files to a temporary root and re-parses the detector there. */
async function analyzeSubset(
  detector: Detector,
  options: DetectOptions,
  changed: readonly DetectorFileDescriptor[],
): Promise<DetectorResult> {
  const tempRoot = await options.fileSystem.makeTemporaryDirectory("evergreen-scan-");
  try {
    for (const descriptor of changed) {
      await options.fileSystem.copy(resolve(options.root, descriptor.path), join(tempRoot, descriptor.path));
    }
    const scannedAt = options.context.scannedAt;
    return await analyzeDetector(
      detector,
      scannedAt === undefined ? { root: tempRoot } : { root: tempRoot, scannedAt },
    );
  } finally {
    await options.fileSystem.remove(tempRoot).catch(() => undefined);
  }
}

/** Stores one cache entry per file, holding only the findings that point into that file. */
async function cacheFiles(
  detector: Detector,
  options: DetectOptions,
  version: string,
  descriptors: readonly DetectorFileDescriptor[],
  result: DetectorResult,
): Promise<void> {
  for (const descriptor of descriptors) {
    await options.cache.set({
      filePath: descriptor.path,
      fileHash: descriptor.hash,
      detectorId: detector.id,
      detectorVersion: version,
      dataVersion: options.dataVersion,
      findings: result.findings.filter((finding) => finding.location.path === descriptor.path),
      unclassified: result.unclassified.filter((reference) => reference.location.path === descriptor.path),
    });
  }
}

function mergeResults(first: DetectorResult, second: DetectorResult): DetectorResult {
  return {
    findings: [...first.findings, ...second.findings],
    unclassified: [...first.unclassified, ...second.unclassified],
  };
}

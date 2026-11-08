// The scan pipeline: discover → detect → resolve → report. This entry point owns the timestamp, the
// active data version, the cache, and the orchestration; each stage owns its own module and tests.

import { join, resolve } from "node:path";

import { getActiveData } from "@velella/ebb/data-source";
import { dataInfoFrom } from "@velella/ebb/data-status";
import { staleDataWarning } from "../data-text.js";
import type { DataInfo, Finding, ScanResult, UnclassifiedReference } from "../domain.js";
import type { ScanFileSystem } from "../file-system.js";
import { nodeFileSystem } from "../node-file-system.js";
import { advisoryIdsByRuleId } from "../osv-advisories.js";
import { computeFileHash, defaultScanCacheDirectory, ScanCache } from "../scan-cache.js";
import type { Detector } from "../sdk.js";
import { detectAll, detectorVersion } from "./detect.js";
import type { DetectorResult } from "./detect.js";
import { listRepositoryFiles } from "./discover.js";
import { buildScanResult } from "./report.js";
import type { MultiScanResult } from "./report.js";
import { sortFindings, sortReferences, withAdvisories } from "./resolve.js";

export { CROSS_FILE_DETECTORS, defaultConfidence, shouldDisableCacheForDetector } from "./detect.js";
export { buildScanCoverage, findRepositories } from "./discover.js";
export { renderMultiScanText } from "./report.js";
export type { MultiScanResult } from "./report.js";
export { applyScanSelection, scanSelectorMatches } from "./resolve.js";

export interface ScanOptions {
  /**
   * When true, skips reading from or writing to the cache, forcing all detectors to scan fresh.
   */
  readonly noCache?: boolean;
  /** Directory for scan cache entries; defaults to `EVERGREEN_CACHE_DIR` or the platform cache directory. */
  readonly cacheDirectory?: string;
  /** Where the scan reads files from. Defaults to the real filesystem. */
  readonly fileSystem?: ScanFileSystem;
  /** Custom scan cache instance. */
  readonly cache?: ScanCache;
  /** Specific scannedAt ISO timestamp to use (keeps scans deterministic in tests). */
  readonly scannedAt?: string;
  /** Data version override (useful for testing cache invalidation on data update). */
  readonly dataVersion?: string;
}

/** The file system and cache a scan uses: the ones in `options`, or the real file system and its default cache. */
function scanSetup(options: ScanOptions): { fileSystem: ScanFileSystem; scanCache: ScanCache } {
  const fileSystem = options.fileSystem ?? nodeFileSystem;
  const scanCache = options.cache ?? new ScanCache(options.cacheDirectory ?? defaultScanCacheDirectory(), fileSystem);
  return { fileSystem, scanCache };
}

/** Hashes kept between detectors: enough to reuse the same file across detectors, bounded so a huge tree cannot grow the cache. */
const fileHashCacheEntries = 4096;

/**
 * Reads each file at most once per scan and remembers its content hash in a bounded cache.
 *
 * Every detector asks for the hash of each of its input files. Keeping the last few thousand hashes
 * reuses the work when detectors overlap, while evicting the oldest entry keeps the cache a fixed
 * size instead of one promise per file in the repository.
 */
export function fileHashReader(root: string, fileSystem: ScanFileSystem): (relPath: string) => Promise<string> {
  const hashes = new Map<string, Promise<string>>();
  return (relPath) => {
    const existing = hashes.get(relPath);
    if (existing !== undefined) {
      // Refresh recency: a hash another detector will ask for again stays in the cache.
      hashes.delete(relPath);
      hashes.set(relPath, existing);
      return existing;
    }
    const pending = (async () => {
      try {
        return computeFileHash(await fileSystem.readBytes(join(root, relPath)));
      } catch {
        return "";
      }
    })();
    hashes.set(relPath, pending);
    while (hashes.size > fileHashCacheEntries) {
      const oldest = hashes.keys().next().value;
      if (oldest === undefined) break;
      hashes.delete(oldest);
    }
    return pending;
  };
}

/** Downloaded data, its warnings, and the version to key cache entries by. */
interface ActiveScanData {
  readonly data?: DataInfo;
  readonly warnings: string[];
  readonly version: string;
}

/** Loads the active lifecycle data, or nothing when no detectors run. */
async function activeScanData(detectors: readonly Detector[], scannedAt: Date): Promise<ActiveScanData> {
  const active = detectors.length === 0 ? undefined : await getActiveData();
  const data = active ? dataInfoFrom(active, scannedAt) : undefined;
  return {
    ...(data ? { data } : {}),
    warnings: active ? [...active.info.warnings, ...(data?.stale ? [staleDataWarning(data)] : [])] : [],
    version: active?.info.version ?? "bundled",
  };
}

/** Records which detector and data versions produced this scan, for cache diagnostics. */
async function recordScanManifest(
  scanCache: ScanCache,
  root: string,
  scannedAt: string,
  detectors: readonly Detector[],
  dataVersion: string,
): Promise<void> {
  await scanCache.setScanManifest({
    root,
    scannedAt,
    detectorSignatures: Object.fromEntries(
      detectors.map((detector) => [detector.id, `${detectorVersion(detector)}:${dataVersion}`]),
    ),
  });
}

/** Merges detector output into the deterministic findings and references a result carries. */
async function resolveAnalyses(
  detectors: readonly Detector[],
  analyses: readonly DetectorResult[],
): Promise<{ findings: Finding[]; references: UnclassifiedReference[] }> {
  const advisories = detectors.length === 0 ? new Map<string, string[]>() : await advisoryIdsByRuleId();
  return {
    findings: sortFindings(
      withAdvisories(
        analyses.flatMap((analysis) => analysis.findings),
        advisories,
      ),
    ),
    references: sortReferences(analyses.flatMap((analysis) => analysis.unclassified)),
  };
}

/** Runs the detectors over a repository and returns the sorted, deduplicated findings. */
export async function scanRepository(
  root: string,
  detectors: readonly Detector[] = [],
  options: ScanOptions = {},
): Promise<ScanResult> {
  const resolvedRoot = resolve(root);
  const noCache = options.noCache ?? process.env.EVERGREEN_NO_CACHE === "1";
  const { fileSystem, scanCache } = scanSetup(options);

  // One timestamp for the whole scan: detectors that need "today" (CLE scheduled dates) read it from
  // context instead of the clock, so findings stay deterministic for this run.
  const scannedAt = new Date();
  const contextScannedAt = options.scannedAt ?? scannedAt.toISOString();
  const context = { root: resolvedRoot, scannedAt: contextScannedAt };

  // Say so when downloaded data was refused and the bundled data was used instead.
  const active = await activeScanData(detectors, scannedAt);
  const dataVersion = options.dataVersion ?? active.version;

  // Always list when detectors run: the cache needs the paths, and plan touch-sets need them
  // in coverage so shared lockfiles conflict across tasks even when the scan found findings.
  const repoFiles = detectors.length > 0 ? await listRepositoryFiles(resolvedRoot, fileSystem) : [];
  const analyses = await detectAll(detectors, {
    context,
    root: resolvedRoot,
    repoFiles,
    cache: scanCache,
    fileSystem,
    dataVersion,
    noCache,
    getFileHash: fileHashReader(resolvedRoot, fileSystem),
  });

  if (!noCache && detectors.length > 0) {
    await recordScanManifest(scanCache, resolvedRoot, contextScannedAt, detectors, dataVersion);
  }

  const { findings, references } = await resolveAnalyses(detectors, analyses);
  return buildScanResult({
    root: resolvedRoot,
    scannedAt: contextScannedAt,
    detectors,
    findings,
    references,
    repoFiles,
    fileSystem,
    diagnostics: detectors.length === 0 ? ["No detectors are enabled."] : active.warnings,
    ...(active.data ? { data: active.data } : {}),
  });
}

/** Scans each path in turn; projects come back sorted by path so the output is deterministic. */
export async function scanProjects(
  paths: readonly string[],
  detectors: readonly Detector[] = [],
  options: ScanOptions = {},
): Promise<MultiScanResult> {
  const unique = [...new Set(paths.map((path) => resolve(path)))].sort((left, right) => left.localeCompare(right));
  const projects: MultiScanResult["projects"] = [];
  for (const path of unique) {
    const result = await scanRepository(path, detectors, options);
    projects.push({ path, findings: result.findings.length, result });
  }
  return {
    schemaVersion: "evergreen.multi-scan.v1",
    projects,
    total: { projects: projects.length, findings: projects.reduce((sum, project) => sum + project.findings, 0) },
  };
}

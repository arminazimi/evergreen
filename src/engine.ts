import { basename } from "node:path/posix";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { getActiveData } from "./data-source.js";
import { dataInfoFrom, staleDataWarning } from "./data-status.js";
import { declaresInput } from "./detector-inputs.js";
import { COVERAGE_WALK_LIMIT, type Confidence, type Finding, type ScanCoverage, type ScanResult, type UnclassifiedReference } from "./domain.js";
import { advisoryIdsByRuleId } from "./osv-advisories.js";
import { relativePosix } from "./paths.js";
import { computeFileHash, defaultScanCacheDirectory, ScanCache } from "./scan-cache.js";
import type { DetectorFileDescriptor } from "./scan-cache.js";
import { assertDetectorCompatible } from "./sdk.js";
import type { Detector, DetectorContext, DetectorFinding, DetectorInputs } from "./sdk.js";

export { COVERAGE_WALK_LIMIT };

export interface ScanOptions {
  /**
   * When true, skips reading from or writing to the cache, forcing all detectors to scan fresh.
   */
  readonly noCache?: boolean;
  /** Directory for scan cache entries; defaults to `EVERGREEN_CACHE_DIR` or the platform cache directory. */
  readonly cacheDirectory?: string;
  /** Custom scan cache instance. */
  readonly cache?: ScanCache;
  /** Specific scannedAt ISO timestamp to use (keeps scans deterministic in tests). */
  readonly scannedAt?: string;
  /** Data version override (useful for testing cache invalidation on data update). */
  readonly dataVersion?: string;
}

/** Matches `CLE_FILE_NAME` in cle-ingest without importing that module into the engine. */
const CLE_COVERAGE_FILE = "cle.json";

/** Lockfiles whose entries are resolved versions rather than declarations. */
const LOCKFILE_NAME = /(^|[-.])(lock|lockfile)(\.[a-z]+)?$|\.lock$|^(go\.sum|pubspec\.lock|packages\.lock\.json|gemfile\.lock|composer\.lock|cargo\.lock|poetry\.lock|uv\.lock|pipfile\.lock|npm-shrinkwrap\.json)$/i;

/** Vendored and build trees the coverage walk does not enter (kept local so the engine stays light). */
const COVERAGE_SKIPPED_DIRECTORIES = new Set([
  ".git", ".hg", ".venv", "venv", "node_modules", "vendor", "dist", "build", "target", "coverage",
  ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox", "fixtures", "__fixtures__", "testdata",
]);

/** Vendored and build trees repository scan file listing skips. */
const SCAN_SKIPPED_DIRECTORIES = new Set([
  ".git", ".hg", ".venv", "venv", "node_modules", "vendor", "dist", "build", "target", "coverage",
  ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox",
]);

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
  if (dirs && dirs.some((d) => SCAN_SKIPPED_DIRECTORIES.has(d.replace(/\/+$/, "")))) {
    return true;
  }
  return false;
}

/** What a finding is worth when its detector did not say: a lockfile entry is inferred-from-lock, any other read is exact. */
export function defaultConfidence(finding: DetectorFinding): Confidence {
  return finding.confidence ?? (LOCKFILE_NAME.test(basename(finding.location.path)) ? "inferred-from-lock" : "exact");
}

/** Directory errors the coverage walk skips so an unreadable tree cannot fail the scan. */
const COVERAGE_SKIP_READ_CODES = new Set(["EACCES", "ENOENT", "ENOTDIR"]);

/** Repository-relative paths under `root`, skipping vendored trees, capped for large repositories. */
async function listCoverageFiles(
  root: string,
  walkLimit: number,
): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = [];
  let visited = 0;
  let truncated = false;
  const walk = async (directory: string): Promise<void> => {
    if (visited >= walkLimit) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code && COVERAGE_SKIP_READ_CODES.has(code)) return;
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (visited >= walkLimit) {
        truncated = true;
        return;
      }
      visited += 1;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!COVERAGE_SKIPPED_DIRECTORIES.has(entry.name)) await walk(absolute);
        continue;
      }
      if (entry.isFile()) files.push(relativePosix(root, absolute));
    }
  };
  await walk(root);
  return { files, truncated };
}

/** Repository-relative paths under `root`, skipping build and vendor directories. */
async function listRepositoryFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code && COVERAGE_SKIP_READ_CODES.has(code)) return;
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SCAN_SKIPPED_DIRECTORIES.has(entry.name)) await walk(absolute);
        continue;
      }
      if (entry.isFile()) files.push(relativePosix(root, absolute));
    }
  };
  await walk(root);
  return files;
}

/**
 * Inputs used only for empty-scan coverage: skip source-usage extensions (those do not mean the
 * ecosystem is present), and for CLE only count its own documents (not every package.json).
 */
function coverageInputs(detector: Detector): DetectorInputs | undefined {
  if (!detector.inputs) return undefined;
  if (detector.id === "cle") return { fileNames: [CLE_COVERAGE_FILE], directories: ["node_modules"] };
  const { sourceExtensions: _source, ...rest } = detector.inputs;
  return rest;
}

function matchedViaFileNameOrDirectory(inputs: DetectorInputs, path: string): boolean {
  const narrowed: DetectorInputs = {
    ...(inputs.fileNames ? { fileNames: inputs.fileNames } : {}),
    ...(inputs.directories ? { directories: inputs.directories } : {}),
  };
  return declaresInput(narrowed, path);
}

/**
 * Which detectors matched files on disk, which of those files they declare, and which unclassified
 * paths were seen. Used by the text reporter when a scan finds nothing. `walkLimit` caps how many
 * directory entries are opened (default {@link COVERAGE_WALK_LIMIT}); when the cap is hit,
 * `truncated` is set on the result.
 */
export async function buildScanCoverage(
  root: string,
  detectors: readonly Detector[],
  unsupportedFiles: readonly string[],
  walkLimit = COVERAGE_WALK_LIMIT,
): Promise<ScanCoverage> {
  const withInputs = detectors.flatMap((detector) => {
    const inputs = coverageInputs(detector);
    return inputs ? [{ detector, inputs }] : [];
  });
  if (withInputs.length === 0) {
    return { ecosystems: [], filesRead: [], unsupportedFiles: [...unsupportedFiles].sort((left, right) => left.localeCompare(right)) };
  }
  const directoryPrefixes = withInputs.flatMap(({ inputs }) =>
    (inputs.directories ?? []).map((directory) => `${directory.replace(/\/+$/, "")}/`),
  );
  const { files, truncated } = await listCoverageFiles(root, walkLimit);
  const ecosystems: string[] = [];
  const filesRead = new Set<string>();
  for (const { detector, inputs } of withInputs) {
    const matched = files.filter((path) => {
      if (!declaresInput(inputs, path)) return false;
      // Extension-only hits under another detector's directory (for example workflow YAML) stay theirs.
      if (matchedViaFileNameOrDirectory(inputs, path)) return true;
      return !directoryPrefixes.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix));
    });
    if (matched.length === 0) continue;
    ecosystems.push(detector.id);
    for (const path of matched) filesRead.add(path);
  }
  return {
    ecosystems: ecosystems.sort((left, right) => left.localeCompare(right)),
    filesRead: [...filesRead].sort((left, right) => left.localeCompare(right)),
    unsupportedFiles: [...new Set(unsupportedFiles)].sort((left, right) => left.localeCompare(right)),
    ...(truncated ? { truncated: true } : {}),
  };
}

export async function scanRepository(
  root: string,
  detectors: readonly Detector[] = [],
  options: ScanOptions = {},
): Promise<ScanResult> {
  const resolvedRoot = resolve(root);
  const noCache = options.noCache ?? (process.env.EVERGREEN_NO_CACHE === "1");
  const scanCache = options.cache ?? new ScanCache(options.cacheDirectory ?? defaultScanCacheDirectory());

  // One timestamp for the whole scan: detectors that need "today" (CLE scheduled dates) read it from
  // context instead of the clock, so findings stay deterministic for this run.
  const scannedAt = new Date();
  const contextScannedAt = options.scannedAt ?? scannedAt.toISOString();
  const context = { root: resolvedRoot, scannedAt: contextScannedAt };

  // Say so when downloaded data was refused and the bundled data was used instead.
  const active = detectors.length === 0 ? undefined : await getActiveData();
  const data = active ? dataInfoFrom(active, scannedAt) : undefined;
  const dataWarnings = active ? [...active.info.warnings, ...(data?.stale ? [staleDataWarning(data)] : [])] : [];
  const dataVersion = options.dataVersion ?? active?.info.version ?? "bundled";

  const repoFiles = !noCache && detectors.length > 0 ? await listRepositoryFiles(resolvedRoot) : [];
  const fileHashMap = new Map<string, Promise<string>>();
  const getFileHash = (relPath: string): Promise<string> => {
    let existing = fileHashMap.get(relPath);
    if (existing === undefined) {
      existing = (async () => {
        try {
          const content = await readFile(join(resolvedRoot, relPath));
          return computeFileHash(content);
        } catch {
          return "";
        }
      })();
      fileHashMap.set(relPath, existing);
    }
    return existing;
  };

  let allDetectorsCached = !noCache && detectors.length > 0;

  const analyses = await Promise.all(
    detectors.map(async (detector) => {
      assertDetectorCompatible(detector);
      const detectorCode = computeFileHash(detector.scan.toString() + (detector.analyze ? detector.analyze.toString() : ""));
      const detectorVersion = `${(detector as { version?: string }).version ?? detector.apiVersion}:${detectorCode}`;

      const disableCache = noCache || shouldDisableCacheForDetector(detector);

      if (disableCache) {
        allDetectorsCached = false;
        const analysis = detector.analyze
          ? await detector.analyze(context)
          : { findings: await detector.scan(context), unclassified: [] };
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

      const relevantFiles = detector.inputs
        ? repoFiles.filter((path) => declaresInput(detector.inputs!, path))
        : repoFiles;
      const sortedFiles = [...relevantFiles].sort((left, right) => left.localeCompare(right));
      if (detector.inputs && sortedFiles.length === 0) {
        return { findings: [], unclassified: [] };
      }
      const descriptors: DetectorFileDescriptor[] = await Promise.all(
        sortedFiles.map(async (path) => ({ path, hash: await getFileHash(path) })),
      );

      // Check detector manifest first: when all files are unchanged, skip re-evaluating
      const manifest = await scanCache.getDetectorManifest(resolvedRoot, detector.id, detectorVersion, dataVersion);
      const manifestMatches = Boolean(
        manifest &&
        manifest.files.length === descriptors.length &&
        manifest.files.every((file, index) => {
          const current = descriptors[index];
          return current && file.path === current.path && file.hash === current.hash;
        }),
      );

      if (manifestMatches) {
        return {
          findings: manifest!.findings,
          unclassified: manifest!.unclassified,
        };
      }

      const isCrossFile = CROSS_FILE_DETECTORS.has(detector.id);

      if (isCrossFile) {
        // Cross-file detector: manifests and dependencies across files correlate,
        // so invalidate and re-run on context when any input file changes.
        allDetectorsCached = false;
        const analysis = detector.analyze
          ? await detector.analyze(context)
          : { findings: await detector.scan(context), unclassified: [] };
        const mappedFindings: Finding[] = analysis.findings.map((finding) => ({
          ...finding,
          detector: detector.id,
          confidence: defaultConfidence(finding),
        }));
        const mappedUnclassified: UnclassifiedReference[] = analysis.unclassified.map((reference) => ({
          ...reference,
          detector: detector.id,
        }));

        for (const desc of descriptors) {
          const fileFindings = mappedFindings.filter((finding) => finding.location.path === desc.path);
          const fileUnclassified = mappedUnclassified.filter((ref) => ref.location.path === desc.path);
          await scanCache.set({
            filePath: desc.path,
            fileHash: desc.hash,
            detectorId: detector.id,
            detectorVersion,
            dataVersion,
            findings: fileFindings,
            unclassified: fileUnclassified,
          });
        }
        await scanCache.setDetectorManifest(resolvedRoot, {
          detectorId: detector.id,
          detectorVersion,
          dataVersion,
          files: descriptors,
          findings: mappedFindings,
          unclassified: mappedUnclassified,
        });

        return {
          findings: mappedFindings,
          unclassified: mappedUnclassified,
        };
      } else {
        // File-isolated detector: results for unchanged files are loaded directly from per-file cache entries.
        const cachedFileFindings: Finding[] = [];
        const cachedFileUnclassified: UnclassifiedReference[] = [];
        const changedDescriptors: DetectorFileDescriptor[] = [];

        await Promise.all(
          descriptors.map(async (desc) => {
            const entry = await scanCache.get({
              filePath: desc.path,
              fileHash: desc.hash,
              detectorId: detector.id,
              detectorVersion,
              dataVersion,
            });
            if (entry) {
              cachedFileFindings.push(...entry.findings);
              cachedFileUnclassified.push(...entry.unclassified);
            } else {
              changedDescriptors.push(desc);
            }
          }),
        );

        if (changedDescriptors.length === 0) {
          return {
            findings: cachedFileFindings,
            unclassified: cachedFileUnclassified,
          };
        }

        allDetectorsCached = false;
        let newlyParsedFindings: Finding[] = [];
        let newlyParsedUnclassified: UnclassifiedReference[] = [];

        if (changedDescriptors.length === descriptors.length) {
          // Cold cache or all files changed: scan directly on context.root
          const analysis = detector.analyze
            ? await detector.analyze(context)
            : { findings: await detector.scan(context), unclassified: [] };
          const mappedFindings: Finding[] = analysis.findings.map((finding) => ({
            ...finding,
            detector: detector.id,
            confidence: defaultConfidence(finding),
          }));
          const mappedUnclassified: UnclassifiedReference[] = analysis.unclassified.map((reference) => ({
            ...reference,
            detector: detector.id,
          }));

          for (const desc of descriptors) {
            const fileFindings = mappedFindings.filter((finding) => finding.location.path === desc.path);
            const fileUnclassified = mappedUnclassified.filter((ref) => ref.location.path === desc.path);
            await scanCache.set({
              filePath: desc.path,
              fileHash: desc.hash,
              detectorId: detector.id,
              detectorVersion,
              dataVersion,
              findings: fileFindings,
              unclassified: fileUnclassified,
            });
          }
          newlyParsedFindings = mappedFindings;
          newlyParsedUnclassified = mappedUnclassified;
        } else {
          // Subset of files changed: copy only changed files to a temporary directory and re-parse only those
          const tempRoot = await mkdtemp(join(tmpdir(), "evergreen-scan-"));
          try {
            for (const desc of changedDescriptors) {
              const dest = join(tempRoot, desc.path);
              await mkdir(dirname(dest), { recursive: true });
              await copyFile(resolve(resolvedRoot, desc.path), dest);
            }
            const subContext: DetectorContext = {
              root: tempRoot,
              scannedAt: contextScannedAt,
            };
            const analysis = detector.analyze
              ? await detector.analyze(subContext)
              : { findings: await detector.scan(subContext), unclassified: [] };
            const mappedFindings: Finding[] = analysis.findings.map((finding) => ({
              ...finding,
              detector: detector.id,
              confidence: defaultConfidence(finding),
            }));
            const mappedUnclassified: UnclassifiedReference[] = analysis.unclassified.map((reference) => ({
              ...reference,
              detector: detector.id,
            }));

            for (const desc of changedDescriptors) {
              const fileFindings = mappedFindings.filter((finding) => finding.location.path === desc.path);
              const fileUnclassified = mappedUnclassified.filter((ref) => ref.location.path === desc.path);
              await scanCache.set({
                filePath: desc.path,
                fileHash: desc.hash,
                detectorId: detector.id,
                detectorVersion,
                dataVersion,
                findings: fileFindings,
                unclassified: fileUnclassified,
              });
            }
            newlyParsedFindings = mappedFindings;
            newlyParsedUnclassified = mappedUnclassified;
          } finally {
            await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
          }
        }

        const totalFindings = [...cachedFileFindings, ...newlyParsedFindings];
        const totalUnclassified = [...cachedFileUnclassified, ...newlyParsedUnclassified];

        await scanCache.setDetectorManifest(resolvedRoot, {
          detectorId: detector.id,
          detectorVersion,
          dataVersion,
          files: descriptors,
          findings: totalFindings,
          unclassified: totalUnclassified,
        });

        return {
          findings: totalFindings,
          unclassified: totalUnclassified,
        };
      }
    }),
  );

  const finalScannedAtIso = contextScannedAt;

  if (!noCache && detectors.length > 0) {
    await scanCache.setScanManifest({
      root: resolvedRoot,
      scannedAt: finalScannedAtIso,
      detectorSignatures: Object.fromEntries(
        detectors.map((d) => {
          const code = computeFileHash(d.scan.toString() + (d.analyze ? d.analyze.toString() : ""));
          return [d.id, `${(d as { version?: string }).version ?? d.apiVersion}:${code}:${dataVersion}`];
        }),
      ),
    });
  }

  const findings = analyses.flatMap((analysis) => analysis.findings);
  const references = analyses
    .flatMap((analysis) => analysis.unclassified)
    .sort((left, right) =>
      [left.detector, left.component, left.location.path, left.location.line ?? 0, left.reference]
        .join(":")
        .localeCompare(
          [right.detector, right.component, right.location.path, right.location.line ?? 0, right.reference]
            .join(":"),
        ),
    );

  const advisories = detectors.length === 0 ? new Map<string, string[]>() : await advisoryIdsByRuleId();
  const withAdvisories = findings.map((finding) => {
    const advisoryIds = advisories.get(finding.ruleId);
    return advisoryIds?.length ? { ...finding, advisoryIds } : finding;
  });
  const findingsSorted = withAdvisories.sort((left, right) => left.id.localeCompare(right.id));
  // Coverage is for the empty-scan help; skip the extra walk when there are already findings to show.
  const coverage =
    detectors.length === 0 || findingsSorted.length > 0
      ? undefined
      : await buildScanCoverage(
          resolvedRoot,
          detectors,
          references.map((reference) => reference.location.path),
        );

  return {
    schemaVersion: "evergreen.scan.v1",
    root: resolvedRoot,
    scannedAt: finalScannedAtIso,
    findings: findingsSorted,
    unclassified: { count: references.length, references },
    diagnostics: detectors.length === 0 ? ["No detectors are enabled."] : dataWarnings,
    ...(data ? { data } : {}),
    ...(coverage ? { coverage } : {}),
  };
}

export interface ProjectScan {
  path: string;
  result: ScanResult;
}

export interface MultiScanResult {
  schemaVersion: "evergreen.multi-scan.v1";
  projects: Array<{ path: string; findings: number; result: ScanResult }>;
  total: { projects: number; findings: number };
}

/** The immediate subdirectories of `directory` that are Git repositories, sorted by name. */
export async function findRepositories(directory: string): Promise<string[]> {
  const root = resolve(directory);
  const entries = await readdir(root, { withFileTypes: true });
  const repositories: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(root, entry.name);
    if (await stat(join(candidate, ".git")).then(() => true, () => false)) repositories.push(candidate);
  }
  return repositories.sort((left, right) => left.localeCompare(right));
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

export function renderMultiScanText(scan: MultiScanResult): string {
  const lines = scan.projects.map((project) => `${project.path}: ${project.findings} ${project.findings === 1 ? "finding" : "findings"}`);
  lines.push("", `Total: ${scan.total.findings} ${scan.total.findings === 1 ? "finding" : "findings"} across ${scan.total.projects} ${scan.total.projects === 1 ? "project" : "projects"}`);
  return lines.join("\n");
}

// Stage 1 — discover: which repository files exist, which detectors claim them, and what a
// zero-finding scan can say about coverage.

import { join, resolve } from "node:path";

import { declaresInput } from "../detector-inputs.js";
import { COVERAGE_WALK_LIMIT } from "../domain.js";
import type { ScanCoverage } from "../domain.js";
import type { ScanFileSystem } from "../file-system.js";
import { nodeFileSystem } from "../node-file-system.js";
import { childPosixPath } from "../paths.js";
import type { Detector, DetectorInputs } from "../sdk.js";

/** Matches `CLE_FILE_NAME` in cle-ingest without importing that module into the engine. */
const CLE_COVERAGE_FILE = "cle.json";

/** Vendored and build trees the coverage walk does not enter (kept local so the engine stays light). */
const COVERAGE_SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".venv",
  "venv",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  "coverage",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  "fixtures",
  "__fixtures__",
  "testdata",
]);

/** Vendored and build trees repository scan file listing skips. */
const SCAN_SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".venv",
  "venv",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  "coverage",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
]);

/** Directory errors the coverage walk skips so an unreadable tree cannot fail the scan. */
const COVERAGE_SKIP_READ_CODES = new Set(["EACCES", "ENOENT", "ENOTDIR"]);

/**
 * Drops a declared directory's trailing `/` characters. Directory names come from detectors,
 * including third-party ones, so they are untrusted: a loop stays linear where `/\/+$/` backtracks
 * quadratically on a long run of slashes (`js/polynomial-redos`).
 */
export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 0x2f) end -= 1;
  return end === value.length ? value : value.slice(0, end);
}

/** True when a repository listing skips this directory name. */
export function isSkippedScanDirectory(name: string): boolean {
  return SCAN_SKIPPED_DIRECTORIES.has(name);
}

/** The `code` on an error (such as `EACCES`), when it has one. */
function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}

/** Repository-relative paths under `root`, skipping vendored trees, capped for large repositories. */
async function listCoverageFiles(
  root: string,
  walkLimit: number,
  fileSystem: ScanFileSystem,
): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = [];
  let visited = 0;
  let truncated = false;
  const walk = async (directory: string, prefix: string): Promise<void> => {
    if (visited >= walkLimit) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await fileSystem.readDirectory(directory);
    } catch (error) {
      const code = errorCode(error);
      if (code && COVERAGE_SKIP_READ_CODES.has(code)) return;
      throw error;
    }
    // Binary name order is deterministic across locales and cheaper than localeCompare on large dirs.
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      if (visited >= walkLimit) {
        truncated = true;
        return;
      }
      visited += 1;
      if (entry.isDirectory()) {
        if (!COVERAGE_SKIPPED_DIRECTORIES.has(entry.name)) {
          await walk(join(directory, entry.name), childPosixPath(prefix, entry.name));
        }
        continue;
      }
      if (entry.isFile()) files.push(childPosixPath(prefix, entry.name));
    }
  };
  await walk(root, "");
  return { files, truncated };
}

/** Repository-relative paths under `root`, skipping build and vendor directories. */
export async function listRepositoryFiles(root: string, fileSystem: ScanFileSystem): Promise<string[]> {
  const files: string[] = [];
  const walk = async (directory: string, prefix: string): Promise<void> => {
    let entries;
    try {
      entries = await fileSystem.readDirectory(directory);
    } catch (error) {
      const code = errorCode(error);
      if (code && COVERAGE_SKIP_READ_CODES.has(code)) return;
      throw error;
    }
    // Binary name order is deterministic across locales and cheaper than localeCompare on large dirs.
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SCAN_SKIPPED_DIRECTORIES.has(entry.name)) {
          await walk(join(directory, entry.name), childPosixPath(prefix, entry.name));
        }
        continue;
      }
      if (entry.isFile()) files.push(childPosixPath(prefix, entry.name));
    }
  };
  await walk(root, "");
  return files;
}

/**
 * Inputs used only for empty-scan coverage: skip source-usage extensions (those do not mean the
 * ecosystem is present), and for CLE only count its own documents (not every package.json).
 */
function coverageInputs(detector: Detector): DetectorInputs | undefined {
  if (!detector.inputs) return undefined;
  if (detector.id === "cle") return { fileNames: [CLE_COVERAGE_FILE], directories: ["node_modules"] };
  const { fileNames, extensions, directories } = detector.inputs;
  return {
    ...(fileNames ? { fileNames } : {}),
    ...(extensions ? { extensions } : {}),
    ...(directories ? { directories } : {}),
  };
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
  fileSystem: ScanFileSystem = nodeFileSystem,
): Promise<ScanCoverage> {
  const withInputs = detectors.flatMap((detector) => {
    const inputs = coverageInputs(detector);
    return inputs ? [{ detector, inputs }] : [];
  });
  if (withInputs.length === 0) {
    return {
      ecosystems: [],
      filesRead: [],
      unsupportedFiles: [...unsupportedFiles].sort((left, right) => left.localeCompare(right)),
    };
  }
  const directoryPrefixes = withInputs.flatMap(({ inputs }) =>
    (inputs.directories ?? []).map((directory) => `${trimTrailingSlashes(directory)}/`),
  );
  const { files, truncated } = await listCoverageFiles(root, walkLimit, fileSystem);
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

/** The immediate subdirectories of `directory` that are Git repositories, sorted by name. */
export async function findRepositories(
  directory: string,
  fileSystem: ScanFileSystem = nodeFileSystem,
): Promise<string[]> {
  const root = resolve(directory);
  const entries = await fileSystem.readDirectory(root);
  const repositories: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(root, entry.name);
    if (await fileSystem.exists(join(candidate, ".git"))) repositories.push(candidate);
  }
  return repositories.sort((left, right) => left.localeCompare(right));
}

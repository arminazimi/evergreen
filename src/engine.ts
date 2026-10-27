import { basename } from "node:path/posix";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { getActiveData } from "./data-source.js";
import { dataInfoFrom, staleDataWarning } from "./data-status.js";
import { declaresInput } from "./detector-inputs.js";
import type { Confidence, ScanCoverage, ScanResult } from "./domain.js";
import { advisoryIdsByRuleId } from "./osv-advisories.js";
import { relativePosix } from "./paths.js";
import { assertDetectorCompatible } from "./sdk.js";
import type { Detector, DetectorFinding, DetectorInputs } from "./sdk.js";

/** Matches `CLE_FILE_NAME` in cle-ingest without importing that module into the engine. */
const CLE_COVERAGE_FILE = "cle.json";

/** Lockfiles whose entries are resolved versions rather than declarations. */
const LOCKFILE_NAME = /(^|[-.])(lock|lockfile)(\.[a-z]+)?$|\.lock$|^(go\.sum|pubspec\.lock|packages\.lock\.json|gemfile\.lock|composer\.lock|cargo\.lock|poetry\.lock|uv\.lock|pipfile\.lock|npm-shrinkwrap\.json)$/i;

/** Cap on how many files the coverage walk opens directory entries for, so a huge tree cannot stall a scan. */
const COVERAGE_WALK_LIMIT = 20_000;

/** Vendored and build trees the coverage walk does not enter (kept local so the engine stays light). */
const COVERAGE_SKIPPED_DIRECTORIES = new Set([
  ".git", ".hg", ".venv", "venv", "node_modules", "vendor", "dist", "build", "target", "coverage",
  ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox", "fixtures", "__fixtures__", "testdata",
]);

/** What a finding is worth when its detector did not say: a lockfile entry is inferred-from-lock, any other read is exact. */
export function defaultConfidence(finding: DetectorFinding): Confidence {
  return finding.confidence ?? (LOCKFILE_NAME.test(basename(finding.location.path)) ? "inferred-from-lock" : "exact");
}

/** Repository-relative paths under `root`, skipping vendored trees, capped for large repositories. */
async function listCoverageFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  let visited = 0;
  const walk = async (directory: string): Promise<void> => {
    if (visited >= COVERAGE_WALK_LIMIT) return;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (visited >= COVERAGE_WALK_LIMIT) return;
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
 * paths were seen. Used by the text reporter when a scan finds nothing.
 */
export async function buildScanCoverage(
  root: string,
  detectors: readonly Detector[],
  unsupportedFiles: readonly string[],
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
  const files = await listCoverageFiles(root);
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
  };
}

export async function scanRepository(
  root: string,
  detectors: readonly Detector[] = [],
): Promise<ScanResult> {
  const resolvedRoot = resolve(root);
  // One timestamp for the whole scan: detectors that need "today" (CLE scheduled dates) read it from
  // context instead of the clock, so findings stay deterministic for this run.
  const scannedAt = new Date();
  const scannedAtIso = scannedAt.toISOString();
  const context = { root: resolvedRoot, scannedAt: scannedAtIso };
  const analyses = await Promise.all(
      detectors.map(async (detector) => {
        assertDetectorCompatible(detector);
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
      }),
    );
  const findings = analyses.flatMap((analysis) => analysis.findings);
  const references = analyses
    .flatMap((analysis) => analysis.unclassified)
    .sort((left, right) =>
      [left.detector, left.component, left.location.path, left.location.line ?? 0, left.reference]
        .join(":")
        .localeCompare(
          [right.detector, right.component, right.location.path, right.location.line ?? 0, right.reference]
            .join(":"),
        )
    );

  // Say so when downloaded data was refused and the bundled data was used instead.
  const active = detectors.length === 0 ? undefined : await getActiveData();
  const data = active ? dataInfoFrom(active, scannedAt) : undefined;
  const dataWarnings = active ? [...active.info.warnings, ...(data?.stale ? [staleDataWarning(data)] : [])] : [];
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
    scannedAt: scannedAtIso,
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
): Promise<MultiScanResult> {
  const unique = [...new Set(paths.map((path) => resolve(path)))].sort((left, right) => left.localeCompare(right));
  const projects: MultiScanResult["projects"] = [];
  for (const path of unique) {
    const result = await scanRepository(path, detectors);
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

import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { loadDataFile } from "@velella/ebb/data-source";
import type { UnclassifiedReference } from "../../domain.js";
import { relativePosix } from "../../paths.js";
import { analyzeSourceUsage } from "../../source-usage.js";
import { validateRegistryV2 } from "@velella/ebb/registry";
import type { RegistryV2Rule } from "@velella/ebb/registry";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { parseVersLenient, versContains } from "@velella/ebb/vers/index";
import { parseCargoLock } from "./parse-cargo-lock.js";
import type { CargoLockPackage } from "./parse-cargo-lock.js";
import { parseCargoToml } from "./parse-cargo-toml.js";
import type { CargoDependencyDeclaration } from "./parse-cargo-toml.js";
import { parseRustToolchain } from "./parse-rust-toolchain.js";

/**
 * Finds a pinned Rust toolchain that is no longer supported, direct dependencies on abandoned crates, and a
 * yanked version of a direct dependency in Cargo.lock (decision 0011).
 *
 * `edition` and `rust-version` are never judged: editions do not end, and `rust-version` is a minimum, not the
 * toolchain in use. Only an exact release in a toolchain file is judged; `stable` is always current, and other
 * channels are listed as unclassified. Cargo and rustup are never run and nothing is fetched.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 500;
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  ".venv",
  "venv",
  "fixtures",
  "__fixtures__",
  "testdata",
]);
const TOOLCHAIN_PURL = "pkg:generic/rust";
const CRATE_PURL_PREFIX = "pkg:cargo/";
const NAMES = new Set(["Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "rust-toolchain"]);

async function rustFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > MAXIMUM_DEPTH || files.length >= MAXIMUM_FILES) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(join(directory, entry.name), depth + 1);
      } else if (entry.isFile() && NAMES.has(entry.name)) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0);
  return files;
}

/** `1.70` and `1.70.0` as a plain version; undefined for `stable`, `beta`, `nightly`, and everything else. */
function releaseVersion(channel: string): string | undefined {
  const match = /^1\.(\d+)(?:\.(\d+))?$/.exec(channel);
  return match ? `1.${match[1]}.${match[2] ?? "0"}` : undefined;
}

/** True for a rule that names every version of a crate; false for one that lists specific versions. */
const coversEveryVersion = (rule: RegistryV2Rule): boolean => parseVersLenient(rule.vers).all;

/** Builds and appends the finding for `rule` at `path:line`, and returns it so the caller can decorate it. */
function pushFinding(
  findings: DetectorFinding[],
  rule: RegistryV2Rule,
  path: string,
  line: number,
  summary: string,
): DetectorFinding {
  const finding: DetectorFinding = {
    id: `${rule.id}:${path}:${line}`,
    ruleId: rule.id,
    title: rule.title,
    summary,
    severity: rule.severity,
    location: { path, line },
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
  };
  findings.push(finding);
  return finding;
}

type CrateRules = ReadonlyMap<string, RegistryV2Rule[]>;

interface ManifestRecord {
  directory: string;
  dependencies: CargoDependencyDeclaration[];
}

interface LockRecord {
  directory: string;
  path: string;
  packages: CargoLockPackage[];
}

/** A finding about an abandoned crate, held back until its source usages are read once for all of them. */
interface AbandonedFinding {
  rule: RegistryV2Rule;
  path: string;
  line: number;
  summary: string;
}

/** Everything the files reveal, collected in one pass before the cross-file checks run. */
interface ScanState {
  readonly findings: DetectorFinding[];
  readonly unclassified: Omit<UnclassifiedReference, "detector">[];
  readonly abandoned: AbandonedFinding[];
  readonly manifests: ManifestRecord[];
  readonly locks: LockRecord[];
}

/** Rules keyed by the decoded crate name; each crate keeps its rules in registry order. */
function indexCrateRules(rules: readonly RegistryV2Rule[]): CrateRules {
  const crateRules = new Map<string, RegistryV2Rule[]>();
  for (const rule of rules) {
    if (!rule.purl.startsWith(CRATE_PURL_PREFIX)) continue;
    const crate = decodeURIComponent(rule.purl.slice(CRATE_PURL_PREFIX.length));
    crateRules.set(crate, [...(crateRules.get(crate) ?? []), rule]);
  }
  return crateRules;
}

/** A dependency that is not `package = …` names its crate after its key; an alias also names the key. */
function abandonedSummary(path: string, dependency: CargoDependencyDeclaration, rule: RegistryV2Rule): string {
  const alias = dependency.name !== dependency.crate ? ` (as ${dependency.name})` : "";
  return `${path} declares ${dependency.crate} ${dependency.value}${alias} in ${dependency.section}. ${rule.summary}`;
}

/** Reads a Cargo.toml: its dependencies are kept for the lockfile check, and abandoned crates are held for usage matching. */
function scanManifest(state: ScanState, crateRules: CrateRules, path: string, contents: string): void {
  const dependencies = parseCargoToml(contents).filter(
    (declaration): declaration is CargoDependencyDeclaration => declaration.kind === "dependency",
  );
  state.manifests.push({ directory: dirname(path), dependencies });
  // An abandoned crate is abandoned at every version, so the declaration itself is the finding.
  for (const dependency of dependencies) {
    for (const rule of crateRules.get(dependency.crate) ?? []) {
      if (coversEveryVersion(rule))
        state.abandoned.push({
          rule,
          path,
          line: dependency.line,
          summary: abandonedSummary(path, dependency, rule),
        });
    }
  }
}

/** Reads a rust-toolchain file. Only an exact release is judged; any other channel is listed as unclassified. */
function scanToolchain(state: ScanState, toolchainRules: RegistryV2Rule[], path: string, contents: string): void {
  for (const declaration of parseRustToolchain(contents)) {
    if (declaration.value === "stable") continue;
    const version = releaseVersion(declaration.value);
    if (!version) {
      state.unclassified.push({
        component: "rust",
        reference: declaration.value,
        reason: "the channel is not an exact release, so Evergreen does not judge it",
        location: { path, line: declaration.line },
      });
      continue;
    }
    const rule = toolchainRules.find((item) => versContains(item.vers, version));
    if (rule)
      pushFinding(
        state.findings,
        rule,
        path,
        declaration.line,
        `${path} pins Rust ${declaration.value}. ${rule.summary}`,
      );
  }
}

/** Reads one of the four Rust files, whichever it is. */
function scanFile(
  state: ScanState,
  crateRules: CrateRules,
  toolchainRules: RegistryV2Rule[],
  name: string,
  path: string,
  contents: string,
): void {
  if (name === "Cargo.toml") scanManifest(state, crateRules, path, contents);
  else if (name === "Cargo.lock")
    state.locks.push({
      directory: dirname(path),
      path,
      packages: parseCargoLock(contents),
    });
  else scanToolchain(state, toolchainRules, path, contents);
}

/** The crates that a manifest under the lockfile's directory, or any directory above it, declares directly. */
function declaredCrates(manifests: readonly ManifestRecord[], lockDirectory: string): Set<string> {
  return new Set(
    manifests
      .filter(
        (manifest) =>
          lockDirectory === "." ||
          manifest.directory === lockDirectory ||
          manifest.directory.startsWith(`${lockDirectory}/`),
      )
      .flatMap((manifest) => manifest.dependencies.map((dependency) => dependency.crate)),
  );
}

/** A yanked version is reported where it is resolved, for crates that a Cargo.toml under that lockfile declares directly. */
function reportYanked(state: ScanState, crateRules: CrateRules): void {
  for (const lock of state.locks) {
    const declared = declaredCrates(state.manifests, lock.directory);
    for (const pkg of lock.packages) {
      if (!declared.has(pkg.crate)) continue;
      for (const rule of crateRules.get(pkg.crate) ?? []) {
        if (!coversEveryVersion(rule) && rule.event === "removed" && versContains(rule.vers, pkg.value)) {
          pushFinding(
            state.findings,
            rule,
            lock.path,
            pkg.line,
            `${lock.path} resolves ${pkg.crate} ${pkg.value}, which is yanked. ${rule.summary}`,
          );
        }
      }
    }
  }
}

/** Adds the abandoned-crate findings, each with the source files that use the crate when its rule names usages. */
async function reportAbandoned(root: string, state: ScanState): Promise<void> {
  const withUsage = state.abandoned.filter((item) => (item.rule.usage ?? []).length > 0);
  const analyses = new Map(
    (
      await analyzeSourceUsage(
        root,
        withUsage.map((item) => ({
          id: `${item.rule.id}:${item.path}:${item.line}`,
          matchers: item.rule.usage ?? [],
        })),
      )
    ).map((analysis) => [analysis.contractId, analysis]),
  );
  for (const item of state.abandoned) {
    const finding = pushFinding(state.findings, item.rule, item.path, item.line, item.summary);
    const analysis = analyses.get(`${item.rule.id}:${item.path}:${item.line}`);
    if (analysis)
      Object.assign(finding, {
        usages: analysis.usages,
        impact: analysis.impact,
      });
  }
}

/** By path, then line, then id. */
function compareFindings(left: DetectorFinding, right: DetectorFinding): number {
  return (
    left.location.path.localeCompare(right.location.path) ||
    (left.location.line ?? 0) - (right.location.line ?? 0) ||
    left.id.localeCompare(right.id)
  );
}

export class RustDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "rust";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "rust-toolchain"],
    sourceExtensions: [".rs"],
  };

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/rust.json`. */
  constructor(
    private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () =>
      validateRegistryV2(await loadDataFile("registry/rust.json")).rules,
  ) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await rustFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const rules = await this.loadRules();
    const toolchainRules = rules.filter((rule) => rule.purl === TOOLCHAIN_PURL);
    const crateRules = indexCrateRules(rules);
    const state: ScanState = {
      findings: [],
      unclassified: [],
      abandoned: [],
      manifests: [],
      locks: [],
    };

    for (const file of files) {
      let contents: string;
      try {
        contents = await readFile(file, "utf8");
      } catch {
        continue;
      }
      scanFile(state, crateRules, toolchainRules, basename(file), relativePosix(context.root, file), contents);
    }

    reportYanked(state, crateRules);
    await reportAbandoned(context.root, state);
    state.findings.sort(compareFindings);
    return { findings: state.findings, unclassified: state.unclassified };
  }
}

export const rustDetector = new RustDetector();

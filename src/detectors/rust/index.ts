import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import type { UnclassifiedReference } from "../../domain.js";
import { relativePosix } from "../../paths.js";
import { analyzeSourceUsage } from "../../source-usage.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding } from "../../sdk.js";
import { parseVersLenient, versContains } from "../../vers/index.js";
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
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);
const TOOLCHAIN_PURL = "pkg:generic/rust";
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

export class RustDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "rust";

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/rust.json`. */
  constructor(private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () => validateRegistryV2(await loadDataFile("registry/rust.json")).rules) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await rustFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const rules = await this.loadRules();
    const toolchainRules = rules.filter((rule) => rule.purl === TOOLCHAIN_PURL);
    const crateRules = new Map<string, RegistryV2Rule[]>();
    for (const rule of rules) {
      if (!rule.purl.startsWith("pkg:cargo/")) continue;
      const crate = decodeURIComponent(rule.purl.slice("pkg:cargo/".length));
      crateRules.set(crate, [...(crateRules.get(crate) ?? []), rule]);
    }

    const findings: DetectorFinding[] = [];
    const unclassified: Omit<UnclassifiedReference, "detector">[] = [];
    const report = (rule: RegistryV2Rule, path: string, line: number, summary: string): void => {
      findings.push({
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
      });
    };

    // Findings about an abandoned crate wait for their source usages, which are read once for all of them.
    const abandoned: Array<{ rule: RegistryV2Rule; path: string; line: number; summary: string }> = [];
    const manifests: Array<{ directory: string; dependencies: CargoDependencyDeclaration[] }> = [];
    const locks: Array<{ directory: string; path: string; packages: CargoLockPackage[] }> = [];

    for (const file of files) {
      let contents: string;
      try {
        contents = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const path = relativePosix(context.root, file);
      const name = basename(file);

      if (name === "Cargo.toml") {
        const dependencies = parseCargoToml(contents).filter((declaration): declaration is CargoDependencyDeclaration => declaration.kind === "dependency");
        manifests.push({ directory: dirname(path), dependencies });
        // An abandoned crate is abandoned at every version, so the declaration itself is the finding.
        for (const dependency of dependencies) {
          for (const rule of crateRules.get(dependency.crate) ?? []) {
            if (coversEveryVersion(rule)) abandoned.push({ rule, path, line: dependency.line, summary: `${path} declares ${dependency.crate} ${dependency.value}${dependency.name !== dependency.crate ? ` (as ${dependency.name})` : ""} in ${dependency.section}. ${rule.summary}` });
          }
        }
      } else if (name === "Cargo.lock") {
        locks.push({ directory: dirname(path), path, packages: parseCargoLock(contents) });
      } else {
        for (const declaration of parseRustToolchain(contents)) {
          if (declaration.value === "stable") continue;
          const version = releaseVersion(declaration.value);
          if (!version) {
            unclassified.push({ component: "rust", reference: declaration.value, reason: "the channel is not an exact release, so Evergreen does not judge it", location: { path, line: declaration.line } });
            continue;
          }
          const rule = toolchainRules.find((item) => versContains(item.vers, version));
          if (rule) report(rule, path, declaration.line, `${path} pins Rust ${declaration.value}. ${rule.summary}`);
        }
      }
    }

    // A yanked version is reported where it is resolved, for crates that a Cargo.toml under that lockfile declares directly.
    for (const lock of locks) {
      const declared = new Set(
        manifests
          .filter((manifest) => lock.directory === "." || manifest.directory === lock.directory || manifest.directory.startsWith(`${lock.directory}/`))
          .flatMap((manifest) => manifest.dependencies.map((dependency) => dependency.crate)),
      );
      for (const pkg of lock.packages) {
        if (!declared.has(pkg.crate)) continue;
        for (const rule of crateRules.get(pkg.crate) ?? []) {
          if (!coversEveryVersion(rule) && rule.event === "removed" && versContains(rule.vers, pkg.value)) {
            report(rule, lock.path, pkg.line, `${lock.path} resolves ${pkg.crate} ${pkg.value}, which is yanked. ${rule.summary}`);
          }
        }
      }
    }

    // Where the repository's Rust source uses each abandoned crate, so a migration packet can list the files.
    const withUsage = abandoned.filter((item) => (item.rule.usage ?? []).length > 0);
    const analyses = new Map((await analyzeSourceUsage(context.root, withUsage.map((item) => ({ id: `${item.rule.id}:${item.path}:${item.line}`, matchers: item.rule.usage ?? [] })))).map((analysis) => [analysis.contractId, analysis]));
    for (const item of abandoned) {
      report(item.rule, item.path, item.line, item.summary);
      const analysis = analyses.get(`${item.rule.id}:${item.path}:${item.line}`);
      if (analysis) Object.assign(findings[findings.length - 1]!, { usages: analysis.usages, impact: analysis.impact });
    }

    findings.sort((left, right) => left.location.path.localeCompare(right.location.path) || (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id));
    return { findings, unclassified };
  }
}

export const rustDetector = new RustDetector();

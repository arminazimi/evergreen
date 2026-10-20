import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import { relativePosix } from "../../paths.js";
import { formatPurl, purlIdentity } from "../../purl.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { analyzeSourceUsage } from "../../source-usage.js";
import { versContains } from "../../vers/index.js";
import { parseGradle } from "../java/parse-gradle.js";
import { MAXIMUM_INPUT_BYTES } from "./gradle-scan.js";
import { parseAndroidBuildGradle } from "./parse-build-gradle.js";
import type { AndroidSdkKind } from "./parse-build-gradle.js";
import { parseAndroidLibsVersionsToml } from "./parse-libs-versions-toml.js";
import type { AndroidVersionCatalogKind } from "./parse-libs-versions-toml.js";
import { parseAndroidSettingsGradle } from "./parse-settings-gradle.js";
import type { AndroidSettingsPluginKind } from "./parse-settings-gradle.js";

/**
 * Android lifecycle detector.
 *
 * It reads literal SDK settings in `build.gradle` and `build.gradle.kts` (`compileSdk`, `minSdk`,
 * `targetSdk`, `buildToolsVersion`), Android Gradle Plugin and Kotlin Android plugin versions in
 * `settings.gradle` and `settings.gradle.kts`, `agp` and `kotlin` keys in `libs.versions.toml`, and
 * string-notation Maven dependencies in the build scripts (the same forms the Java detector reads).
 * Each declaration is matched against the rules whose Package URL it names. A declaration matches the
 * first rule whose VERS range contains its version. A rule whose VERS is malformed, or whose Package
 * URL cannot be read, is skipped and does not hide a later rule.
 *
 * Package URLs:
 * - a string-notation dependency `group:artifact:version` is `pkg:maven/<group>/<artifact>`,
 *   via `formatPurl`;
 * - an SDK setting is `pkg:generic/android/<kind>` (`compileSdk`, `minSdk`, `targetSdk`,
 *   `buildToolsVersion`), so a `targetSdk` rule uses the same `pkg:generic/android/targetSdk`
 *   the target-SDK importer drafts;
 * - an Android Gradle Plugin pin, in settings or the `agp` catalog key, is `pkg:generic/android/agp`;
 * - `org.jetbrains.kotlin.android` in settings is `pkg:generic/android/kotlin-android`;
 * - the catalog `kotlin` key is `pkg:generic/android/kotlin`.
 *
 * Bundled rules today cover Google Play Billing Library majors only. An SDK, plugin, or catalog pin
 * with no rule is not a finding. Gradle is never run and nothing is fetched.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 2000;
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  ".gradle",
  ".venv",
  "venv",
  "fixtures",
  "__fixtures__",
  "testdata",
]);
const BUILD_FILES = new Set(["build.gradle", "build.gradle.kts"]);
const SETTINGS_FILES = new Set(["settings.gradle", "settings.gradle.kts"]);
const CATALOG_FILE = "libs.versions.toml";

function androidGeneric(name: string): string {
  return formatPurl({ type: "generic", namespace: "android", name });
}

const SDK_PURL: Record<AndroidSdkKind, string> = {
  compileSdk: androidGeneric("compileSdk"),
  minSdk: androidGeneric("minSdk"),
  targetSdk: androidGeneric("targetSdk"),
  buildToolsVersion: androidGeneric("buildToolsVersion"),
};

const SETTINGS_PURL: Record<AndroidSettingsPluginKind, string> = {
  agp: androidGeneric("agp"),
  "kotlin-android": androidGeneric("kotlin-android"),
};

const CATALOG_PURL: Record<AndroidVersionCatalogKind, string> = {
  agp: androidGeneric("agp"),
  kotlin: androidGeneric("kotlin"),
};

async function androidFiles(root: string): Promise<string[]> {
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
      } else if (
        entry.isFile() &&
        (BUILD_FILES.has(entry.name) || SETTINGS_FILES.has(entry.name) || entry.name === CATALOG_FILE)
      ) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0);
  return files;
}

/** The rules of a registry grouped by their canonical Package URL identity; an unreadable purl is skipped. */
function rulesByPurl(rules: readonly RegistryV2Rule[]): Map<string, RegistryV2Rule[]> {
  const grouped = new Map<string, RegistryV2Rule[]>();
  for (const rule of rules) {
    let key: string;
    try {
      key = purlIdentity(rule.purl);
    } catch {
      continue;
    }
    const existing = grouped.get(key);
    if (existing) existing.push(rule);
    else grouped.set(key, [rule]);
  }
  return grouped;
}

/**
 * The first rule whose VERS range contains the version. A rule with a malformed VERS is skipped,
 * so it cannot hide a later rule.
 */
function firstMatchingRule(rules: readonly RegistryV2Rule[], version: string): RegistryV2Rule | undefined {
  for (const rule of rules) {
    try {
      if (versContains(rule.vers, version)) return rule;
    } catch {
      continue;
    }
  }
  return undefined;
}

interface Candidate {
  path: string;
  line: number;
  purl: string;
  version: string;
  subject: string;
}

function candidatesFromBuildGradle(path: string, contents: string): Candidate[] {
  const candidates: Candidate[] = [];
  for (const declaration of parseAndroidBuildGradle(contents)) {
    candidates.push({
      path,
      line: declaration.line,
      purl: SDK_PURL[declaration.kind],
      version: declaration.value,
      subject: `${declaration.kind} ${declaration.value}`,
    });
  }
  for (const declaration of parseGradle(contents)) {
    if (declaration.kind !== "dependency") continue;
    let purl: string;
    try {
      purl = formatPurl({ type: "maven", namespace: declaration.group, name: declaration.artifact });
    } catch {
      continue;
    }
    candidates.push({
      path,
      line: declaration.line,
      purl,
      version: declaration.version,
      subject: `${declaration.group}:${declaration.artifact}:${declaration.version}`,
    });
  }
  return candidates;
}

function candidatesFromSettingsGradle(path: string, contents: string): Candidate[] {
  return parseAndroidSettingsGradle(contents).map((declaration) => {
    const subject =
      declaration.kind === "agp"
        ? `Android Gradle Plugin ${declaration.value}`
        : `Kotlin Android plugin ${declaration.value}`;
    return {
      path,
      line: declaration.line,
      purl: SETTINGS_PURL[declaration.kind],
      version: declaration.value,
      subject,
    };
  });
}

function candidatesFromVersionCatalog(path: string, contents: string): Candidate[] {
  return parseAndroidLibsVersionsToml(contents).map((declaration) => {
    const subject =
      declaration.kind === "agp"
        ? `version catalog agp ${declaration.value}`
        : `version catalog kotlin ${declaration.value}`;
    return {
      path,
      line: declaration.line,
      purl: CATALOG_PURL[declaration.kind],
      version: declaration.value,
      subject,
    };
  });
}

/** Collect every declaration this detector can match from one repository file. */
function candidatesFromFile(path: string, name: string, contents: string): Candidate[] {
  if (BUILD_FILES.has(name)) return candidatesFromBuildGradle(path, contents);
  if (SETTINGS_FILES.has(name)) return candidatesFromSettingsGradle(path, contents);
  if (name === CATALOG_FILE) return candidatesFromVersionCatalog(path, contents);
  return [];
}

async function collectCandidates(root: string): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  for (const file of await androidFiles(root)) {
    let contents: string;
    try {
      if ((await stat(file)).size > MAXIMUM_INPUT_BYTES) continue;
      contents = await readFile(file, "utf8");
    } catch {
      continue;
    }
    candidates.push(...candidatesFromFile(relativePosix(root, file), basename(file), contents));
  }
  return candidates;
}

function matchCandidates(
  candidates: readonly Candidate[],
  byPurl: Map<string, RegistryV2Rule[]>,
): { findings: DetectorFinding[]; withUsage: Array<{ id: string; rule: RegistryV2Rule }> } {
  const findings: DetectorFinding[] = [];
  const withUsage: Array<{ id: string; rule: RegistryV2Rule }> = [];
  for (const candidate of candidates) {
    const rule = firstMatchingRule(byPurl.get(candidate.purl) ?? [], candidate.version);
    if (!rule) continue;
    const id = `${rule.id}:${candidate.path}:${candidate.line}`;
    findings.push({
      id,
      ruleId: rule.id,
      title: rule.title,
      summary: `${candidate.path} declares ${candidate.subject}. ${rule.summary}`,
      severity: rule.severity,
      location: { path: candidate.path, line: candidate.line },
      ...(rule.replacement ? { replacement: rule.replacement } : {}),
      ...(rule.deadline ? { deadline: rule.deadline } : {}),
      ...(rule.migration ? { migration: rule.migration } : {}),
      sources: rule.sources,
    });
    if ((rule.usage ?? []).length > 0) withUsage.push({ id, rule });
  }
  return { findings, withUsage };
}

async function attachSourceUsage(
  root: string,
  findings: DetectorFinding[],
  withUsage: Array<{ id: string; rule: RegistryV2Rule }>,
): Promise<void> {
  if (withUsage.length === 0) return;
  const contracts = withUsage.map((item) => ({ id: item.id, matchers: item.rule.usage ?? [] }));
  const analyses = new Map(
    (await analyzeSourceUsage(root, contracts)).map((analysis) => [analysis.contractId, analysis]),
  );
  for (const finding of findings) {
    const analysis = analyses.get(finding.id);
    if (analysis) Object.assign(finding, { usages: analysis.usages, impact: analysis.impact });
  }
}

function sortFindings(findings: DetectorFinding[]): void {
  findings.sort((left, right) => {
    if (left.location.path !== right.location.path) return left.location.path < right.location.path ? -1 : 1;
    return (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id);
  });
}

export class AndroidDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "android";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: [
      "build.gradle",
      "build.gradle.kts",
      "settings.gradle",
      "settings.gradle.kts",
      "libs.versions.toml",
    ],
    sourceExtensions: [".java", ".kt"],
  };

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/android.json`. */
  constructor(
    private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () =>
      validateRegistryV2(await loadDataFile("registry/android.json")).rules,
  ) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const candidates = await collectCandidates(context.root);
    if (candidates.length === 0) return { findings: [], unclassified: [] };

    const { findings, withUsage } = matchCandidates(candidates, rulesByPurl(await this.loadRules()));
    await attachSourceUsage(context.root, findings, withUsage);
    sortFindings(findings);
    return { findings, unclassified: [] };
  }
}

export const androidDetector = new AndroidDetector();

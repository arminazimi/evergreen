import type { ScanResult } from "./domain.js";
import { parsePurl, PurlError } from "./purl.js";
import type { RegistryV2Rule } from "./registry.js";

/**
 * PURL types Evergreen can map to a Dependabot `package-ecosystem`. The `generic` type (runtime
 * pins such as Node.js and Python) has no Dependabot equivalent, so runtime findings are skipped.
 */
const PACKAGE_ECOSYSTEM_BY_PURL_TYPE: Record<string, string> = {
  npm: "npm",
  pypi: "pip",
  golang: "gomod",
  cargo: "cargo",
  maven: "maven",
  nuget: "nuget",
  gem: "bundler",
  composer: "composer",
  pub: "pub",
  swift: "swift",
  docker: "docker",
  github: "github-actions",
};

/** The Dependabot registry words a `pattern` may carry; anything else is prose and is skipped. */
const DEPENDABOT_NAME = /^[\w@+.:/-]+$/;

/** One `updates` entry for a `.github/dependabot.yml`. Evergreen prints it; it never writes the file. */
export interface DependabotUpdateEntry {
  packageEcosystem: string;
  directory: string;
  /** PURL identities found in this ecosystem and directory, sorted and unique. Empty for ecosystems with only runtime findings. */
  patterns: string[];
}

/** Each `updates` entry groups its deprecated packages under this name. */
export const DEPENDABOT_GROUP_NAME = "evergreen-deprecated-packages";

/**
 * The `.github/dependabot.yml` directory for a repository-relative file path (`/`, or the parent).
 * Dependabot scans `/` for `.github/workflows` itself, so every workflow finding maps to `/`;
 * findings elsewhere keep their parent path, including composite actions under `.github/actions`.
 */
export function dependabotDirectory(path: string): string {
  if (path === ".github/workflows" || path.startsWith(".github/workflows/")) return "/";
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash);
  return dir === "" ? "/" : `/${dir}`;
}

/** The package name Dependabot matches for a PURL identity (`org:name`, `@scope/name`, or `name`). */
export function dependabotPackageName(purl: string): string | undefined {
  try {
    const parsed = parsePurl(purl);
    if (parsed.type === "maven" && parsed.namespace) {
      return `${parsed.namespace}:${parsed.name}`;
    }
    return parsed.namespace ? `${parsed.namespace}/${parsed.name}` : parsed.name;
  } catch (error) {
    if (error instanceof PurlError) return undefined;
    throw error;
  }
}

function compareEntry(left: DependabotUpdateEntry, right: DependabotUpdateEntry): number {
  const byEcosystem = left.packageEcosystem.localeCompare(right.packageEcosystem);
  return byEcosystem !== 0 ? byEcosystem : left.directory.localeCompare(right.directory);
}

/**
 * The Gradle build files a finding can sit on. They map to the `gradle` package-ecosystem even
 * though the registry rules use Maven-style PURLs; other JVM findings stay on `maven`.
 */
const GRADLE_FILE_NAMES = new Set(["build.gradle", "build.gradle.kts", "libs.versions.toml"]);

function combineEntry(packageEcosystem: string, directory: string, entries: Map<string, { packageEcosystem: string; directory: string; patterns: Set<string> }>): Set<string> {
  const key = `${packageEcosystem}\0${directory}`;
  if (!entries.has(key)) {
    entries.set(key, { packageEcosystem, directory, patterns: new Set<string>() });
  }
  return entries.get(key)!.patterns;
}

/**
 * The Dependabot `package-ecosystem` for a finding: Gradle build files override the Maven-style
 * PURL type they are registered under, `pom.xml` stays `maven`, and the rest map by PURL type.
 */
function packageEcosystemFor(purl: string, path: string): string | undefined {
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  if (GRADLE_FILE_NAMES.has(fileName)) return "gradle";
  if (fileName === "pom.xml") return "maven";
  try {
    return PACKAGE_ECOSYSTEM_BY_PURL_TYPE[parsePurl(purl).type];
  } catch (error) {
    if (error instanceof PurlError) return undefined;
    throw error;
  }
}

/**
 * Builds Dependabot `updates` entries from a scan. Each mapped ecosystem and directory an
 * ecosystem finding points at gets a weekly entry whose `patterns` group the deprecated packages,
 * so the review stays in one grouped pull request per directory. Output is deterministic.
 */
export function buildDependabotUpdates(result: ScanResult, rules: readonly RegistryV2Rule[]): DependabotUpdateEntry[] {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const entries = new Map<string, { packageEcosystem: string; directory: string; patterns: Set<string> }>();

  for (const finding of result.findings) {
    const rule = byId.get(finding.ruleId);
    if (!rule) continue;
    const packageEcosystem = packageEcosystemFor(rule.purl, finding.location.path);
    if (!packageEcosystem) continue;
    const directory = dependabotDirectory(finding.location.path);
    const patterns = combineEntry(packageEcosystem, directory, entries);
    const name = dependabotPackageName(rule.purl);
    if (name && DEPENDABOT_NAME.test(name)) patterns.add(name);
  }

  return [...entries.values()]
    .map(({ packageEcosystem, directory, patterns }) => ({
      packageEcosystem,
      directory,
      patterns: [...patterns].sort((left, right) => left.localeCompare(right)),
    }))
    .sort(compareEntry);
}

/** Renders the Dependabot config as YAML; an empty scan prints comments only, never a bare `updates: []`. */
export function renderDependabotConfig(entries: readonly DependabotUpdateEntry[]): string {
  const lines = [
    "# Generated by Evergreen from repository lifecycle findings.",
    "# Review before merging into .github/dependabot.yml; Evergreen does not edit files.",
  ];
  if (entries.length === 0) {
    lines.push("# Nothing was found in this scan: no deprecated packages with a mapped");
    lines.push("# package-ecosystem, so there is no updates entry to copy. Dependabot");
    lines.push("# requires at least one entry, so keep your existing dependabot.yml.");
    return `${lines.join("\n")}\n`;
  }
  lines.push("version: 2");
  lines.push("updates:");
  for (const { packageEcosystem, directory, patterns } of entries) {
    lines.push(`  - package-ecosystem: ${packageEcosystem}`);
    lines.push(`    directory: "${directory}"`);
    lines.push("    schedule:");
    lines.push("      interval: weekly");
    if (patterns.length > 0) {
      lines.push("    groups:");
      lines.push(`      ${DEPENDABOT_GROUP_NAME}:`);
      lines.push("        applies-to: version-updates");
      lines.push("        patterns:");
      for (const pattern of patterns) lines.push(`          - "${pattern}"`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** One call that a CLI command makes: scan in, `.github/dependabot.yml` text out. */
export function buildDependabotConfig(result: ScanResult, rules: readonly RegistryV2Rule[]): string {
  return renderDependabotConfig(buildDependabotUpdates(result, rules));
}

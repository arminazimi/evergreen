import type { Finding } from "./domain.js";
import { parsePurl, PurlError } from "./purl.js";
import type { RegistryV2Rule } from "./registry.js";

/** Renovate's published JSON Schema URL. Presets that include it validate with renovate-config-validator. */
export const RENOVATE_SCHEMA = "https://docs.renovatebot.com/renovate-schema.json";

/**
 * PURL types Evergreen can map to a Renovate datasource. Types without a mapping (for example
 * `generic` runtimes) are handled as runtime pins instead of package replacements.
 */
const DATASOURCE_BY_PURL_TYPE: Record<string, string> = {
  npm: "npm",
  pypi: "pypi",
  cargo: "crate",
  golang: "go",
  maven: "maven",
  nuget: "nuget",
  gem: "rubygems",
  composer: "packagist",
  github: "github-tags",
  docker: "docker",
};

/** A package name Renovate can put in `matchPackageNames` or `replacementName` (npm-style, lowercase). */
const PACKAGE_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

export interface RenovatePackageRule {
  description: string;
  matchDatasources: string[];
  matchPackageNames: string[];
  replacementName?: string;
  allowedVersions?: string;
}

/** A Renovate config fragment. Evergreen prints it; it never writes renovate.json. */
export interface RenovatePreset {
  $schema: typeof RENOVATE_SCHEMA;
  description: string;
  packageRules: RenovatePackageRule[];
}

/** True when `value` is a registry package name Renovate can replace to, not prose guidance. */
export function isRenovatePackageName(value: string): boolean {
  return PACKAGE_NAME.test(value);
}

/** Dependency name Renovate matches for a PURL identity (`@scope/name` or `name`). */
export function renovatePackageName(purl: string): string | undefined {
  try {
    const parsed = parsePurl(purl);
    return parsed.namespace ? `${parsed.namespace}/${parsed.name}` : parsed.name;
  } catch (error) {
    if (error instanceof PurlError) return undefined;
    throw error;
  }
}

function datasourceFor(purl: string): string | undefined {
  try {
    return DATASOURCE_BY_PURL_TYPE[parsePurl(purl).type];
  } catch (error) {
    if (error instanceof PurlError) return undefined;
    throw error;
  }
}

/** Minimum allowed runtime from prose such as `Node.js 22 LTS or later`. */
function nodeFloor(replacement: string): string | undefined {
  const match = /Node\.js\s+(\d+(?:\.\d+)*)/i.exec(replacement);
  return match?.[1] === undefined ? undefined : `>=${match[1]}`;
}

/**
 * Next supported Python line after an end-of-life ceiling such as `3.9` → `>=3.10.0`.
 * Used when the rule's replacement is prose without a version number.
 */
function pythonFloorFromMaximum(maximumVersion: unknown): string | undefined {
  if (typeof maximumVersion !== "string" || !/^\d+(?:\.\d+)*$/.test(maximumVersion)) return undefined;
  const parts = maximumVersion.split(".").map(Number);
  if (parts.some((part) => !Number.isInteger(part))) return undefined;
  if (parts.length === 1) return `>=${parts[0]! + 1}`;
  const next = [...parts];
  next[next.length - 1] = next[next.length - 1]! + 1;
  while (next.length < 3) next.push(0);
  return `>=${next.join(".")}`;
}

function compareVersionFloors(left: string, right: string): number {
  const parse = (value: string): number[] =>
    value.replace(/^>=/, "").split(".").map((part) => Number(part) || 0);
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function ruleKey(rule: RenovatePackageRule): string {
  return `${rule.matchDatasources[0] ?? ""}\0${rule.matchPackageNames[0] ?? ""}\0${rule.replacementName ?? ""}\0${rule.allowedVersions ?? ""}`;
}

/**
 * Builds a Renovate preset from scan findings. Package findings with a package-name replacement
 * become `replacementName` rules; Node.js and Python runtime findings become `allowedVersions`
 * pins. Prose replacements and unknown PURLs are skipped. Output is deterministic.
 */
export function buildRenovatePreset(
  findings: readonly Finding[],
  rules: readonly RegistryV2Rule[],
): RenovatePreset {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const replacements = new Map<string, RenovatePackageRule>();
  const runtimes = new Map<string, RenovatePackageRule>();

  for (const finding of findings) {
    const rule = byId.get(finding.ruleId);
    if (!rule) continue;
    const replacement = finding.replacement ?? rule.replacement;

    if (rule.purl === "pkg:generic/nodejs" || rule.id.startsWith("nodejs.runtime.")) {
      if (!replacement) continue;
      const allowedVersions = nodeFloor(replacement);
      if (!allowedVersions) continue;
      const key = "node-version\0node";
      const existing = runtimes.get(key);
      if (!existing || compareVersionFloors(allowedVersions, existing.allowedVersions!) > 0) {
        runtimes.set(key, {
          description: `Evergreen: keep Node.js on a supported release (${finding.ruleId})`,
          matchDatasources: ["node-version"],
          matchPackageNames: ["node"],
          allowedVersions,
        });
      }
      continue;
    }

    if (rule.purl === "pkg:generic/python" || rule.id.startsWith("python.runtime.")) {
      const extension = rule["x-python"];
      const allowedVersions = pythonFloorFromMaximum(extension?.maximumVersion);
      if (!allowedVersions) continue;
      const key = "docker\0python";
      const existing = runtimes.get(key);
      if (!existing || compareVersionFloors(allowedVersions, existing.allowedVersions!) > 0) {
        runtimes.set(key, {
          description: `Evergreen: keep Python on a supported release (${finding.ruleId})`,
          matchDatasources: ["docker"],
          matchPackageNames: ["python"],
          allowedVersions,
        });
      }
      continue;
    }

    if (!replacement || !isRenovatePackageName(replacement)) continue;
    const datasource = datasourceFor(rule.purl);
    const packageName = renovatePackageName(rule.purl);
    if (!datasource || !packageName || packageName === replacement) continue;
    const key = `${datasource}\0${packageName}`;
    if (replacements.has(key)) continue;
    replacements.set(key, {
      description: `Evergreen: replace ${packageName} (${finding.ruleId})`,
      matchDatasources: [datasource],
      matchPackageNames: [packageName],
      replacementName: replacement,
    });
  }

  const packageRules = [...replacements.values(), ...runtimes.values()].sort((left, right) =>
    ruleKey(left).localeCompare(ruleKey(right)));

  return {
    $schema: RENOVATE_SCHEMA,
    description:
      "Generated by Evergreen from repository lifecycle findings. Review before merging into renovate.json; Evergreen does not edit config files.",
    packageRules,
  };
}

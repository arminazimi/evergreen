import semver from "semver";

import { loadDataFile } from "@velella/ebb/data-source";
import type { DeprecationRule, SourceUsage, UsageMatcher } from "../../domain.js";
import { relativePosix } from "../../paths.js";
import { required } from "../../required.js";
import { loadRegistryRules, withoutSymbolRules } from "@velella/ebb/registry";
import { isDeprecationRule, isUsageMatcher } from "../../sdk.js";
import type { DetectorFinding, RegistryDefinition } from "../../sdk.js";
import { impactFor } from "../../source-usage.js";
import { parseVers, versContains } from "@velella/ebb/vers/index";
import { usagesOwnedBy } from "../../workspaces.js";
import { shortestDependencyPath } from "./dependency-graph.js";
import { declarationLine, declaredDependencies } from "./manifest.js";
import type { NpmProject } from "./project.js";
import type { NodeRule } from "./runtime.js";

export interface PackageRule extends DeprecationRule {
  vers?: string;
  package: string;
  usage?: UsageMatcher[];
}

export interface MatchedPackageRule {
  rule: PackageRule;
  project: NpmProject;
  range: string;
  section: string;
  via?: string[];
}

async function loadRegistry<Rule>(path: string, definition: RegistryDefinition<Rule>): Promise<readonly Rule[]> {
  const data = withoutSymbolRules(await loadDataFile(path));
  const loaded = loadRegistryRules(data, definition).rules;
  if (path !== "registry/npm.json" || typeof data !== "object" || data === null || !("rules" in data)) return loaded;
  const versions = new Map((data.rules as Array<{ id: string; vers?: string }>).map((rule) => [rule.id, rule.vers]));
  return loaded.map((rule) => ({ ...rule, vers: versions.get((rule as PackageRule).id) }));
}

function declaredVersionsAffected(vers: string, declared: string): boolean {
  const parsed = parseVers(vers);
  if (parsed.all) return true;
  const alternatives = parsed.constraints.filter((item) => item.comparator === "=").map((item) => item.version);
  const bounds = parsed.constraints.filter((item) => item.comparator !== "=" && item.comparator !== "!=");
  for (let index = 0; index < bounds.length; index++) {
    const bound = required(bounds[index], "constraint bound");
    if (bound.comparator.startsWith("<")) {
      alternatives.push(`${bound.comparator}${bound.version}`);
    } else {
      const next = bounds[index + 1];
      alternatives.push(`${bound.comparator}${bound.version}${next ? ` ${next.comparator}${next.version}` : ""}`);
      if (next) index++;
    }
  }
  let ranges = alternatives.length === 0 && bounds.length === 0 ? ["*"] : alternatives;
  for (const excluded of parsed.constraints.filter((item) => item.comparator === "!=")) {
    ranges = ranges.flatMap((range) => [`${range} <${excluded.version}`, `${range} >${excluded.version}`]);
  }
  return ranges.some((range) => semver.intersects(declared, range));
}

export function loadPackageRules(): Promise<readonly PackageRule[]> {
  return loadRegistry("registry/npm.json", {
    schemaVersion: "evergreen.npm-registry.v1",
    isRule: (value): value is PackageRule =>
      isDeprecationRule(value) &&
      typeof (value as Partial<PackageRule>).package === "string" &&
      ((value as Partial<PackageRule>).usage === undefined ||
        ((value as Partial<PackageRule>).usage?.every(isUsageMatcher) ?? false)),
  });
}

export function loadNodeRules(): Promise<readonly NodeRule[]> {
  return loadRegistry("registry/nodejs.json", {
    schemaVersion: "evergreen.nodejs-registry.v1",
    isRule: (value): value is NodeRule =>
      isDeprecationRule(value) &&
      (typeof (value as Partial<NodeRule>).major === "number" ||
        typeof (value as Partial<NodeRule>).maximumMajor === "number"),
  });
}

/** A declared dependency matches when its resolved (or, absent a lock, declared) versions fall in the rule's range. */
function declaredDependencyAffected(project: NpmProject, rulePackage: string, vers: string, range: string): boolean {
  const declaredRange = semver.validRange(range);
  if (!declaredRange) return false;
  const resolved = [...(project.resolved.get(rulePackage) ?? [])].filter((version) =>
    semver.satisfies(version, declaredRange),
  );
  return resolved.length > 0
    ? resolved.some((version) => versContains(vers, version))
    : declaredVersionsAffected(vers, declaredRange);
}

/** Not declared here: report it when a lockfile shows a declared dependency pulling it in, with that path. */
function transitiveMatch(
  project: NpmProject,
  rule: PackageRule,
  vers: string | undefined,
  declared: Map<string, { range: string; section: string }>,
): MatchedPackageRule | undefined {
  const via = shortestDependencyPath(project.graph, declared.keys(), rule.package);
  const versions = [...(project.resolved.get(rule.package) ?? [])];
  if (!via || versions.length === 0) return undefined;
  if (vers && !parseVers(vers).all && !versions.some((version) => versContains(vers, version))) return undefined;
  const root = required(declared.get(required(via[0], "dependency path")), "direct dependency");
  return { rule, project, range: root.range, section: root.section, via };
}

export function matchPackageRules(project: NpmProject, packageRules: readonly PackageRule[]): MatchedPackageRule[] {
  const declared = declaredDependencies(project.manifest);
  const matched: MatchedPackageRule[] = [];
  for (const { vers, ...rule } of packageRules) {
    const dependency = declared.get(rule.package);
    if (!dependency) {
      const transitive = transitiveMatch(project, rule, vers, declared);
      if (transitive) matched.push(transitive);
      continue;
    }
    if (vers && !parseVers(vers).all && !declaredDependencyAffected(project, rule.package, vers, dependency.range))
      continue;
    matched.push({ rule, project, range: dependency.range, section: dependency.section });
  }
  return matched;
}

export function matchedRuleFinding(
  root: string,
  { rule, project, range, section, via }: MatchedPackageRule,
  usagesByRule: Map<string, SourceUsage[]>,
  projectDirectories: string[],
): DetectorFinding {
  const resolved = [...(project.resolved.get(rule.package) ?? [])].sort(semver.compare);
  const resolvedText = resolved.length > 0 ? resolved.join(", ") : "not found in a supported lockfile";
  const line = declarationLine(project.contents, section, via?.[0] ?? rule.package);
  const path = relativePosix(root, project.manifestPath);
  // Each project reports the usages inside its own directory; the root keeps the ones outside every workspace.
  const usages = usagesOwnedBy(required(usagesByRule.get(rule.id), "usage"), project.directory, projectDirectories);
  return {
    id: `${rule.id}:${path}:${line}`,
    ruleId: rule.id,
    title: rule.title,
    summary: via
      ? `${rule.package} is not declared directly; ${via[0]} (declared in ${section} as ${range}) pulls it in; resolved: ${resolvedText}. ${rule.summary}`
      : `${rule.package} is declared in ${section} as ${range}; resolved: ${resolvedText}. ${rule.summary}`,
    severity: rule.severity,
    confidence: resolved.length > 0 ? "inferred-from-lock" : "range",
    location: { path, line },
    ...(via ? { dependencyPath: via } : {}),
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.requires ? { requires: rule.requires } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
    usages,
    impact: impactFor(usages),
  };
}

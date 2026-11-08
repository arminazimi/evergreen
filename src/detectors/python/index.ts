import type { Severity, SourceUsage } from "../../domain.js";
import { relativePosix } from "../../paths.js";
import { required } from "../../required.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { analyzeSourceUsage, impactFor } from "../../source-usage.js";
import { parseVersLenient, versContains } from "@velella/ebb/vers/index";
import { discoverPythonWorkspaces, usagesOwnedBy } from "../../workspaces.js";

import { scanProject, shareRootLockfile } from "./project.js";
import { loadRules } from "./rules.js";
import { normalizePackageName } from "./shared.js";
import type {
  Declaration,
  DirectDependency,
  ProjectScan,
  PythonPackageRule,
  PythonRule,
  PythonRuntimeRule,
} from "./types.js";

function versionPair(value: string): [major: number, minor: number] | undefined {
  const match = /(?:python[-_ ]*)?(\d+)\.(\d+)/i.exec(value);
  return match?.[1] && match[2] ? [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10)] : undefined;
}

function unsupportedVersion(value: string, maximumVersion: string): [major: number, minor: number] | undefined {
  const lowerBounds = [...value.matchAll(/(?:^|,)\s*(?:>=|>|~=|===?|\^|~)?\s*(\d+)\.(\d+)/g)]
    .map((match) =>
      match[1] && match[2] ? ([Number.parseInt(match[1], 10), Number.parseInt(match[2], 10)] as const) : undefined,
    )
    .filter((pair): pair is readonly [number, number] => pair !== undefined);
  const candidate =
    lowerBounds.sort((left, right) => (left[0] === right[0] ? right[1] - left[1] : right[0] - left[0]))[0] ??
    (/^python-\d+\.\d+(?:\.\d+)?$/i.test(value) ? versionPair(value) : undefined);
  const maximum = versionPair(maximumVersion);
  if (!candidate || !maximum) return undefined;
  return candidate[0] < maximum[0] || (candidate[0] === maximum[0] && candidate[1] <= maximum[1])
    ? [candidate[0], candidate[1]]
    : undefined;
}

/**
 * A scheduled line is reported only for a declaration that stays on exactly that line: a pinned runtime, or a
 * range with an upper bound. `>=3.11` merely allows it, so it is not a problem with the declaration.
 */
export function staysOnScheduledLine(declaration: { kind: string; value: string }, line: [number, number]): boolean {
  if (
    declaration.kind === "compatibility range" &&
    !/(?:^|,)\s*(?:>=|>|~=|===?|\^|~)?\s*\d+\.\d+/.test(declaration.value)
  )
    return false;
  const pair = versionPair(declaration.value);
  if (!pair || pair[0] !== line[0] || pair[1] !== line[1]) return false;
  return declaration.kind === "pinned runtime" || /(?:<|==)/.test(declaration.value);
}

/** True when a version is inside a rule's VERS range. A version the scheme cannot read is not a match. */
function versionMatches(range: string, version: string): boolean {
  try {
    return versContains(range, version);
  } catch {
    return false;
  }
}

/**
 * A package rule that covers every version matches a declaration of the package. A rule with a bounded
 * `vers` matches only a version Evergreen can see: a lockfile entry or an exact pin. A declared range such
 * as `>=3.2` is not a pin, so it does not match (as for the Ruby and PHP detectors).
 */
function coversDependency(rule: PythonPackageRule, project: ProjectScan): boolean {
  const range = rule.vers;
  if (range === undefined || parseVersLenient(range).all) return true;
  const versions = project.resolved.get(normalizePackageName(rule.package)) ?? new Set<string>();
  return [...versions].some((version) => versionMatches(range, version));
}

/**
 * Each runtime rule reads "Python X.Y and older". A declaration is reported by the narrowest rule that
 * covers the release line it names, so a 3.8 or 3.9 declaration keeps its existing finding and a 3.10
 * declaration gets the newer rule, instead of every declaration matching only the first rule.
 */
function sortedRuntimeRules(rules: readonly PythonRule[]): PythonRuntimeRule[] {
  return rules
    .filter((rule): rule is PythonRuntimeRule => rule.kind === "runtime")
    .sort((left, right) => {
      const [leftMajor = 0, leftMinor = 0] = versionPair(left.maximumVersion) ?? [];
      const [rightMajor = 0, rightMinor = 0] = versionPair(right.maximumVersion) ?? [];
      return leftMajor - rightMajor || leftMinor - rightMinor;
    });
}

/** The release line a rule reports for a declaration, or undefined when the rule does not cover it. */
function coveredVersion(declaration: Declaration, rule: PythonRuntimeRule): number[] | undefined {
  const line = versionPair(rule.maximumVersion);
  if (!rule.scheduled) return unsupportedVersion(declaration.value, rule.maximumVersion);
  return line && staysOnScheduledLine(declaration, line) ? line : undefined;
}

function runtimeFinding(
  root: string,
  declaration: Declaration,
  rule: PythonRuntimeRule,
  version: number[],
): DetectorFinding {
  const severity: Severity = declaration.kind === "pinned runtime" ? rule.severity : "medium";
  const path = relativePosix(root, declaration.path);
  return {
    id: `${rule.id}:${path}:${declaration.line}${declaration.identity ? `:${declaration.identity}` : ""}`,
    ruleId: rule.id,
    title: rule.title,
    summary: `${declaration.kind} ${declaration.value} includes Python ${version.join(".")}. ${rule.summary}`,
    severity,
    location: { path, line: declaration.line },
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
  };
}

function runtimeFindings(root: string, rules: readonly PythonRule[], projects: ProjectScan[]): DetectorFinding[] {
  const runtimeRules = sortedRuntimeRules(rules);
  const findings: DetectorFinding[] = [];
  for (const declaration of projects.flatMap((project) => project.declarations)) {
    for (const rule of runtimeRules) {
      const version = coveredVersion(declaration, rule);
      if (!version) continue;
      findings.push(runtimeFinding(root, declaration, rule, version));
      break;
    }
  }
  return findings;
}

function packageFinding(
  root: string,
  rule: PythonPackageRule,
  dependency: DirectDependency,
  resolved: string[],
  owned: SourceUsage[],
): DetectorFinding {
  return {
    id: `${rule.id}:${relativePosix(root, dependency.path)}:${dependency.line}`,
    ruleId: rule.id,
    title: rule.title,
    summary: `${dependency.name} is declared as ${dependency.constraint || "unconstrained"}; resolved: ${resolved.length > 0 ? resolved.join(", ") : "not found in a supported lockfile"}. ${rule.summary}`,
    severity: rule.severity,
    location: {
      path: relativePosix(root, dependency.path),
      line: dependency.line,
    },
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.requires ? { requires: rule.requires } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
    usages: owned,
    impact: impactFor(owned),
  };
}

async function packageFindings(
  root: string,
  rules: readonly PythonRule[],
  projects: ProjectScan[],
): Promise<DetectorFinding[]> {
  const matchedPackageRules = rules.filter(
    (rule): rule is PythonPackageRule =>
      rule.kind === "package" &&
      projects.some(
        (project) => project.dependencies.has(normalizePackageName(rule.package)) && coversDependency(rule, project),
      ),
  );
  const usageAnalyses = await analyzeSourceUsage(
    root,
    matchedPackageRules.map((rule) => ({ id: rule.id, matchers: rule.usage ?? [] })),
  );
  const usages = new Map(usageAnalyses.map((analysis) => [analysis.contractId, analysis.usages]));
  const projectDirectories = projects.map((project) => project.directory);

  const findings: DetectorFinding[] = [];
  for (const project of projects) {
    for (const rule of matchedPackageRules) {
      const dependency = project.dependencies.get(normalizePackageName(rule.package));
      if (!dependency || !coversDependency(rule, project)) continue;
      const resolved = [...(project.resolved.get(dependency.name) ?? [])].sort();
      // Each project reports the usages inside its own directory; the root keeps the ones outside every member.
      const owned = usagesOwnedBy(required(usages.get(rule.id), "usage"), project.directory, projectDirectories);
      findings.push(packageFinding(root, rule, dependency, resolved, owned));
    }
  }
  return findings;
}

export class PythonDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "python";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: [
      "pyproject.toml",
      ".python-version",
      "runtime.txt",
      ".tool-versions",
      "setup.cfg",
      "setup.py",
      "tox.ini",
      "uv.lock",
      "poetry.lock",
      "pdm.lock",
      "Pipfile.lock",
      "requirements*.txt",
    ],
    sourceExtensions: [".py", ".ini", ".cfg"],
  };

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    const memberDirectories = await discoverPythonWorkspaces(context.root);
    // The root project is "", each uv workspace member is its relative directory.
    const projects: ProjectScan[] = [];
    for (const directory of ["", ...memberDirectories]) {
      const project = await scanProject(context.root, directory);
      if (project) projects.push(project);
    }
    if (projects.length === 0) return [];

    await shareRootLockfile(context.root, projects);
    const rules = await loadRules();
    return [
      ...runtimeFindings(context.root, rules, projects),
      ...(await packageFindings(context.root, rules, projects)),
    ];
  }
}

export const pythonDetector = new PythonDetector();

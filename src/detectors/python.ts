import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { parse as parseToml } from "smol-toml";

import { relativePosix } from "../paths.js";
import type { DeprecationRule, Severity, UsageMatcher } from "../domain.js";
import { loadDataFile } from "../data-source.js";
import { analyzeSourceUsage, impactFor } from "../source-usage.js";
import { discoverPythonWorkspaces, usagesOwnedBy } from "../workspaces.js";
import {
  DETECTOR_API_VERSION,
  isDeprecationRule,
  isUsageMatcher,
} from "../sdk.js";
import { loadRegistryRules, validateRegistryV2, withoutSymbolRules } from "../registry.js";
import type { Detector, DetectorContext, DetectorFinding, DetectorInputs } from "../sdk.js";
import { parseVersLenient, versContains } from "../vers/index.js";

interface PythonRuntimeRule extends DeprecationRule {
  kind: "runtime";
  maximumVersion: string;
  /** A line with an announced end that has not happened yet (decision 0010): it names exactly that line, not "and older". */
  scheduled?: boolean;
}

interface PythonPackageRule extends DeprecationRule {
  kind: "package";
  package: string;
  usage?: UsageMatcher[];
  /** The rule's VERS range. Absent from the detector view, so `loadRules` attaches it from the v2 rule. */
  vers?: string | undefined;
}

type PythonRule = PythonRuntimeRule | PythonPackageRule;

interface Declaration {
  path: string;
  line: number;
  value: string;
  kind: "compatibility range" | "pinned runtime";
}

interface DirectDependency {
  name: string;
  path: string;
  line: number;
  constraint: string;
}

type ResolvedVersions = Map<string, Set<string>>;

/** One Python project: the root, or a uv workspace member. */
interface ProjectScan {
  directory: string;
  declarations: Declaration[];
  dependencies: Map<string, DirectDependency>;
  resolved: ResolvedVersions;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function normalizePackageName(value: string): string {
  return value.trim().toLowerCase().replace(/[-_.]+/g, "-");
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function lineContaining(contents: string, needle: string): number {
  const normalizedNeedle = needle.toLowerCase();
  const index = contents
    .split(/\r?\n/)
    .findIndex((line) => line.toLowerCase().includes(normalizedNeedle));
  return index === -1 ? 1 : index + 1;
}

function parseRequirement(value: string): { name: string; constraint: string } | undefined {
  const clean = value.trim();
  if (!clean || clean.startsWith("#") || clean.startsWith("-") || /^(?:git\+|https?:)/i.test(clean)) {
    return undefined;
  }
  const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]+\])?\s*(.*)$/.exec(clean);
  if (!match?.[1]) return undefined;
  return {
    name: normalizePackageName(match[1]),
    constraint: (match[2] ?? "").split(";")[0]?.trim() ?? "",
  };
}

function addDependency(
  target: Map<string, DirectDependency>,
  path: string,
  contents: string,
  rawName: string,
  constraint: string,
  explicitLine?: number,
): void {
  const name = normalizePackageName(rawName);
  if (!name || target.has(name)) return;
  target.set(name, {
    name,
    path,
    line: explicitLine ?? lineContaining(contents, rawName),
    constraint,
  });
}

function addRequirementList(
  target: Map<string, DirectDependency>,
  path: string,
  contents: string,
  values: unknown,
  resolved: ResolvedVersions,
): void {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (typeof value !== "string") continue;
    const requirement = parseRequirement(value);
    if (requirement) {
      addDependency(target, path, contents, requirement.name, requirement.constraint);
      addExactPin(resolved, requirement.name, requirement.constraint);
    }
  }
}

function collectPyprojectDependencies(
  path: string,
  contents: string,
  document: UnknownRecord,
  target: Map<string, DirectDependency>,
  resolved: ResolvedVersions,
): void {
  const project = asRecord(document.project);
  addRequirementList(target, path, contents, project?.dependencies, resolved);
  const optional = asRecord(project?.["optional-dependencies"]);
  for (const values of Object.values(optional ?? {})) {
    addRequirementList(target, path, contents, values, resolved);
  }

  const poetry = asRecord(asRecord(document.tool)?.poetry);
  const addPoetryTable = (value: unknown): void => {
    for (const [name, constraint] of Object.entries(asRecord(value) ?? {})) {
      if (normalizePackageName(name) === "python") continue;
      const rendered =
        typeof constraint === "string"
          ? constraint
          : JSON.stringify(asRecord(constraint) ?? constraint);
      addDependency(target, path, contents, name, rendered);
    }
  };
  addPoetryTable(poetry?.dependencies);
  addPoetryTable(poetry?.["dev-dependencies"]);
  for (const group of Object.values(asRecord(poetry?.group) ?? {})) {
    addPoetryTable(asRecord(group)?.dependencies);
  }
}

async function requirementFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isFile() && /^requirements(?:[-_.][A-Za-z0-9_.-]+)?\.txt$/i.test(entry.name),
      )
      .map((entry) => resolve(root, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function collectRequirementsFile(
  path: string,
  contents: string,
  target: Map<string, DirectDependency>,
  resolved: ResolvedVersions,
): void {
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    const requirement = parseRequirement(line);
    if (!requirement) continue;
    addDependency(target, path, contents, requirement.name, requirement.constraint, index + 1);
    addExactPin(resolved, requirement.name, requirement.constraint);
  }
}

/** An exact `==` or `===` pin is a version Evergreen can see, so it counts as resolved. A range is not a pin. */
function addExactPin(resolved: ResolvedVersions, name: string, constraint: string): void {
  const exact = /^===?\s*([^\s,;]+)$/.exec(constraint)?.[1];
  if (exact) addResolved(resolved, name, exact);
}

function addResolved(target: ResolvedVersions, rawName: string, rawVersion: unknown): void {
  if (typeof rawVersion !== "string") return;
  const version = rawVersion.trim().replace(/^[=~<>!^\s]+/, "");
  if (!version) return;
  const name = normalizePackageName(rawName);
  const versions = target.get(name) ?? new Set<string>();
  versions.add(version);
  target.set(name, versions);
}

function collectTomlLock(contents: string, target: ResolvedVersions): void {
  const document = asRecord(parseToml(contents));
  const packages = document?.package ?? document?.packages;
  if (!Array.isArray(packages)) return;
  for (const value of packages) {
    const metadata = asRecord(value);
    if (typeof metadata?.name === "string") {
      addResolved(target, metadata.name, metadata.version);
    }
  }
}

function collectPipfileLock(contents: string, target: ResolvedVersions): void {
  const document = asRecord(JSON.parse(contents) as unknown);
  for (const sectionName of ["default", "develop"] as const) {
    for (const [name, value] of Object.entries(asRecord(document?.[sectionName]) ?? {})) {
      const metadata = asRecord(value);
      addResolved(target, name, metadata?.version);
    }
  }
}

async function collectLockfiles(root: string, target: ResolvedVersions): Promise<void> {
  const files = await Promise.all(
    ["uv.lock", "poetry.lock", "pdm.lock", "Pipfile.lock"].map(async (name) => ({
      name,
      contents: await readOptional(resolve(root, name)),
    })),
  );
  for (const file of files) {
    if (!file.contents) continue;
    if (file.name === "Pipfile.lock") collectPipfileLock(file.contents, target);
    else collectTomlLock(file.contents, target);
  }
}

function versionPair(value: string): [major: number, minor: number] | undefined {
  const match = /(?:python[-_ ]*)?(\d+)\.(\d+)/i.exec(value);
  return match?.[1] && match[2]
    ? [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10)]
    : undefined;
}

function unsupportedVersion(
  value: string,
  maximumVersion: string,
): [major: number, minor: number] | undefined {
  const lowerBounds = [...value.matchAll(/(?:^|[,\s])(?:>=|>|~=|\^|~)?\s*(\d+)\.(\d+)/g)]
    .map((match) =>
      match[1] && match[2]
        ? ([Number.parseInt(match[1], 10), Number.parseInt(match[2], 10)] as const)
        : undefined,
    )
    .filter((pair): pair is readonly [number, number] => pair !== undefined);
  const candidate = lowerBounds.sort((left, right) =>
    left[0] === right[0] ? right[1] - left[1] : right[0] - left[0],
  )[0] ?? versionPair(value);
  const maximum = versionPair(maximumVersion);
  if (!candidate || !maximum) return undefined;
  return candidate[0] < maximum[0] ||
    (candidate[0] === maximum[0] && candidate[1] <= maximum[1])
    ? [candidate[0], candidate[1]]
    : undefined;
}

/**
 * A scheduled line is reported only for a declaration that stays on exactly that line: a pinned runtime, or a
 * range with an upper bound. `>=3.11` merely allows it, so it is not a problem with the declaration.
 */
export function staysOnScheduledLine(declaration: { kind: string; value: string }, line: [number, number]): boolean {
  const pair = versionPair(declaration.value);
  if (!pair || pair[0] !== line[0] || pair[1] !== line[1]) return false;
  return declaration.kind === "pinned runtime" || /(?:<|==)/.test(declaration.value);
}

function collectPyprojectRuntime(
  path: string,
  contents: string,
  document: UnknownRecord,
): Declaration[] {
  const declarations: Declaration[] = [];
  const projectValue = asRecord(document.project)?.["requires-python"];
  if (typeof projectValue === "string") {
    declarations.push({
      path,
      line: lineContaining(contents, "requires-python"),
      value: projectValue,
      kind: "compatibility range",
    });
  }
  const poetryPython = asRecord(asRecord(asRecord(document.tool)?.poetry)?.dependencies)?.python;
  if (typeof poetryPython === "string") {
    declarations.push({
      path,
      line: lineContaining(contents, "python"),
      value: poetryPython,
      kind: "compatibility range",
    });
  }
  return declarations;
}

async function collectVersionFiles(root: string): Promise<Declaration[]> {
  const declarations: Declaration[] = [];
  for (const name of [".python-version", "runtime.txt"] as const) {
    const path = resolve(root, name);
    const value = (await readOptional(path))?.trim();
    if (value) declarations.push({ path, line: 1, value, kind: "pinned runtime" });
  }
  const toolVersionsPath = resolve(root, ".tool-versions");
  const toolVersions = await readOptional(toolVersionsPath);
  if (toolVersions) {
    for (const [index, line] of toolVersions.split(/\r?\n/).entries()) {
      const match = /^python\s+(.+)$/i.exec(line.trim());
      if (match?.[1]) {
        declarations.push({
          path: toolVersionsPath,
          line: index + 1,
          value: match[1],
          kind: "pinned runtime",
        });
      }
    }
  }
  return declarations;
}

function isPythonRule(value: unknown): value is PythonRule {
  if (!isDeprecationRule(value)) return false;
  const candidate = value as Partial<PythonRule>;
  return (
    (candidate.kind === "runtime" && typeof candidate.maximumVersion === "string") ||
    (candidate.kind === "package" &&
      typeof candidate.package === "string" &&
      (candidate.usage === undefined || candidate.usage.every(isUsageMatcher)))
  );
}

async function loadRules(): Promise<readonly PythonRule[]> {
  const document = await loadDataFile("registry/python.json");
  // The detector view drops `vers`, which version-bounded package rules are matched on, so it is read from the v2 rule.
  const versions = new Map(validateRegistryV2(document).rules.map((rule) => [rule.id, rule.vers]));
  return loadRegistryRules(withoutSymbolRules(document), {
    schemaVersion: "evergreen.python-registry.v1",
    isRule: isPythonRule,
  }).rules.map((rule) => (rule.kind === "package" ? { ...rule, vers: versions.get(rule.id) } : rule));
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

export class PythonDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "python";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: ["pyproject.toml", ".python-version", "runtime.txt", ".tool-versions", "uv.lock", "poetry.lock", "pdm.lock", "Pipfile.lock", "requirements*.txt"],
    sourceExtensions: [".py", ".ini", ".cfg"],
  };

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    const memberDirectories = await discoverPythonWorkspaces(context.root);
    // The root project is "", each uv workspace member is its relative directory.
    const projects: ProjectScan[] = [];
    for (const directory of ["", ...memberDirectories]) {
      const projectRoot = resolve(context.root, directory);
      const pyprojectPath = resolve(projectRoot, "pyproject.toml");
      const pyprojectContents = await readOptional(pyprojectPath);
      const pyproject = pyprojectContents ? asRecord(parseToml(pyprojectContents)) : undefined;
      const requirements = await requirementFiles(projectRoot);
      const versionDeclarations = await collectVersionFiles(projectRoot);
      if (!pyprojectContents && requirements.length === 0 && versionDeclarations.length === 0) continue;

      const dependencies = new Map<string, DirectDependency>();
      const resolved: ResolvedVersions = new Map();
      const declarations = pyproject && pyprojectContents ? collectPyprojectRuntime(pyprojectPath, pyprojectContents, pyproject) : [];
      declarations.push(...versionDeclarations);
      if (pyproject && pyprojectContents) collectPyprojectDependencies(pyprojectPath, pyprojectContents, pyproject, dependencies, resolved);
      for (const path of requirements) {
        collectRequirementsFile(path, await readFile(path, "utf8"), dependencies, resolved);
      }
      await collectLockfiles(projectRoot, resolved);
      projects.push({ directory, declarations, dependencies, resolved });
    }
    if (projects.length === 0) return [];

    // A workspace shares the root's lockfile (uv.lock), so root-resolved versions apply to every project.
    const rootResolved: ResolvedVersions = new Map();
    await collectLockfiles(context.root, rootResolved);
    for (const project of projects) {
      for (const [name, versions] of rootResolved) project.resolved.set(name, new Set([...(project.resolved.get(name) ?? []), ...versions]));
    }

    const rules = await loadRules();
    const declarations = projects.flatMap((project) => project.declarations);

    // Each runtime rule reads "Python X.Y and older". A declaration is reported by the narrowest rule that
    // covers the release line it names, so a 3.8 or 3.9 declaration keeps its existing finding and a 3.10
    // declaration gets the newer rule, instead of every declaration matching only the first rule.
    const runtimeRules = rules
      .filter((rule): rule is PythonRuntimeRule => rule.kind === "runtime")
      .sort((left, right) => {
        const [leftMajor = 0, leftMinor = 0] = versionPair(left.maximumVersion) ?? [];
        const [rightMajor = 0, rightMinor = 0] = versionPair(right.maximumVersion) ?? [];
        return leftMajor - rightMajor || leftMinor - rightMinor;
      });
    const findings: DetectorFinding[] = [];
    for (const declaration of declarations) {
      for (const runtimeRule of runtimeRules) {
        const line = versionPair(runtimeRule.maximumVersion);
        const version = runtimeRule.scheduled
          ? (line && staysOnScheduledLine(declaration, line) ? line : undefined)
          : unsupportedVersion(declaration.value, runtimeRule.maximumVersion);
        if (!version) continue;
        const severity: Severity =
          declaration.kind === "pinned runtime" ? runtimeRule.severity : "medium";
        const path = relativePosix(context.root, declaration.path);
        findings.push({
          id: `${runtimeRule.id}:${path}:${declaration.line}`,
          ruleId: runtimeRule.id,
          title: runtimeRule.title,
          summary: `${declaration.kind} ${declaration.value} includes Python ${version.join(".")}. ${runtimeRule.summary}`,
          severity,
          location: { path, line: declaration.line },
          ...(runtimeRule.replacement ? { replacement: runtimeRule.replacement } : {}),
          ...(runtimeRule.deadline ? { deadline: runtimeRule.deadline } : {}),
          ...(runtimeRule.migration ? { migration: runtimeRule.migration } : {}),
          sources: runtimeRule.sources,
        });
        break;
      }
    }

    const matchedPackageRules = rules.filter(
      (rule): rule is PythonPackageRule =>
        rule.kind === "package" &&
        projects.some(
          (project) =>
            project.dependencies.has(normalizePackageName(rule.package)) && coversDependency(rule, project),
        ),
    );
    const usageAnalyses = await analyzeSourceUsage(
      context.root,
      matchedPackageRules.map((rule) => ({ id: rule.id, matchers: rule.usage ?? [] })),
    );
    const usageByRule = new Map(usageAnalyses.map((analysis) => [analysis.contractId, analysis]));
    const projectDirectories = projects.map((project) => project.directory);

    for (const project of projects) {
      for (const rule of matchedPackageRules) {
        const dependency = project.dependencies.get(normalizePackageName(rule.package));
        if (!dependency || !coversDependency(rule, project)) continue;
        const resolved = [...(project.resolved.get(dependency.name) ?? [])].sort();
        // Each project reports the usages inside its own directory; the root keeps the ones outside every member.
        const usages = usagesOwnedBy(usageByRule.get(rule.id)!.usages, project.directory, projectDirectories);
        findings.push({
          id: `${rule.id}:${relativePosix(context.root, dependency.path)}:${dependency.line}`,
          ruleId: rule.id,
          title: rule.title,
          summary: `${dependency.name} is declared as ${dependency.constraint || "unconstrained"}; resolved: ${resolved.length > 0 ? resolved.join(", ") : "not found in a supported lockfile"}. ${rule.summary}`,
          severity: rule.severity,
          location: {
            path: relativePosix(context.root, dependency.path),
            line: dependency.line,
          },
          ...(rule.replacement ? { replacement: rule.replacement } : {}),
          ...(rule.deadline ? { deadline: rule.deadline } : {}),
          ...(rule.migration ? { migration: rule.migration } : {}),
          sources: rule.sources,
          usages,
          impact: impactFor(usages),
        });
      }
    }

    return findings;
  }
}

export const pythonDetector = new PythonDetector();

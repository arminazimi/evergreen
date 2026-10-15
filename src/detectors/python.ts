import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { parse as parseToml } from "smol-toml";

import type { DeprecationRule, Severity, UsageMatcher } from "../domain.js";
import { findPackageFile } from "../package-files.js";
import { analyzeSourceUsage } from "../source-usage.js";
import {
  DETECTOR_API_VERSION,
  isDeprecationRule,
  isUsageMatcher,
} from "../sdk.js";
import { loadRegistryRules } from "../registry.js";
import type { Detector, DetectorContext, DetectorFinding } from "../sdk.js";

interface PythonRuntimeRule extends DeprecationRule {
  kind: "runtime";
  maximumVersion: string;
}

interface PythonPackageRule extends DeprecationRule {
  kind: "package";
  package: string;
  usage?: UsageMatcher[];
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
): void {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (typeof value !== "string") continue;
    const requirement = parseRequirement(value);
    if (requirement) {
      addDependency(target, path, contents, requirement.name, requirement.constraint);
    }
  }
}

function collectPyprojectDependencies(
  path: string,
  contents: string,
  document: UnknownRecord,
  target: Map<string, DirectDependency>,
): void {
  const project = asRecord(document.project);
  addRequirementList(target, path, contents, project?.dependencies);
  const optional = asRecord(project?.["optional-dependencies"]);
  for (const values of Object.values(optional ?? {})) {
    addRequirementList(target, path, contents, values);
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
    const exact = /^===?\s*([^\s,;]+)$/.exec(requirement.constraint)?.[1];
    if (exact) addResolved(resolved, requirement.name, exact);
  }
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
  const path = await findPackageFile("registry/python.json", import.meta.url);
  return loadRegistryRules(JSON.parse(await readFile(path, "utf8")) as unknown, {
    schemaVersion: "evergreen.python-registry.v1",
    isRule: isPythonRule,
  }).rules;
}

export class PythonDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "python";

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    const pyprojectPath = resolve(context.root, "pyproject.toml");
    const pyprojectContents = await readOptional(pyprojectPath);
    const pyproject = pyprojectContents
      ? asRecord(parseToml(pyprojectContents))
      : undefined;
    const requirements = await requirementFiles(context.root);
    const versionDeclarations = await collectVersionFiles(context.root);
    if (!pyprojectContents && requirements.length === 0 && versionDeclarations.length === 0) {
      return [];
    }

    const rules = await loadRules();
    const dependencies = new Map<string, DirectDependency>();
    const resolvedVersions: ResolvedVersions = new Map();
    const declarations = pyproject && pyprojectContents
      ? collectPyprojectRuntime(pyprojectPath, pyprojectContents, pyproject)
      : [];
    declarations.push(...versionDeclarations);

    if (pyproject && pyprojectContents) {
      collectPyprojectDependencies(pyprojectPath, pyprojectContents, pyproject, dependencies);
    }
    for (const path of requirements) {
      const contents = await readFile(path, "utf8");
      collectRequirementsFile(path, contents, dependencies, resolvedVersions);
    }
    await collectLockfiles(context.root, resolvedVersions);

    const runtimeRule = rules.find((rule): rule is PythonRuntimeRule => rule.kind === "runtime");
    const findings: DetectorFinding[] = [];
    if (runtimeRule) {
      for (const declaration of declarations) {
        const version = unsupportedVersion(declaration.value, runtimeRule.maximumVersion);
        if (!version) continue;
        const severity: Severity =
          declaration.kind === "pinned runtime" ? runtimeRule.severity : "medium";
        const path = relative(context.root, declaration.path);
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
      }
    }

    const matchedPackageRules = rules.filter(
      (rule): rule is PythonPackageRule =>
        rule.kind === "package" && dependencies.has(normalizePackageName(rule.package)),
    );
    const usageAnalyses = await analyzeSourceUsage(
      context.root,
      matchedPackageRules.map((rule) => ({ id: rule.id, matchers: rule.usage ?? [] })),
    );
    const usageByRule = new Map(usageAnalyses.map((analysis) => [analysis.contractId, analysis]));

    for (const rule of matchedPackageRules) {
      const dependency = dependencies.get(normalizePackageName(rule.package))!;
      const resolved = [...(resolvedVersions.get(dependency.name) ?? [])].sort();
      const usage = usageByRule.get(rule.id)!;
      findings.push({
        id: `${rule.id}:${relative(context.root, dependency.path)}:${dependency.line}`,
        ruleId: rule.id,
        title: rule.title,
        summary: `${dependency.name} is declared as ${dependency.constraint || "unconstrained"}; resolved: ${resolved.length > 0 ? resolved.join(", ") : "not found in a supported lockfile"}. ${rule.summary}`,
        severity: rule.severity,
        location: {
          path: relative(context.root, dependency.path),
          line: dependency.line,
        },
        ...(rule.replacement ? { replacement: rule.replacement } : {}),
        ...(rule.deadline ? { deadline: rule.deadline } : {}),
        ...(rule.migration ? { migration: rule.migration } : {}),
        sources: rule.sources,
        usages: usage.usages,
        impact: usage.impact,
      });
    }

    return findings;
  }
}

export const pythonDetector = new PythonDetector();

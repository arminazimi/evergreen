import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import type { UnclassifiedReference } from "../../domain.js";
import { relativePosix } from "../../paths.js";
import { analyzeSourceUsage } from "../../source-usage.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { parseVersLenient, versContains } from "../../vers/index.js";
import { parseGlobalJson } from "./parse-global-json.js";
import { parseMsbuild } from "./parse-msbuild.js";
import type { MsbuildDeclarations, PackageDeclaration, TargetDeclaration } from "./parse-msbuild.js";
import { parsePackagesLock } from "./parse-packages-lock.js";
import type { LockedPackage } from "./parse-packages-lock.js";

/**
 * Finds .NET release lines that are past end of support, in the SDK pinned by `global.json` and in the target
 * frameworks of project files and `Directory.Build.props`, and direct NuGet dependencies the publisher has
 * deprecated (decision 0012).
 *
 * `netstandard` is a specification and is never judged; .NET Framework targets, MSBuild properties, floating
 * versions, and ranges are listed as unclassified, not guessed. MSBuild is not evaluated, `<Import>` is not
 * followed, and `dotnet` is never run; nothing is fetched.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 500;
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "bin",
  "obj",
  "target",
  ".venv",
  "venv",
  "fixtures",
  "__fixtures__",
  "testdata",
]);
const RUNTIME_PURL = "pkg:generic/dotnet";
const PROJECT_FILE = /\.(?:cs|fs|vb)proj$/i;
const NAMES = new Set(["global.json", "directory.build.props", "directory.packages.props", "packages.lock.json"]);

async function dotnetFiles(root: string): Promise<string[]> {
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
      } else if (entry.isFile() && (NAMES.has(entry.name.toLowerCase()) || PROJECT_FILE.test(entry.name))) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0);
  return files;
}

type Target = { kind: "version"; version: string } | { kind: "ignored" } | { kind: "unclassified"; reason: string };

/** A target framework moniker as the runtime version it names, or why it is not judged. */
export function targetVersion(moniker: string): Target {
  const value = moniker.trim().toLowerCase();
  if (value.includes("$("))
    return {
      kind: "unclassified",
      reason: "the target framework is an MSBuild property, which Evergreen does not evaluate",
    };
  const core = /^netcoreapp(\d+)\.(\d+)$/.exec(value);
  if (core) return { kind: "version", version: `${core[1]}.${core[2]}.0` };
  const modern = /^net(\d+)\.(\d+)(?:-[a-z0-9.]+)?$/.exec(value);
  if (modern && Number(modern[1]) >= 5) return { kind: "version", version: `${modern[1]}.${modern[2]}.0` };
  if (value.startsWith("netstandard")) return { kind: "ignored" };
  if (/^net4\d{1,2}(?:-[a-z0-9.]+)?$/.test(value) || /^net[1-3]\d?$/.test(value))
    return {
      kind: "unclassified",
      reason: "this is .NET Framework, which follows the Windows lifecycle and is not judged",
    };
  return { kind: "unclassified", reason: "this is not a .NET release moniker Evergreen judges" };
}

const LITERAL_VERSION = /^\d+(?:\.\d+){0,3}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** True for a rule that names every version of a package; false for one that lists specific versions. */
const coversEveryVersion = (rule: RegistryV2Rule): boolean => parseVersLenient(rule.vers).all;

function contains(rule: RegistryV2Rule, version: string): boolean {
  try {
    return versContains(rule.vers, version);
  } catch {
    return false;
  }
}

/** Everything one `analyze` run collects: the rules it judges with, and the findings and unclassified references it has made so far. */
interface Run {
  readonly root: string;
  readonly rules: RegistryV2Rule[];
  readonly runtimeRules: RegistryV2Rule[];
  readonly packageRules: Map<string, RegistryV2Rule[]>;
  readonly findings: Map<string, DetectorFinding>;
  readonly unclassified: Omit<UnclassifiedReference, "detector">[];
}

function newRun(root: string, rules: RegistryV2Rule[]): Run {
  const packageRules = new Map<string, RegistryV2Rule[]>();
  for (const rule of rules) {
    if (!rule.purl.startsWith("pkg:nuget/")) continue;
    const id = decodeURIComponent(rule.purl.slice("pkg:nuget/".length)).toLowerCase();
    packageRules.set(id, [...(packageRules.get(id) ?? []), rule]);
  }
  return {
    root,
    rules,
    runtimeRules: rules.filter((rule) => rule.purl === RUNTIME_PURL),
    packageRules,
    findings: new Map(),
    unclassified: [],
  };
}

function reportFinding(run: Run, rule: RegistryV2Rule, path: string, line: number, summary: string): void {
  const id = `${rule.id}:${path}:${line}`;
  if (run.findings.has(id)) return;
  run.findings.set(id, {
    id,
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
}

function judgeRuntime(run: Run, version: string, path: string, line: number, text: string): void {
  const rule = run.runtimeRules.find((item) => contains(item, version));
  if (rule) reportFinding(run, rule, path, line, `${path} ${text}. ${rule.summary}`);
}

function judgeGlobalJson(run: Run, contents: string, path: string): void {
  for (const sdk of parseGlobalJson(contents)) {
    if (!LITERAL_VERSION.test(sdk.value)) {
      run.unclassified.push({
        component: "dotnet",
        reference: sdk.value,
        reason: "the SDK version is not a version number, so Evergreen does not judge it",
        location: { path, line: sdk.line },
      });
      continue;
    }
    judgeRuntime(run, sdk.value, path, sdk.line, `pins .NET SDK ${sdk.value}`);
  }
}

/** Reads every candidate file in order; global.json is judged as it is read, MSBuild and lock files are returned for later phases. */
async function readFiles(
  run: Run,
  files: string[],
): Promise<{
  locks: Array<{ path: string; packages: LockedPackage[] }>;
  parsed: Array<{ path: string; declarations: MsbuildDeclarations }>;
}> {
  const locks: Array<{ path: string; packages: LockedPackage[] }> = [];
  const parsed: Array<{ path: string; declarations: MsbuildDeclarations }> = [];
  for (const file of files) {
    let contents: string;
    try {
      contents = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const path = relativePosix(run.root, file);
    const name = basename(file).toLowerCase();
    if (name === "global.json") judgeGlobalJson(run, contents, path);
    else if (name === "packages.lock.json") locks.push({ path, packages: parsePackagesLock(contents) });
    else parsed.push({ path, declarations: parseMsbuild(contents) });
  }
  return { locks, parsed };
}

function judgeTargets(run: Run, targets: TargetDeclaration[], path: string): void {
  for (const target of targets) {
    const result = targetVersion(target.value);
    if (result.kind === "version") judgeRuntime(run, result.version, path, target.line, `targets ${target.value}`);
    else if (result.kind === "unclassified")
      run.unclassified.push({
        component: "dotnet",
        reference: target.value,
        reason: result.reason,
        location: { path, line: target.line },
      });
  }
}

function judgePackage(run: Run, declaration: PackageDeclaration, path: string, central: boolean): void {
  const candidates = run.packageRules.get(declaration.name.toLowerCase());
  if (!candidates) return;
  if (declaration.version === undefined) {
    if (declaration.kind === "reference" && !central)
      run.unclassified.push({
        component: declaration.name,
        reference: declaration.name,
        reason:
          "the reference has no version and central package management is not enabled, so Evergreen does not judge it",
        location: { path, line: declaration.line },
      });
    return;
  }
  if (!LITERAL_VERSION.test(declaration.version)) {
    run.unclassified.push({
      component: declaration.name,
      reference: declaration.version,
      reason: "the version is an MSBuild property, a floating version, or a range, so Evergreen does not judge it",
      location: { path, line: declaration.line },
    });
    return;
  }
  const suffix = declaration.kind === "version" ? " (central package version)" : "";
  for (const rule of candidates) {
    if (contains(rule, declaration.version))
      reportFinding(
        run,
        rule,
        path,
        declaration.line,
        `${path} references ${declaration.name} ${declaration.version}${suffix}. ${rule.summary}`,
      );
  }
}

/** Central package management set in a file applies to the projects in its directory and below. */
function centralDirectories(parsed: Array<{ path: string; declarations: MsbuildDeclarations }>): string[] {
  return parsed.filter((file) => file.declarations.centralPackageManagement).map((file) => dirname(file.path));
}

function isCentral(directories: string[], path: string): boolean {
  return directories.some(
    (directory) => directory === "." || dirname(path) === directory || dirname(path).startsWith(`${directory}/`),
  );
}

function judgeProjects(run: Run, parsed: Array<{ path: string; declarations: MsbuildDeclarations }>): void {
  const directories = centralDirectories(parsed);
  for (const { path, declarations } of parsed) {
    judgeTargets(run, declarations.targets, path);
    const central = isCentral(directories, path);
    for (const declaration of declarations.packages) judgePackage(run, declaration, path, central);
  }
}

/** A package deprecated at every version is reported where it is declared; a rule for specific versions is reported where the lock file resolves it. */
function judgeLocks(run: Run, locks: Array<{ path: string; packages: LockedPackage[] }>): void {
  for (const lock of locks) {
    for (const pkg of lock.packages) {
      for (const rule of run.packageRules.get(pkg.name.toLowerCase()) ?? []) {
        if (!coversEveryVersion(rule) && contains(rule, pkg.version))
          reportFinding(
            run,
            rule,
            lock.path,
            pkg.line,
            `${lock.path} resolves ${pkg.name} ${pkg.version}. ${rule.summary}`,
          );
      }
    }
  }
}

/** Where the repository's C# source uses a deprecated package, so a migration packet can list the files. */
async function attachUsage(run: Run): Promise<void> {
  const rulesById = new Map(run.rules.map((rule) => [rule.id, rule]));
  const withUsage = [...run.findings.values()]
    .map((finding) => ({ finding, matchers: rulesById.get(finding.ruleId)?.usage ?? [] }))
    .filter((entry) => entry.matchers.length > 0);
  if (withUsage.length === 0) return;
  const analyses = new Map(
    (
      await analyzeSourceUsage(
        run.root,
        withUsage.map((entry) => ({ id: entry.finding.id, matchers: entry.matchers })),
      )
    ).map((analysis) => [analysis.contractId, analysis]),
  );
  for (const { finding } of withUsage) {
    const analysis = analyses.get(finding.id);
    if (analysis) Object.assign(finding, { usages: analysis.usages, impact: analysis.impact });
  }
}

function sortedFindings(findings: Iterable<DetectorFinding>): DetectorFinding[] {
  return [...findings].sort(
    (left, right) =>
      left.location.path.localeCompare(right.location.path) ||
      (left.location.line ?? 0) - (right.location.line ?? 0) ||
      left.id.localeCompare(right.id),
  );
}

export class DotnetDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "dotnet";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: ["global.json", "Directory.Build.props", "Directory.Packages.props", "packages.lock.json"],
    extensions: [".csproj", ".fsproj", ".vbproj"],
    sourceExtensions: [".cs"],
  };

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/dotnet.json`. */
  constructor(
    private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () =>
      validateRegistryV2(await loadDataFile("registry/dotnet.json")).rules,
  ) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await dotnetFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const run = newRun(context.root, await this.loadRules());
    const { locks, parsed } = await readFiles(run, files);
    judgeProjects(run, parsed);
    judgeLocks(run, locks);
    await attachUsage(run);
    return { findings: sortedFindings(run.findings.values()), unclassified: run.unclassified };
  }
}

export const dotnetDetector = new DotnetDetector();

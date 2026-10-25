import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import semver from "semver";
import { parseAllDocuments } from "yaml";

import type {
  DeprecationRule,
  Severity,
  UsageMatcher,
} from "../domain.js";
import { relativePosix } from "../paths.js";
import { parseVers, versContains } from "../vers/index.js";
import { loadDataFile } from "../data-source.js";
import { analyzeSourceUsage, impactFor } from "../source-usage.js";
import { discoverNpmWorkspaces, usagesOwnedBy } from "../workspaces.js";
import {
  DETECTOR_API_VERSION,
  isDeprecationRule,
  isUsageMatcher,
} from "../sdk.js";
import { loadRegistryRules, withoutSymbolRules } from "../registry.js";
import type {
  Detector,
  DetectorContext,
  DetectorFinding,
  RegistryDefinition,
  DetectorInputs,
} from "../sdk.js";

interface PackageRule extends DeprecationRule {
  vers?: string;
  package: string;
  usage?: UsageMatcher[];
}

interface NodeRule extends DeprecationRule {
  major?: number;
  maximumMajor?: number;
  /** A line with an announced end that has not happened yet (decision 0010). */
  scheduled?: boolean;
}

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  engines?: { node?: string };
  volta?: { node?: string };
}

interface RuntimeDeclaration {
  path: string;
  line: number;
  value: string;
  kind: "compatibility range" | "pinned runtime";
}

type ResolvedVersions = Map<string, Set<string>>;
/** Package name -> the names it depends on, read from a lockfile. Names, not versions: the path is for people to follow. */
type DependencyGraph = Map<string, Set<string>>;
interface LockData {
  versions: ResolvedVersions;
  graph: DependencyGraph;
}

/**
 * The sections that state the version a project runs. When one package appears in several of them, the later
 * section wins. peerDependencies is deliberately absent: a peer range states which versions a library is
 * compatible with, not the version installed, so a package declared only as a peer is never reported.
 */
const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
] as const;

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function loadRegistry<Rule>(
  path: string,
  definition: RegistryDefinition<Rule>,
): Promise<readonly Rule[]> {
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
    const bound = bounds[index]!;
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

function addResolved(target: ResolvedVersions, name: string, version: unknown): void {
  if (typeof version !== "string" || !semver.valid(version)) {
    return;
  }
  const versions = target.get(name) ?? new Set<string>();
  versions.add(version);
  target.set(name, versions);
}

function packageNameFromNodeModulesPath(path: string): string | undefined {
  const marker = "node_modules/";
  const index = path.lastIndexOf(marker);
  return index === -1 ? undefined : path.slice(index + marker.length);
}

function addEdges(graph: DependencyGraph, from: string, ...sections: Array<Record<string, unknown> | undefined>): void {
  const edges = graph.get(from) ?? new Set<string>();
  for (const section of sections) for (const name of Object.keys(section ?? {})) edges.add(name);
  graph.set(from, edges);
}

function parsePackageLock(contents: string, { versions: target, graph }: LockData): void {
  const lock = JSON.parse(contents) as {
    packages?: Record<string, { name?: string; version?: string; dependencies?: Record<string, unknown>; optionalDependencies?: Record<string, unknown> }>;
    dependencies?: Record<string, unknown>;
  };

  for (const [path, metadata] of Object.entries(lock.packages ?? {})) {
    const name = metadata.name ?? packageNameFromNodeModulesPath(path);
    if (!name) continue;
    addResolved(target, name, metadata.version);
    addEdges(graph, name, metadata.dependencies, metadata.optionalDependencies);
  }

  const visit = (dependencies: Record<string, unknown> | undefined): void => {
    for (const [name, rawMetadata] of Object.entries(dependencies ?? {})) {
      if (!rawMetadata || typeof rawMetadata !== "object") continue;
      const metadata = rawMetadata as { version?: string; requires?: Record<string, unknown>; dependencies?: Record<string, unknown> };
      addResolved(target, name, metadata.version);
      addEdges(graph, name, metadata.requires);
      visit(metadata.dependencies);
    }
  };
  visit(lock.dependencies);
}

function packageFromPnpmKey(rawKey: string): { name: string; version: string } | undefined {
  const key = rawKey.replace(/^\//, "").replace(/\(.+\)$/, "");
  const separator = key.lastIndexOf("@");
  if (separator <= 0) return undefined;
  const name = key.slice(0, separator);
  const version = key.slice(separator + 1);
  return semver.valid(version) ? { name, version } : undefined;
}

/**
 * pnpm lockfiles can hold more than one YAML document (recent pnpm versions put the package-manager
 * lockfile first and the project lockfile after a `---`), so every document is read. A document that does
 * not parse is skipped: an unreadable lockfile means unresolved versions, never a failed scan.
 */
function parsePnpmLock(contents: string, { versions: target, graph }: LockData): void {
  for (const document of parseAllDocuments(contents)) {
    if (document.errors.length > 0) continue;
    const lock = document.toJS() as { packages?: Record<string, unknown>; snapshots?: Record<string, unknown> } | null;
    for (const entries of [lock?.packages ?? {}, lock?.snapshots ?? {}]) {
      for (const [key, entry] of Object.entries(entries)) {
        const parsed = packageFromPnpmKey(key);
        if (!parsed) continue;
        addResolved(target, parsed.name, parsed.version);
        const edges = entry && typeof entry === "object" ? (entry as { dependencies?: Record<string, unknown>; optionalDependencies?: Record<string, unknown> }) : {};
        addEdges(graph, parsed.name, edges.dependencies, edges.optionalDependencies);
      }
    }
  }
}

function packageNameFromYarnSelector(selector: string): string | undefined {
  const clean = selector.trim().replace(/^"|"$/g, "");
  const separator = clean.startsWith("@") ? clean.indexOf("@", clean.indexOf("/") + 1) : clean.indexOf("@");
  return separator > 0 ? clean.slice(0, separator) : undefined;
}

function parseYarnLock(contents: string, { versions: target, graph }: LockData): void {
  let names: string[] = [];
  let inDependencies = false;
  for (const line of contents.split(/\r?\n/)) {
    if (line && !/^\s/.test(line) && line.endsWith(":")) {
      names = line
        .slice(0, -1)
        .split(",")
        .map(packageNameFromYarnSelector)
        .filter((name): name is string => Boolean(name));
      inDependencies = false;
      continue;
    }
    if (/^ {2}\S/.test(line)) inDependencies = /^ {2}(?:dependencies|optionalDependencies):\s*$/.test(line);
    const dependency = inDependencies ? /^ {4}"?([^"\s:]+)"?/.exec(line)?.[1] : undefined;
    if (dependency) for (const name of names) addEdges(graph, name, { [dependency]: true });
    const match = /^\s+version\s+["']?([^"'\s]+)["']?/.exec(line);
    if (match?.[1]) {
      for (const name of names) addResolved(target, name, match[1]);
    }
  }
}

async function collectLockData(root: string): Promise<LockData> {
  const resolved: LockData = { versions: new Map(), graph: new Map() };
  const lockfiles = await Promise.all([
    readOptional(resolve(root, "package-lock.json")),
    readOptional(resolve(root, "npm-shrinkwrap.json")),
    readOptional(resolve(root, "pnpm-lock.yaml")),
    readOptional(resolve(root, "yarn.lock")),
  ]);

  if (lockfiles[0]) parsePackageLock(lockfiles[0], resolved);
  if (lockfiles[1]) parsePackageLock(lockfiles[1], resolved);
  if (lockfiles[2]) parsePnpmLock(lockfiles[2], resolved);
  if (lockfiles[3]) parseYarnLock(lockfiles[3], resolved);
  return resolved;
}

/**
 * The shortest chain of package names from a directly declared dependency to `target`, both ends included, or
 * undefined when the lockfile graph does not reach it. Neighbours are visited in name order so the same lockfile
 * always yields the same path.
 */
function shortestDependencyPath(graph: DependencyGraph, direct: Iterable<string>, target: string): string[] | undefined {
  const parent = new Map<string, string | undefined>();
  let frontier = [...direct].sort();
  for (const name of frontier) parent.set(name, undefined);
  while (frontier.length > 0 && !parent.has(target)) {
    const next: string[] = [];
    for (const name of frontier) {
      for (const dependency of [...(graph.get(name) ?? [])].sort()) {
        if (parent.has(dependency)) continue;
        parent.set(dependency, name);
        next.push(dependency);
      }
    }
    frontier = next;
  }
  if (!parent.has(target)) return undefined;
  const path: string[] = [];
  for (let name: string | undefined = target; name !== undefined; name = parent.get(name)) path.unshift(name);
  return path;
}

function propertyLine(contents: string, property: string): number {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^[\\t ]*["']${escaped}["']\\s*:`, "m");
  const match = pattern.exec(contents);
  return match ? contents.slice(0, match.index).split(/\r?\n/).length : 1;
}

/**
 * The line of `name` declared directly inside the top-level `section` object of a package.json. Keys are matched
 * by nesting depth, so the same name in another section, or nested deeper (such as an overrides block), is never
 * taken. The last occurrence wins, as it does for JSON.parse. Falls back to line 1 when the key is not found.
 */
function declarationLine(contents: string, section: string, name: string): number {
  const token = /("(?:[^"\\]|\\.)*")(\s*:)?|[{}[\]]/g;
  let depth = 0;
  let topKey = "";
  let found = -1;
  for (let match = token.exec(contents); match; match = token.exec(contents)) {
    const text = match[0];
    if (text === "{" || text === "[") depth++;
    else if (text === "}" || text === "]") depth--;
    else if (match[2] !== undefined) {
      const key = JSON.parse(match[1]!) as string;
      if (depth === 1) topKey = key;
      else if (depth === 2 && topKey === section && key === name) found = match.index;
    }
  }
  return found >= 0 ? contents.slice(0, found).split(/\r?\n/).length : 1;
}

/** Up to this line the detector has always listed every end-of-life line a range allows. */
const LEGACY_MAXIMUM_MAJOR = 20;

/**
 * The end-of-life candidates a declaration allows. A range whose lowest allowed version is at or below
 * Node.js 20 lists every line up to 20, as it always has. A range whose lowest version is a newer line is
 * checked against the newer lines too (up to `newestRuleMajor`) only if that floor line is itself end-of-life:
 * `>=21` is a problem, but `>=22` and `>=24` have supported floors, so the end-of-life lines 23 and 25 they
 * also allow are not a problem with the declaration. A scheduled line (announced end, not yet reached) is
 * reported only for a declaration whose lowest allowed version is that line and that allows nothing newer
 * (`^22`, `22.x`, a pinned `22`), never for a range such as `>=22` that merely allows it, and never extends the end-of-life candidates (`hasRule` and `newestRuleMajor` ignore it).
 */
function runtimeMajors(value: string, newestRuleMajor: number, hasRule: (major: number) => boolean, scheduledMajors: number[] = []): number[] {
  const range = semver.validRange(value);
  if (!range) {
    const direct = /^(?:v)?(\d+)(?:\.\d+){0,2}$/.exec(value.trim());
    return direct?.[1] ? [Number.parseInt(direct[1], 10)] : [];
  }
  const floor = semver.minVersion(range)?.major ?? 0;
  // Past Node.js 20 only a floor that is itself end-of-life (a line with a rule) makes the declaration a problem.
  const maximum = floor > LEGACY_MAXIMUM_MAJOR ? (hasRule(floor) ? newestRuleMajor : LEGACY_MAXIMUM_MAJOR) : LEGACY_MAXIMUM_MAJOR;
  const candidates = Array.from({ length: maximum + 1 }, (_, index) => index);
  const ended = candidates.filter((major) => semver.intersects(range, `${major}.x`));
  return [...ended, ...scheduledMajors.filter((major) => major === floor && !ended.includes(major) && semver.intersects(range, `${major}.x`) && !semver.intersects(range, `>=${major + 1}.0.0`))];
}

function ruleForMajor(rules: NodeRule[], major: number): NodeRule | undefined {
  return rules.find(
    (rule) => rule.major === major || (rule.maximumMajor !== undefined && major <= rule.maximumMajor),
  );
}

function declarationFinding(
  root: string,
  declaration: RuntimeDeclaration,
  rule: NodeRule,
  detectedMajor: number,
): DetectorFinding {
  const severity: Severity = declaration.kind === "pinned runtime" || rule.scheduled ? rule.severity : "medium";
  return {
    id: `${rule.id}:${relativePosix(root, declaration.path)}:${declaration.line}`,
    ruleId: rule.id,
    title: rule.title,
    summary: `${declaration.kind} ${declaration.value} includes Node.js ${detectedMajor}. ${rule.summary}`,
    severity,
    confidence: declaration.kind === "compatibility range" ? "range" : "exact",
    location: { path: relativePosix(root, declaration.path), line: declaration.line },
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
  };
}

function manifestRuntimeDeclarations(
  root: string,
  path: string,
  contents: string,
  manifest: PackageManifest,
): RuntimeDeclaration[] {
  const declarations: RuntimeDeclaration[] = [];
  if (manifest.engines?.node) {
    declarations.push({
      path,
      line: propertyLine(contents.slice(contents.indexOf('"engines"')), "node") +
        contents.slice(0, contents.indexOf('"engines"')).split(/\r?\n/).length - 1,
      value: manifest.engines.node,
      kind: "compatibility range",
    });
  }
  if (manifest.volta?.node) {
    declarations.push({
      path,
      line: propertyLine(contents.slice(contents.indexOf('"volta"')), "node") +
        contents.slice(0, contents.indexOf('"volta"')).split(/\r?\n/).length - 1,
      value: manifest.volta.node,
      kind: "pinned runtime",
    });
  }
  return declarations;
}

export class NpmDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "npm";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: ["package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", ".nvmrc", ".node-version", "pnpm-workspace.yaml", "lerna.json"],
    sourceExtensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".json", ".yaml", ".yml"],
  };

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    const rootManifest = await readOptional(resolve(context.root, "package.json"));
    const workspaceDirectories = await discoverNpmWorkspaces(context.root);
    if (!rootManifest && workspaceDirectories.length === 0) return [];

    const [packageRules, nodeRules, rootLock] = await Promise.all([
      loadRegistry(
        "registry/npm.json",
        {
          schemaVersion: "evergreen.npm-registry.v1",
          isRule: (value): value is PackageRule =>
            isDeprecationRule(value) &&
            typeof (value as Partial<PackageRule>).package === "string" &&
            ((value as Partial<PackageRule>).usage === undefined ||
              ((value as Partial<PackageRule>).usage?.every(isUsageMatcher) ?? false)),
        },
      ),
      loadRegistry(
        "registry/nodejs.json",
        {
          schemaVersion: "evergreen.nodejs-registry.v1",
          isRule: (value): value is NodeRule =>
            isDeprecationRule(value) &&
            (typeof (value as Partial<NodeRule>).major === "number" ||
              typeof (value as Partial<NodeRule>).maximumMajor === "number"),
        },
      ),
      collectLockData(context.root),
    ]);

    // The root project is "", each workspace is its relative directory. A workspace without its own lockfile
    // resolves against the root's, which is where npm, pnpm, and Yarn put the one shared lockfile.
    const projects: Array<{ directory: string; manifestPath: string; contents: string; manifest: PackageManifest; resolved: ResolvedVersions; graph: DependencyGraph }> = [];
    const load = async (directory: string): Promise<void> => {
      const manifestPath = resolve(context.root, directory, "package.json");
      const contents = directory === "" ? rootManifest : await readOptional(manifestPath);
      if (!contents) return;
      let manifest: PackageManifest;
      try {
        manifest = JSON.parse(contents) as PackageManifest;
      } catch (error) {
        // A malformed root manifest has always been an error; a malformed workspace manifest is skipped so one bad package does not hide the rest.
        if (directory === "") throw error;
        return;
      }
      const own = directory === "" ? { versions: new Map<string, Set<string>>(), graph: new Map<string, Set<string>>() } : await collectLockData(resolve(context.root, directory));
      const resolved: ResolvedVersions = new Map(rootLock.versions);
      for (const [name, versions] of own.versions) resolved.set(name, new Set([...(resolved.get(name) ?? []), ...versions]));
      const graph: DependencyGraph = new Map(rootLock.graph);
      for (const [name, edges] of own.graph) graph.set(name, new Set([...(graph.get(name) ?? []), ...edges]));
      projects.push({ directory, manifestPath, contents, manifest, resolved, graph });
    };
    await load("");
    for (const directory of workspaceDirectories) await load(directory);

    const findings: DetectorFinding[] = [];
    const endedRules = nodeRules.filter((rule) => !rule.scheduled);
    const scheduledMajors = nodeRules.flatMap((rule) => (rule.scheduled && rule.major !== undefined ? [rule.major] : []));
    const newestRuleMajor = Math.max(0, ...endedRules.map((rule) => rule.major ?? 0));
    const seenRuntimeRules = new Set<string>();
    const matched: Array<{ rule: PackageRule; project: (typeof projects)[number]; range: string; section: string; via?: string[] }> = [];

    for (const project of projects) {
      const declarations = manifestRuntimeDeclarations(context.root, project.manifestPath, project.contents, project.manifest);
      for (const filename of [".nvmrc", ".node-version"] as const) {
        const path = resolve(context.root, project.directory, filename);
        const value = (await readOptional(path))?.trim();
        if (value) declarations.push({ path, line: 1, value, kind: "pinned runtime" });
      }
      for (const declaration of declarations) {
        for (const major of runtimeMajors(declaration.value, newestRuleMajor, (major) => ruleForMajor(endedRules, major) !== undefined, scheduledMajors)) {
          const rule = ruleForMajor([...nodeRules], major);
          const key = rule ? `${rule.id}:${declaration.path}:${declaration.line}` : "";
          if (rule && !seenRuntimeRules.has(key)) {
            findings.push(declarationFinding(context.root, declaration, rule, major));
            seenRuntimeRules.add(key);
          }
        }
      }

      const declared = new Map<string, { range: string; section: string }>();
      for (const section of dependencySections) {
        for (const [name, range] of Object.entries(project.manifest[section] ?? {})) {
          declared.set(name, { range, section });
        }
      }
      for (const rule of packageRules) {
        const dependency = declared.get(rule.package);
        if (!dependency) {
          // Not declared here: report it when a lockfile shows a declared dependency pulling it in, with that path.
          const via = shortestDependencyPath(project.graph, declared.keys(), rule.package);
          const versions = [...(project.resolved.get(rule.package) ?? [])];
          if (!via || versions.length === 0) continue;
          if (rule.vers && !parseVers(rule.vers).all && !versions.some((version) => versContains(rule.vers!, version))) continue;
          const root = declared.get(via[0]!)!;
          matched.push({ rule, project, range: root.range, section: root.section, via });
          continue;
        }
        if (rule.vers && !parseVers(rule.vers).all) {
          const declaredRange = semver.validRange(dependency.range);
          if (!declaredRange) continue;
          const resolved = [...(project.resolved.get(rule.package) ?? [])].filter((version) => semver.satisfies(version, declaredRange));
          const affected = resolved.length > 0
            ? resolved.some((version) => versContains(rule.vers!, version))
            : declaredVersionsAffected(rule.vers, declaredRange);
          if (!affected) continue;
        }
        matched.push({ rule, project, range: dependency.range, section: dependency.section });
      }
    }

    const matchedRules = [...new Map(matched.map((item) => [item.rule.id, item.rule])).values()];
    const usageAnalyses = await analyzeSourceUsage(
      context.root,
      matchedRules.map((rule) => ({ id: rule.id, matchers: rule.usage ?? [] })),
    );
    const usageByRule = new Map(usageAnalyses.map((analysis) => [analysis.contractId, analysis]));
    const projectDirectories = projects.map((project) => project.directory);

    for (const { rule, project, range, section, via } of matched) {
      const resolved = [...(project.resolved.get(rule.package) ?? [])].sort(semver.compare);
      const resolvedText = resolved.length > 0 ? resolved.join(", ") : "not found in a supported lockfile";
      const line = declarationLine(project.contents, section, via ? via[0]! : rule.package);
      const path = relativePosix(context.root, project.manifestPath);
      // Each project reports the usages inside its own directory; the root keeps the ones outside every workspace.
      const usages = usagesOwnedBy(usageByRule.get(rule.id)!.usages, project.directory, projectDirectories);
      findings.push({
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
      });
    }

    return findings;
  }
}

export const npmDetector = new NpmDetector();

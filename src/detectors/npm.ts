import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import semver from "semver";
import { parse as parseYaml } from "yaml";

import type {
  DeprecationRule,
  Severity,
  UsageMatcher,
} from "../domain.js";
import { findPackageFile } from "../package-files.js";
import { analyzeSourceUsage } from "../source-usage.js";
import {
  DETECTOR_API_VERSION,
  isDeprecationRule,
  isUsageMatcher,
} from "../sdk.js";
import { loadRegistryRules } from "../registry.js";
import type {
  Detector,
  DetectorContext,
  DetectorFinding,
  RegistryDefinition,
} from "../sdk.js";

interface PackageRule extends DeprecationRule {
  package: string;
  usage?: UsageMatcher[];
}

interface NodeRule extends DeprecationRule {
  major?: number;
  maximumMajor?: number;
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

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
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
  path: string | URL,
  definition: RegistryDefinition<Rule>,
): Promise<readonly Rule[]> {
  return loadRegistryRules(JSON.parse(await readFile(path, "utf8")) as unknown, definition).rules;
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

function parsePackageLock(contents: string, target: ResolvedVersions): void {
  const lock = JSON.parse(contents) as {
    packages?: Record<string, { name?: string; version?: string }>;
    dependencies?: Record<string, unknown>;
  };

  for (const [path, metadata] of Object.entries(lock.packages ?? {})) {
    const name = metadata.name ?? packageNameFromNodeModulesPath(path);
    if (name) addResolved(target, name, metadata.version);
  }

  const visit = (dependencies: Record<string, unknown> | undefined): void => {
    for (const [name, rawMetadata] of Object.entries(dependencies ?? {})) {
      if (!rawMetadata || typeof rawMetadata !== "object") continue;
      const metadata = rawMetadata as { version?: string; dependencies?: Record<string, unknown> };
      addResolved(target, name, metadata.version);
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

function parsePnpmLock(contents: string, target: ResolvedVersions): void {
  const lock = parseYaml(contents) as {
    packages?: Record<string, unknown>;
    snapshots?: Record<string, unknown>;
  };
  for (const key of [
    ...Object.keys(lock.packages ?? {}),
    ...Object.keys(lock.snapshots ?? {}),
  ]) {
    const parsed = packageFromPnpmKey(key);
    if (parsed) addResolved(target, parsed.name, parsed.version);
  }
}

function packageNameFromYarnSelector(selector: string): string | undefined {
  const clean = selector.trim().replace(/^"|"$/g, "");
  const separator = clean.startsWith("@") ? clean.indexOf("@", clean.indexOf("/") + 1) : clean.indexOf("@");
  return separator > 0 ? clean.slice(0, separator) : undefined;
}

function parseYarnLock(contents: string, target: ResolvedVersions): void {
  let names: string[] = [];
  for (const line of contents.split(/\r?\n/)) {
    if (line && !/^\s/.test(line) && line.endsWith(":")) {
      names = line
        .slice(0, -1)
        .split(",")
        .map(packageNameFromYarnSelector)
        .filter((name): name is string => Boolean(name));
      continue;
    }
    const match = /^\s+version\s+["']?([^"'\s]+)["']?/.exec(line);
    if (match?.[1]) {
      for (const name of names) addResolved(target, name, match[1]);
    }
  }
}

async function collectResolvedVersions(root: string): Promise<ResolvedVersions> {
  const resolved: ResolvedVersions = new Map();
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

function propertyLine(contents: string, property: string): number {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^[\\t ]*["']${escaped}["']\\s*:`, "m");
  const match = pattern.exec(contents);
  return match ? contents.slice(0, match.index).split(/\r?\n/).length : 1;
}

function runtimeMajors(value: string): number[] {
  const range = semver.validRange(value);
  if (!range) {
    const direct = /^(?:v)?(\d+)(?:\.\d+){0,2}$/.exec(value.trim());
    return direct?.[1] ? [Number.parseInt(direct[1], 10)] : [];
  }
  const eolMajors = Array.from({ length: 21 }, (_, index) => index);
  return eolMajors.filter((major) => semver.intersects(range, `${major}.x`));
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
  const severity: Severity = declaration.kind === "pinned runtime" ? rule.severity : "medium";
  return {
    id: `${rule.id}:${declaration.path}:${declaration.line}`,
    ruleId: rule.id,
    title: rule.title,
    summary: `${declaration.kind} ${declaration.value} includes Node.js ${detectedMajor}. ${rule.summary}`,
    severity,
    location: { path: relative(root, declaration.path), line: declaration.line },
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

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    const manifestPath = resolve(context.root, "package.json");
    const manifestContents = await readOptional(manifestPath);
    if (!manifestContents) return [];

    const [packageRules, nodeRules, resolvedVersions] = await Promise.all([
      loadRegistry(
        await findPackageFile("registry/npm.json", import.meta.url),
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
        await findPackageFile("registry/nodejs.json", import.meta.url),
        {
          schemaVersion: "evergreen.nodejs-registry.v1",
          isRule: (value): value is NodeRule =>
            isDeprecationRule(value) &&
            (typeof (value as Partial<NodeRule>).major === "number" ||
              typeof (value as Partial<NodeRule>).maximumMajor === "number"),
        },
      ),
      collectResolvedVersions(context.root),
    ]);
    const manifest = JSON.parse(manifestContents) as PackageManifest;
    const findings: DetectorFinding[] = [];

    const declarations = manifestRuntimeDeclarations(
      context.root,
      manifestPath,
      manifestContents,
      manifest,
    );
    for (const filename of [".nvmrc", ".node-version"] as const) {
      const path = resolve(context.root, filename);
      const value = (await readOptional(path))?.trim();
      if (value) declarations.push({ path, line: 1, value, kind: "pinned runtime" });
    }

    const seenRuntimeRules = new Set<string>();
    for (const declaration of declarations) {
      for (const major of runtimeMajors(declaration.value)) {
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
      for (const [name, range] of Object.entries(manifest[section] ?? {})) {
        declared.set(name, { range, section });
      }
    }

    const matchedPackageRules = packageRules.filter((rule) => declared.has(rule.package));
    const usageAnalyses = await analyzeSourceUsage(
      context.root,
      matchedPackageRules.map((rule) => ({ id: rule.id, matchers: rule.usage ?? [] })),
    );
    const usageByRule = new Map(usageAnalyses.map((analysis) => [analysis.contractId, analysis]));

    for (const rule of matchedPackageRules) {
      const dependency = declared.get(rule.package)!;
      const resolved = [...(resolvedVersions.get(rule.package) ?? [])].sort(semver.compare);
      const resolvedText = resolved.length > 0 ? resolved.join(", ") : "not found in a supported lockfile";
      const line = propertyLine(manifestContents, rule.package);
      const usage = usageByRule.get(rule.id)!;
      findings.push({
        id: `${rule.id}:package.json:${line}`,
        ruleId: rule.id,
        title: rule.title,
        summary: `${rule.package} is declared in ${dependency.section} as ${dependency.range}; resolved: ${resolvedText}. ${rule.summary}`,
        severity: rule.severity,
        location: { path: "package.json", line },
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

export const npmDetector = new NpmDetector();

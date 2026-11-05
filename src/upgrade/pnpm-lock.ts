import { resolve } from "node:path";

import semver from "semver";
import { isMap, isScalar, parseAllDocuments } from "yaml";

import { readBoundedFile } from "../package-files.js";
import type { UpgradeAnalyzer, UpgradeIssue, UpgradeTarget } from "./types.js";

const LOCKFILE = "pnpm-lock.yaml";
const ANALYZER_ID = "pnpm-lock";

interface PackageEntry {
  /** `<name>@<version>`, with any peer suffix removed. */
  subject: string;
  /** The key used to join packages, importers, and snapshots. */
  key: string;
  range: string;
  line: number;
  dev: boolean;
}

function scalarValue(node: unknown): string | undefined {
  return isScalar(node) && (typeof node.value === "string" || typeof node.value === "number")
    ? String(node.value)
    : undefined;
}

function mapValue(node: unknown, key: string): unknown {
  if (!isMap(node)) return undefined;
  return node.items.find((pair) => scalarValue(pair.key) === key)?.value;
}

function truthy(node: unknown): boolean {
  return isScalar(node) && node.value === true;
}

/** The `engines.node` value of one package entry, with the line of the `engines` key for exact evidence. */
function enginesNode(value: unknown): { range: string; line: number } | undefined {
  if (!isMap(value)) return undefined;
  const engines = value.items.find((pair) => scalarValue(pair.key) === "engines");
  if (engines === undefined || !isMap(engines.value)) return undefined;
  const node = engines.value.items.find((pair) => scalarValue(pair.key) === "node");
  if (node === undefined) return undefined;
  const range = scalarValue(node.value);
  const line = isScalar(engines.key) ? engines.key.range?.[0] : undefined;
  if (range === undefined || line === undefined) return undefined;
  return { range, line };
}

/** Strips a leading slash and every peer suffix, then reads `<name>@<version>`. */
function packageKey(raw: string | undefined): { name: string; version: string } | undefined {
  if (raw === undefined) return undefined;
  const key = raw.replace(/^\//, "").replace(/\(.+\)$/, "");
  const separator = key.lastIndexOf("@");
  if (separator <= 0) return undefined;
  const name = key.slice(0, separator);
  const version = key.slice(separator + 1);
  return semver.valid(version) ? { name, version } : undefined;
}

const keyOf = (name: string, version: string): string => `${name}@${version}`;

function dependencyVersion(node: unknown): string | undefined {
  const scalar = scalarValue(node);
  return scalar ?? scalarValue(mapValue(node, "version"));
}

/** A dependency value from an importer or a snapshot, resolved to the package key it points at. */
function dependencyKey(name: string, raw: string): string | undefined {
  const value = raw.trim();
  if (/^(?:link|file|workspace|catalog|git|https?):/.test(value)) return undefined;
  if (value.startsWith("npm:")) {
    const target = packageKey(value.slice(4));
    return target === undefined ? undefined : keyOf(target.name, target.version);
  }
  const cleaned = value.replace(/^\//, "").replace(/\(.+\)$/, "");
  const version = semver.valid(cleaned);
  if (version !== null) return keyOf(name, version);
  const target = packageKey(cleaned);
  return target === undefined ? undefined : keyOf(target.name, target.version);
}

function collect(importer: unknown, sections: string[], into: Set<string>): void {
  for (const section of sections) {
    const dependencies = mapValue(importer, section);
    if (!isMap(dependencies)) continue;
    for (const pair of dependencies.items) {
      const name = scalarValue(pair.key);
      const version = dependencyVersion(pair.value);
      if (name === undefined || version === undefined) continue;
      const key = dependencyKey(name, version);
      if (key !== undefined) into.add(key);
    }
  }
}

/** Roots named by importers (pnpm 9) or the top-level dependency maps (pnpm 6). */
function importerRoots(root: unknown): { production: Set<string>; dev: Set<string> } {
  const production = new Set<string>();
  const dev = new Set<string>();
  const importers = mapValue(root, "importers");
  const values = isMap(importers) ? importers.items.map((pair) => pair.value) : [root];
  for (const importer of values) {
    collect(importer, ["dependencies", "optionalDependencies"], production);
    collect(importer, ["devDependencies"], dev);
  }
  return { production, dev };
}

/** Edges from every snapshot to the packages it depends on. */
function snapshotGraph(root: unknown): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const snapshots = mapValue(root, "snapshots");
  if (!isMap(snapshots)) return graph;
  for (const pair of snapshots.items) {
    const parsed = packageKey(scalarValue(pair.key));
    if (parsed === undefined) continue;
    const dependencies: string[] = [];
    for (const section of ["dependencies", "optionalDependencies"]) {
      const entries = mapValue(pair.value, section);
      if (!isMap(entries)) continue;
      for (const entry of entries.items) {
        const name = scalarValue(entry.key);
        const version = dependencyVersion(entry.value);
        if (name === undefined || version === undefined) continue;
        const key = dependencyKey(name, version);
        if (key !== undefined) dependencies.push(key);
      }
    }
    graph.set(keyOf(parsed.name, parsed.version), dependencies);
  }
  return graph;
}

function reachable(roots: Set<string>, graph: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const queue = [...roots];
  for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
    if (seen.has(key)) continue;
    seen.add(key);
    for (const dependency of graph.get(key) ?? []) queue.push(dependency);
  }
  return seen;
}

function lockfileVersion(root: unknown): string | undefined {
  return scalarValue(mapValue(root, "lockfileVersion"));
}

function supported(version: string): boolean {
  return /^6(?:\.|$)/.test(version) || /^9(?:\.|$)/.test(version);
}

/** Maps a YAML node offset to the 1-based line it starts on. */
function lineLookup(text: string): (offset: number) => number {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") starts.push(index + 1);
  }
  return (offset: number): number => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const start = starts[middle];
      if (start === undefined) break;
      if (start <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
}

async function readLockfile(root: string): Promise<string | undefined> {
  const read = await readBoundedFile(resolve(root, LOCKFILE));
  if (read === undefined || read.skipped !== undefined) return undefined;
  return read.contents;
}

function targetVersions(version: string): string[] | undefined {
  const cleaned = version.replace(/^v/, "");
  if (/^\d+$/.test(cleaned)) return [`${cleaned}.0.0`];
  if (/^\d+\.\d+$/.test(cleaned)) return [`${cleaned}.0`];
  const exact = semver.valid(cleaned);
  return exact === null ? undefined : [exact];
}

/** One `packages` entry: its key node and its body node. */
type PackagePair = { key: unknown; value: unknown };

type Reachability = { production: Set<string>; dev: Set<string> };

function reachableFlags(root: unknown): Reachability {
  const roots = importerRoots(root);
  const graph = snapshotGraph(root);
  return { production: reachable(roots.production, graph), dev: reachable(roots.dev, graph) };
}

/** The dev flag pnpm 6 writes on the entry, or the one pnpm 9 only implies through the importer roots. */
function entryDev(value: unknown, key: string, reach: Reachability | undefined): boolean {
  if (reach === undefined) return truthy(mapValue(value, "dev")) || truthy(mapValue(value, "devOptional"));
  return reach.dev.has(key) && !reach.production.has(key);
}

function packageEntries(
  items: readonly PackagePair[],
  line: (offset: number) => number,
  reach: Reachability | undefined,
): PackageEntry[] {
  const entries: PackageEntry[] = [];
  for (const pair of items) {
    const parsed = packageKey(scalarValue(pair.key));
    if (parsed === undefined) continue;
    const engines = enginesNode(pair.value);
    if (engines === undefined) continue;
    const key = keyOf(parsed.name, parsed.version);
    entries.push({
      subject: key,
      key,
      range: engines.range,
      line: line(engines.line),
      dev: entryDev(pair.value, key, reach),
    });
  }
  return entries;
}

/**
 * Reads every package entry in every document. pnpm 9 records `engines` under `packages` and no dev flag there, so
 * that flag is resolved from `importers` and `snapshots`; pnpm 6 records it on the package entry itself.
 */
export function readPackages(text: string): PackageEntry[] {
  const line = lineLookup(text);
  const entries: PackageEntry[] = [];
  for (const document of parseAllDocuments(text)) {
    if (document.errors.length > 0) continue;
    const root = document.contents;
    const version = lockfileVersion(root);
    if (version === undefined || !supported(version)) continue;
    const packages = mapValue(root, "packages");
    if (!isMap(packages)) continue;
    entries.push(...packageEntries(packages.items, line, version.startsWith("9") ? reachableFlags(root) : undefined));
  }
  return entries;
}

/** Finds every package whose `engines.node` excludes the target Node.js release. */
export const pnpmLockAnalyzer: UpgradeAnalyzer = {
  id: ANALYZER_ID,
  runtimes: ["nodejs"],

  async applies(root: string): Promise<boolean> {
    const text = await readLockfile(root);
    if (text === undefined) return false;
    for (const document of parseAllDocuments(text)) {
      if (document.errors.length > 0) continue;
      const version = lockfileVersion(document.contents);
      if (version !== undefined && supported(version)) return true;
    }
    return false;
  },

  async analyze(root: string, target: UpgradeTarget): Promise<UpgradeIssue[]> {
    const text = await readLockfile(root);
    if (text === undefined) return [];
    const versions = targetVersions(target.version);
    if (versions === undefined) return [];
    const issues: UpgradeIssue[] = [];
    const seen = new Set<string>();
    for (const entry of readPackages(text)) {
      const identity = `${entry.key}\0${entry.range}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const valid = semver.validRange(entry.range) !== null;
      const satisfied =
        valid && versions.some((candidate) => semver.satisfies(candidate, entry.range, { includePrerelease: false }));
      if (satisfied) continue;
      const level = valid ? (entry.dev ? "warning" : "blocker") : "unknown";
      issues.push({
        analyzer: ANALYZER_ID,
        level,
        subject: entry.subject,
        path: LOCKFILE,
        line: entry.line,
        reason: valid
          ? `${entry.subject} declares engines.node "${entry.range}", which excludes Node.js ${target.version}.`
          : `${entry.subject} declares engines.node "${entry.range}", which is not a valid semver range.`,
        evidence: { kind: "lockfile", value: `engines.node: ${entry.range}` },
      });
    }
    return issues;
  },
};

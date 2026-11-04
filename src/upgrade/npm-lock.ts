import { join } from "node:path";

import semver from "semver";

import { member, readJsonLines, type JsonNode } from "../detectors/json-lines.js";
import { readBoundedFile } from "../package-files.js";
import type { UpgradeAnalyzer, UpgradeIssue, UpgradeTarget } from "./types.js";

const ANALYZER_ID = "npm-lock";
const LOCKFILES = ["package-lock.json", "npm-shrinkwrap.json"] as const;

interface LockPackage {
  name: string;
  version: string;
  range: string;
  line: number;
  dev: boolean;
}

interface Lockfile {
  path: string;
  version: number;
  line: number;
  text: string;
}

function truthy(value: JsonNode | undefined): boolean {
  return value?.kind === "boolean" && value.value;
}

/** The `lockfileVersion` value and the line it is written on, or undefined when the text has none. */
function lockfileVersion(text: string): { version: number; line: number } | undefined {
  const match = /^[ \t]*"lockfileVersion"[ \t]*:[ \t]*(\d+)/m.exec(text);
  if (match?.[1] === undefined) return undefined;
  return { version: Number(match[1]), line: text.slice(0, match.index).split(/\r?\n/).length };
}

async function readText(root: string, name: string): Promise<string | undefined> {
  let read;
  try {
    read = await readBoundedFile(join(root, name));
  } catch {
    return undefined;
  }
  if (read === undefined || read.skipped !== undefined) return undefined;
  return read.contents;
}

async function readLockfiles(root: string): Promise<Lockfile[]> {
  const lockfiles: Lockfile[] = [];
  for (const name of LOCKFILES) {
    const text = await readText(root, name);
    if (text === undefined) continue;
    const parsed = lockfileVersion(text);
    if (parsed === undefined) continue;
    lockfiles.push({ path: name, version: parsed.version, line: parsed.line, text });
  }
  return lockfiles;
}

/** Every `packages["node_modules/..."]` entry that declares `engines.node`, in lockfile order. */
export function readPackages(text: string): LockPackage[] {
  const root = readJsonLines(text, { comments: false });
  const packages = member(root, "packages");
  if (packages?.value.kind !== "object") return [];
  const entries: LockPackage[] = [];
  for (const entry of packages.value.members) {
    if (!entry.key.startsWith("node_modules/") || entry.value.kind !== "object") continue;
    const version = member(entry.value, "version")?.value;
    if (version?.kind !== "string") continue;
    const engines = member(entry.value, "engines");
    if (engines?.value.kind !== "object") continue;
    const node = member(engines.value, "node")?.value;
    if (node?.kind !== "string") continue;
    const declaredName = member(entry.value, "name")?.value;
    const fallbackName = entry.key.slice(entry.key.lastIndexOf("node_modules/") + "node_modules/".length);
    entries.push({
      name: declaredName?.kind === "string" && declaredName.value !== "" ? declaredName.value : fallbackName,
      version: version.value,
      range: node.value,
      line: engines.keyLine,
      dev: truthy(member(entry.value, "dev")?.value) || truthy(member(entry.value, "devOptional")?.value),
    });
  }
  return entries;
}

function targetVersions(version: string): string[] | undefined {
  const cleaned = version.replace(/^v/, "");
  if (/^\d+$/.test(cleaned)) return [`${cleaned}.0.0`];
  if (/^\d+\.\d+$/.test(cleaned)) return [`${cleaned}.0`];
  const exact = semver.valid(cleaned);
  return exact === null ? undefined : [exact];
}

/** Finds every package whose `engines.node` excludes the target Node.js release. */
export const npmLockAnalyzer: UpgradeAnalyzer = {
  id: ANALYZER_ID,
  runtimes: ["nodejs"],

  async applies(root: string): Promise<boolean> {
    return (await readLockfiles(root)).some(
      (lockfile) => lockfile.version === 1 || lockfile.version === 2 || lockfile.version === 3,
    );
  },

  async analyze(root: string, target: UpgradeTarget): Promise<UpgradeIssue[]> {
    if (target.runtime !== "nodejs") return [];
    const candidates = targetVersions(target.version);
    if (candidates === undefined) return [];
    const issues: UpgradeIssue[] = [];
    const seen = new Set<string>();
    for (const lockfile of await readLockfiles(root)) {
      if (lockfile.version === 1) {
        issues.push({
          analyzer: ANALYZER_ID,
          level: "unknown",
          subject: lockfile.path,
          path: lockfile.path,
          line: lockfile.line,
          reason: `${lockfile.path} uses lockfileVersion 1, which does not record package engines, so support for Node.js ${target.version} is unknown.`,
          evidence: { kind: "lockfile", value: `lockfileVersion: ${lockfile.version}` },
        });
        continue;
      }
      if (lockfile.version !== 2 && lockfile.version !== 3) continue;
      for (const entry of readPackages(lockfile.text)) {
        const identity = `${entry.name}\u0000${entry.version}\u0000${entry.range}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        const valid = semver.validRange(entry.range) !== null;
        const satisfied =
          valid &&
          candidates.some((candidate) => semver.satisfies(candidate, entry.range, { includePrerelease: false }));
        if (satisfied) continue;
        const level = valid ? (entry.dev ? "warning" : "blocker") : "unknown";
        const subject = `${entry.name}@${entry.version}`;
        issues.push({
          analyzer: ANALYZER_ID,
          level,
          subject,
          path: lockfile.path,
          line: entry.line,
          reason: valid
            ? `${subject} declares engines.node "${entry.range}", which excludes Node.js ${target.version}.`
            : `${subject} declares engines.node "${entry.range}", which is not a valid semver range.`,
          evidence: { kind: "lockfile", value: `engines.node: ${entry.range}` },
        });
      }
    }
    return issues;
  },
};

import { stat } from "node:fs/promises";
import { join } from "node:path";

import { member, readJsonLines, type JsonNode } from "../detectors/json-lines.js";
import { parseComposerJson } from "../detectors/php/parse-composer-json.js";
import { readBoundedFile } from "../package-files.js";
import type { UpgradeAnalyzer, UpgradeIssue, UpgradeTarget } from "./types.js";

/**
 * Finds `require.php` constraints in `composer.lock` and `composer.json` that exclude the target PHP release.
 *
 * It reads resolved packages in `packages` (blocker) and `packages-dev` (warning), the lockfile's
 * `platform.php` and `platform-overrides.php`, and the project's own `composer.json` `require.php` (blocker).
 * Constraints are matched with Composer's own syntax: `^`, `~`, `>=`, `<`, `!=`, `*` and `x` wildcards,
 * hyphen ranges, `||` and `|`, and space- or comma-joined AND. A target written as `8.4` is tested as both
 * `8.4.0` and `8.4.99`, so an upper bound such as `<8.5` is not mistaken for a blocker; a version written with
 * three or more parts is tested as written. A constraint the matcher cannot read is reported as `unknown`.
 * Nothing is executed, Composer is never run, and no network is used.
 */

const ANALYZER_ID = "composer-lock";
const LOCKFILE = "composer.lock";
const MANIFEST = "composer.json";

interface PhpVersion {
  parts: readonly [number, number, number, number];
  suffix: string;
  suffixNumber: number;
}

const SUFFIX_RANK: Record<string, number> = {
  "": 4,
  dev: 0,
  alpha: 1,
  a: 1,
  beta: 2,
  b: 2,
  rc: 3,
  pl: 5,
  patch: 5,
  p: 5,
};

/** Parses a PHP version such as `8.4`, `8.4.0`, or `8.4.0RC1`. Returns undefined for anything else. */
export function parsePhpVersion(text: string): PhpVersion | undefined {
  const match = /^[vV]?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(?:[-._]?(dev|alpha|beta|rc|pl|patch|a|b|p)(\d*))?$/i.exec(text.trim());
  if (!match) return undefined;
  const numbers = [match[1], match[2], match[3], match[4]].map((part) => (part === undefined ? 0 : Number(part)));
  const [major, minor, patch, extra] = numbers as [number, number, number, number];
  return {
    parts: [major, minor, patch, extra],
    suffix: (match[5] ?? "").toLowerCase(),
    suffixNumber: match[6] === undefined || match[6] === "" ? 0 : Number(match[6]),
  };
}

function comparePhpVersions(left: PhpVersion, right: PhpVersion): number {
  for (let index = 0; index < 4; index += 1) {
    const difference = (left.parts[index] ?? 0) - (right.parts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  const rank = (SUFFIX_RANK[left.suffix] ?? 4) - (SUFFIX_RANK[right.suffix] ?? 4);
  if (rank !== 0) return rank;
  return left.suffixNumber - right.suffixNumber;
}

function versionFromNumbers(parts: readonly number[]): PhpVersion {
  return {
    parts: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0],
    suffix: "",
    suffixNumber: 0,
  };
}

/** How many numeric parts the text writes, which fixes where `^`, `~`, and hyphen ranges stop. */
function numericSegments(text: string): number {
  const match = /^[vV]?(\d+(?:\.\d+){0,3})/.exec(text.trim());
  if (match?.[1] === undefined) return 0;
  return match[1].split(".").length;
}

type Predicate = (version: PhpVersion) => boolean;

function inRange(lower: PhpVersion, upper: PhpVersion): Predicate {
  return (version) => comparePhpVersions(version, lower) >= 0 && comparePhpVersions(version, upper) < 0;
}

function caret(versionText: string): Predicate | undefined {
  const parsed = parsePhpVersion(versionText);
  if (parsed === undefined) return undefined;
  const segments = numericSegments(versionText);
  if (segments === 0) return undefined;
  const upper = [...parsed.parts];
  let index = -1;
  for (let position = 0; position < Math.min(segments, 3); position += 1) {
    if ((parsed.parts[position] ?? 0) !== 0) {
      index = position;
      break;
    }
  }
  if (index === -1) index = Math.min(segments, 3) - 1;
  upper[index] = (upper[index] ?? 0) + 1;
  for (let position = index + 1; position < 4; position += 1) upper[position] = 0;
  return inRange(parsed, versionFromNumbers(upper));
}

function tilde(versionText: string): Predicate | undefined {
  const parsed = parsePhpVersion(versionText);
  if (parsed === undefined) return undefined;
  const segments = numericSegments(versionText);
  if (segments === 0) return undefined;
  const upper = [...parsed.parts];
  const index = segments >= 2 ? segments - 2 : 0;
  upper[index] = (upper[index] ?? 0) + 1;
  for (let position = index + 1; position < 4; position += 1) upper[position] = 0;
  return inRange(parsed, versionFromNumbers(upper));
}

function wildcard(versionText: string): Predicate | undefined {
  const parts = versionText.split(".");
  const index = parts.findIndex((part) => part === "*" || part.toLowerCase() === "x");
  if (index === -1) return undefined;
  const prefix = parts.slice(0, index).map((part) => Number(part));
  if (prefix.some((part) => !Number.isInteger(part))) return undefined;
  if (prefix.length === 0) return () => true;
  const upper = [...prefix];
  upper[upper.length - 1] = (upper[upper.length - 1] ?? 0) + 1;
  return inRange(versionFromNumbers(prefix), versionFromNumbers(upper));
}

function hyphenRange(lowerText: string, upperText: string): Predicate | undefined {
  const lower = parsePhpVersion(lowerText);
  const upper = parsePhpVersion(upperText);
  if (lower === undefined || upper === undefined) return undefined;
  const segments = numericSegments(upperText);
  if (segments === 0) return undefined;
  if (segments >= 3) {
    return (version) => comparePhpVersions(version, lower) >= 0 && comparePhpVersions(version, upper) <= 0;
  }
  const upperParts = [...upper.parts];
  const index = segments - 1;
  upperParts[index] = (upperParts[index] ?? 0) + 1;
  for (let position = index + 1; position < 4; position += 1) upperParts[position] = 0;
  return inRange(lower, versionFromNumbers(upperParts));
}

function parseTerm(term: string): Predicate | undefined {
  if (term.startsWith("\u0000")) {
    const [, lower, upper] = term.split("\u0000");
    if (lower === undefined || upper === undefined) return undefined;
    return hyphenRange(lower, upper);
  }
  const match = /^(>=|<=|!=|<>|==|=|>|<)?(.+)$/.exec(term);
  if (match === null) return undefined;
  const operator = match[1] ?? "";
  const versionText = match[2]!;
  if (operator === "" && (versionText === "*" || versionText.toLowerCase() === "x")) return () => true;
  if (operator === "" && versionText.startsWith("^")) return caret(versionText.slice(1));
  if (operator === "" && versionText.startsWith("~")) return tilde(versionText.slice(1));
  if (operator === "" && /(^|\.)[*xX](\.|$)/.test(versionText)) return wildcard(versionText);
  const target = parsePhpVersion(versionText);
  if (target === undefined) return undefined;
  switch (operator) {
    case ">=":
      return (version) => comparePhpVersions(version, target) >= 0;
    case ">":
      return (version) => comparePhpVersions(version, target) > 0;
    case "<=":
      return (version) => comparePhpVersions(version, target) <= 0;
    case "<":
      return (version) => comparePhpVersions(version, target) < 0;
    case "!=":
    case "<>":
      return (version) => comparePhpVersions(version, target) !== 0;
    default:
      return (version) => comparePhpVersions(version, target) === 0;
  }
}

function parseAndGroup(group: string): Predicate | undefined {
  const withHyphens = group.replace(/([^\s,|]+)\s+-\s+([^\s,|]+)/g, "\u0000$1\u0000$2\u0000");
  const normalized = withHyphens.replace(/(>=|<=|!=|<>|==|=|>|<)\s+/g, "$1");
  const terms = normalized.split(/[\s,]+/).filter((term) => term !== "");
  if (terms.length === 0) return undefined;
  const predicates: Predicate[] = [];
  for (const term of terms) {
    const predicate = parseTerm(term);
    if (predicate === undefined) return undefined;
    predicates.push(predicate);
  }
  return (version) => predicates.every((predicate) => predicate(version));
}

function parseComposerConstraint(constraint: string): Predicate | undefined {
  const text = constraint.trim();
  if (text === "") return undefined;
  const predicates: Predicate[] = [];
  for (const group of text.split(/\s*\|\|?\s*/)) {
    const predicate = parseAndGroup(group);
    if (predicate === undefined) return undefined;
    predicates.push(predicate);
  }
  return (version) => predicates.some((predicate) => predicate(version));
}

/** True or false when the constraint is understood, `undefined` when it is not Composer syntax this reads. */
export function matchesComposerConstraint(constraint: string, version: string): boolean | undefined {
  const target = parsePhpVersion(version);
  if (target === undefined) return undefined;
  const predicate = parseComposerConstraint(constraint);
  if (predicate === undefined) return undefined;
  return predicate(target);
}

interface LockPackage {
  name: string;
  version: string;
  dev: boolean;
  constraint: string;
  line: number;
}

interface PhpRequirement {
  level: "blocker" | "warning";
  subject: string;
  path: string;
  line: number;
  field: string;
  kind: "lockfile" | "manifest";
  constraint: string;
  requirement: string;
}

function packagesFrom(section: JsonNode | undefined, dev: boolean): LockPackage[] {
  if (section?.kind !== "array") return [];
  const packages: LockPackage[] = [];
  for (const item of section.items) {
    if (item.kind !== "object") continue;
    const name = member(item, "name")?.value;
    const require = member(item, "require");
    const php = member(require?.value, "php")?.value;
    if (name?.kind !== "string" || php?.kind !== "string") continue;
    const constraint = php.value.trim();
    if (constraint === "" || constraint.includes("${")) continue;
    const version = member(item, "version")?.value;
    packages.push({
      name: name.value,
      version: version?.kind === "string" ? version.value.trim() : "",
      dev,
      constraint,
      line: require?.keyLine ?? php.line,
    });
  }
  return packages;
}

function platformPhp(root: JsonNode, key: string): { constraint: string; line: number } | undefined {
  const section = member(root, key);
  if (section === undefined) return undefined;
  const php = member(section.value, "php")?.value;
  if (php?.kind !== "string") return undefined;
  const constraint = php.value.trim();
  if (constraint === "" || constraint.includes("${")) return undefined;
  return { constraint, line: section.keyLine };
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

/** The version as written when it names a release, plus `8.x.99` when it names only a release line. */
function targetVersions(version: string): string[] | undefined {
  const parsed = parsePhpVersion(version);
  if (parsed === undefined) return undefined;
  const segments = numericSegments(version);
  if (segments >= 3) return [version.trim()];
  const [major, minor] = parsed.parts;
  if (segments === 2) return [`${major}.${minor}.0`, `${major}.${minor}.99`];
  return [`${major}.0.0`, `${major}.99.99`];
}

function judge(requirement: PhpRequirement, target: UpgradeTarget, candidates: readonly string[]): UpgradeIssue | undefined {
  const outcomes = candidates.map((candidate) => matchesComposerConstraint(requirement.constraint, candidate));
  const evidence = { kind: requirement.kind, value: `${requirement.field}: ${requirement.constraint}` } as const;
  if (outcomes.some((outcome) => outcome === undefined)) {
    return {
      analyzer: ANALYZER_ID,
      level: "unknown",
      subject: requirement.subject,
      path: requirement.path,
      line: requirement.line,
      reason: `The constraint ${requirement.constraint} in ${requirement.field} is not one this analyzer understands, so support for PHP ${target.version} is unknown.`,
      evidence,
    };
  }
  if (outcomes.some(Boolean)) return undefined;
  return {
    analyzer: ANALYZER_ID,
    level: requirement.level,
    subject: requirement.subject,
    path: requirement.path,
    line: requirement.line,
    reason: `${requirement.requirement} ${requirement.constraint}, which excludes PHP ${target.version}.`,
    evidence,
  };
}

export const composerLockAnalyzer: UpgradeAnalyzer = {
  id: ANALYZER_ID,
  runtimes: ["php"],

  async applies(root: string): Promise<boolean> {
    try {
      return (await stat(join(root, LOCKFILE))).isFile();
    } catch {
      return false;
    }
  },

  async analyze(root: string, target: UpgradeTarget): Promise<UpgradeIssue[]> {
    if (target.runtime !== "php") return [];
    const candidates = targetVersions(target.version);
    if (candidates === undefined) return [];

    const issues: UpgradeIssue[] = [];
    const seen = new Set<string>();
    const lockText = await readText(root, LOCKFILE);
    const lock = lockText === undefined ? undefined : readJsonLines(lockText, { comments: false });
    if (lock?.kind === "object") {
      for (const declaration of [...packagesFrom(member(lock, "packages")?.value, false), ...packagesFrom(member(lock, "packages-dev")?.value, true)]) {
        const key = `${declaration.name}\u0000${declaration.version}\u0000${declaration.constraint}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const subject = declaration.version === "" ? declaration.name : `${declaration.name}@${declaration.version}`;
        const issue = judge(
          {
            level: declaration.dev ? "warning" : "blocker",
            subject,
            path: LOCKFILE,
            line: declaration.line,
            field: "require.php",
            kind: "lockfile",
            constraint: declaration.constraint,
            requirement: `${subject} requires php`,
          },
          target,
          candidates,
        );
        if (issue !== undefined) issues.push(issue);
      }
      for (const [key, field] of [["platform", "platform.php"], ["platform-overrides", "platform-overrides.php"]] as const) {
        const platform = platformPhp(lock, key);
        if (platform === undefined) continue;
        const issue = judge(
          {
            level: "blocker",
            subject: field,
            path: LOCKFILE,
            line: platform.line,
            field,
            kind: "lockfile",
            constraint: platform.constraint,
            requirement: `The lockfile records ${field}`,
          },
          target,
          candidates,
        );
        if (issue !== undefined) issues.push(issue);
      }
    }

    const manifestText = await readText(root, MANIFEST);
    if (manifestText !== undefined) {
      for (const declaration of parseComposerJson(manifestText)) {
        if (declaration.kind !== "require-php") continue;
        const issue = judge(
          {
            level: "blocker",
            subject: MANIFEST,
            path: MANIFEST,
            line: declaration.line,
            field: "require.php",
            kind: "manifest",
            constraint: declaration.value,
            requirement: `${MANIFEST} requires php`,
          },
          target,
          candidates,
        );
        if (issue !== undefined) issues.push(issue);
      }
    }

    return issues;
  },
};

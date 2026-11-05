import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parsePubspec } from "../detectors/dart/parse-pubspec.js";
import { parsePubspecLock } from "../detectors/dart/parse-pubspec-lock.js";
import type { UpgradeAnalyzer, UpgradeIssue, UpgradeTarget } from "./types.js";

/**
 * Dart and Flutter SDK analyzer.
 *
 * A Dart or Flutter project records the SDK it can run on twice: `sdks:` in `pubspec.lock` holds the intersection of
 * every resolved package's bound, and `environment:` in `pubspec.yaml` holds the project's own bound. A target outside
 * either bound is a blocker: the resolved package set would not install, or the project itself would not resolve.
 *
 * Only the two files are read, with the parsers the Dart detector already uses, and no network or command is used.
 * When neither file records a bound for the target runtime, the answer is `unknown`: Evergreen has no evidence.
 */

type Runtime = "dart" | "flutter";

const versions = {
  dart: { kind: "dart-sdk", label: "Dart", field: "environment.sdk" },
  flutter: { kind: "flutter-sdk", label: "Flutter", field: "environment.flutter" },
} as const;

interface DartVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

const FULL_VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const PREFIX_VERSION = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function versionOf(major: number, minor: number, patch: number, prerelease: string[] = []): DartVersion {
  return { major, minor, patch, prerelease };
}

/** Parses a full `x.y.z` Dart version, with an optional pre-release and build suffix. */
function parseVersion(text: string): DartVersion | undefined {
  const match = FULL_VERSION.exec(text);
  if (!match) return undefined;
  return versionOf(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    match[4] === undefined ? [] : match[4].split("."),
  );
}

/** Expands a target such as `3` or `3.5` to `3.0.0` or `3.5.0`, keeping a pre-release suffix. */
export function parseTargetVersion(text: string): { text: string; version: DartVersion } | undefined {
  const match = PREFIX_VERSION.exec(text);
  if (!match) return undefined;
  const minor = match[2] === undefined ? 0 : Number(match[2]);
  const patch = match[3] === undefined ? 0 : Number(match[3]);
  const prerelease = match[4] === undefined ? [] : match[4].split(".");
  const normalized = `${Number(match[1])}.${minor}.${patch}${prerelease.length > 0 ? `-${prerelease.join(".")}` : ""}`;
  return { text: normalized, version: versionOf(Number(match[1]), minor, patch, prerelease) };
}

/** Semver precedence, including pre-release ordering. Build metadata does not take part. */
function compareVersions(left: DartVersion, right: DartVersion): number {
  for (const part of ["major", "minor", "patch"] as const) {
    if (left[part] !== right[part]) return left[part] - right[part];
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

/** A version with no pre-release sorts after one with a pre-release; two empty sets are equal. */
function comparePrerelease(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) {
    return left.length === right.length ? 0 : left.length === 0 ? 1 : -1;
  }
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = comparePrereleaseIdentifier(left[index], right[index]);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** One pre-release identifier pair: a missing part is shorter, numeric parts compare as numbers and sort first. */
function comparePrereleaseIdentifier(left: string | undefined, right: string | undefined): number {
  if (left === undefined) return -1;
  if (right === undefined) return 1;
  const leftNumeric = /^\d+$/.test(left);
  if (leftNumeric !== /^\d+$/.test(right)) return leftNumeric ? -1 : 1;
  return leftNumeric ? Number(left) - Number(right) : left.localeCompare(right);
}

/** The exclusive upper bound of `^version`, following pub's caret rules for `0.x` releases. */
function caretUpper(version: DartVersion): DartVersion {
  if (version.major !== 0) return versionOf(version.major + 1, 0, 0);
  if (version.minor !== 0) return versionOf(0, version.minor + 1, 0);
  return versionOf(0, 0, version.patch + 1);
}

/**
 * True when `version` satisfies a Dart constraint: `any`, one or more space-joined terms, and `^`, `>=`, `<=`, `>`,
 * `<`, or a bare version. An unsupported or malformed term never matches.
 */
export function matchesDartConstraint(version: string, constraint: string): boolean {
  const target = parseVersion(version);
  if (!target) return false;
  const text = constraint.trim();
  if (text === "any") return true;
  const terms = text.split(/\s+/);
  return terms.every((term) => {
    if (term.startsWith("^")) {
      const minimum = parseVersion(term.slice(1));
      return (
        minimum !== undefined &&
        compareVersions(target, minimum) >= 0 &&
        compareVersions(target, caretUpper(minimum)) < 0
      );
    }
    const operator = term.startsWith(">=")
      ? ">="
      : term.startsWith("<=")
        ? "<="
        : term.startsWith(">")
          ? ">"
          : term.startsWith("<")
            ? "<"
            : "";
    const value = parseVersion(operator === "" ? term : term.slice(operator.length));
    if (!value) return false;
    const order = compareVersions(target, value);
    return operator === ">="
      ? order >= 0
      : operator === "<="
        ? order <= 0
        : operator === ">"
          ? order > 0
          : operator === "<"
            ? order < 0
            : order === 0;
  });
}

function bound(
  kind: (typeof versions)[Runtime]["kind"],
  contents: string | undefined,
): { value: string; line: number } | undefined {
  if (contents === undefined) return undefined;
  for (const declaration of parsePubspec(contents)) {
    if (declaration.kind === kind) return { value: declaration.value, line: declaration.line };
  }
  return undefined;
}

function lockBound(
  kind: (typeof versions)[Runtime]["kind"],
  contents: string,
): { value: string; line: number } | undefined {
  for (const declaration of parsePubspecLock(contents)) {
    if (declaration.kind === kind) return { value: declaration.value, line: declaration.line };
  }
  return undefined;
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

export class DartSdkAnalyzer implements UpgradeAnalyzer {
  readonly id = "dart-sdk";
  readonly runtimes = ["dart", "flutter"] as const;

  async applies(root: string): Promise<boolean> {
    try {
      await access(join(root, "pubspec.lock"));
      return true;
    } catch {
      return false;
    }
  }

  async analyze(root: string, target: UpgradeTarget): Promise<UpgradeIssue[]> {
    if (target.runtime !== "dart" && target.runtime !== "flutter") return [];
    const runtime: Runtime = target.runtime;
    const { kind, label, field } = versions[runtime];
    const checked = parseTargetVersion(target.version);
    if (!checked) return [];

    const resolved = lockBound(kind, (await readOptional(join(root, "pubspec.lock"))) ?? "");
    const declared = bound(kind, await readOptional(join(root, "pubspec.yaml")));
    const issues: UpgradeIssue[] = [];

    if (resolved && !matchesDartConstraint(checked.text, resolved.value)) {
      issues.push({
        analyzer: this.id,
        level: "blocker",
        subject: "resolved package set",
        path: "pubspec.lock",
        line: resolved.line,
        reason: `The resolved package set requires ${label} ${resolved.value}, which excludes ${checked.text}.`,
        evidence: { kind: "lockfile", value: resolved.value },
      });
    }

    if (declared && !matchesDartConstraint(checked.text, declared.value)) {
      issues.push({
        analyzer: this.id,
        level: "blocker",
        subject: field,
        path: "pubspec.yaml",
        line: declared.line,
        reason: `pubspec.yaml requires ${label} ${declared.value}, which excludes ${checked.text}.`,
        evidence: { kind: "manifest", value: declared.value },
      });
    }

    if (!resolved && !declared) {
      issues.push({
        analyzer: this.id,
        level: "unknown",
        subject: `${label} SDK`,
        path: "pubspec.lock",
        reason: `Neither pubspec.lock nor pubspec.yaml records a ${label} SDK bound, so ${checked.text} cannot be checked.`,
        evidence: { kind: "lockfile", value: "sdks" },
      });
    }

    return issues;
  }
}

export const dartSdkAnalyzer = new DartSdkAnalyzer();

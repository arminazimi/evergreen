import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import { relativePosix } from "../../paths.js";
import { purlIdentity } from "../../purl.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorContext, DetectorFinding } from "../../sdk.js";
import { parseVersLenient, versContains } from "../../vers/index.js";
import { parsePackageResolved } from "./parse-package-resolved.js";
import { parsePackageSwift } from "./parse-package-swift.js";
import { parseSwiftVersion, parseXcodeVersion } from "./parse-swift-toolchain.js";

/**
 * Swift and Apple toolchains lifecycle detector.
 *
 * It reads the toolchain a project pins in `.swift-version` and `.xcode-version`, the
 * `swift-tools-version` line and literal `from:` / `exact:` dependencies in `Package.swift`, and the
 * resolved pin versions in `Package.resolved`. Every declaration is matched against the rules whose
 * Package URL it names: `pkg:generic/xcode` for `.xcode-version`, `pkg:generic/swift` for the Swift
 * toolchain (`.swift-version` and `swift-tools-version`), and `pkg:swift/<identity>` for a SwiftPM
 * package, where `<identity>` is the identity SwiftPM itself writes in `Package.resolved` — the
 * lowercased repository name without `.git` — so a rule matches the same package in both files.
 *
 * An exact pin is matched against the first rule whose VERS range contains it; a `from:`
 * requirement is a range rather than a version, so it is only matched against a rule that covers
 * every version. A rule whose VERS is malformed never matches and does not hide a later rule.
 * `path:`, `branch:`, `revision:`, range, and interpolated versions are not read. Swift, SwiftPM,
 * and Xcode are never run and nothing is fetched.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 500;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);
const SWIFT_FILES = new Set(["Package.swift", "Package.resolved", ".swift-version", ".xcode-version"]);
/** Rules for the Xcode release a project pins in `.xcode-version`. */
const XCODE_PURL = "pkg:generic/xcode";
/** Rules for the Swift toolchain: `.swift-version` and the manifest's `swift-tools-version`. */
const SWIFT_PURL = "pkg:generic/swift";

async function swiftFiles(root: string): Promise<string[]> {
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
      } else if (entry.isFile() && SWIFT_FILES.has(entry.name)) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0);
  return files;
}

/**
 * The SwiftPM identity of a manifest URL: the last path segment, lowercased, without `.git`, which
 * is the identity `Package.resolved` records. A URL that is not http(s), or one with no path
 * segment, has no identity, so its declaration is never matched.
 */
function packageIdentity(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
  const segment = parsed.pathname.split("/").filter(Boolean).pop();
  if (segment === undefined) return undefined;
  const identity = segment.toLowerCase().replace(/\.git$/, "");
  return identity.length > 0 ? identity : undefined;
}

/** The Package URL a SwiftPM package declaration is matched by. */
function packagePurl(identity: string): string {
  return `pkg:swift/${encodeURIComponent(identity.toLowerCase()).replace(/%3A/gi, ":")}`;
}

/** The rules of a registry grouped by their canonical Package URL identity; an unreadable purl is skipped. */
function rulesByPurl(rules: readonly RegistryV2Rule[]): Map<string, RegistryV2Rule[]> {
  const grouped = new Map<string, RegistryV2Rule[]>();
  for (const rule of rules) {
    let key: string;
    try {
      key = purlIdentity(rule.purl);
    } catch {
      continue;
    }
    const existing = grouped.get(key);
    if (existing) existing.push(rule);
    else grouped.set(key, [rule]);
  }
  return grouped;
}

/** The first rule whose VERS range contains the version. A rule with a malformed VERS is skipped, so it cannot hide a later rule. */
function firstMatchingRule(rules: readonly RegistryV2Rule[], version: string): RegistryV2Rule | undefined {
  for (const rule of rules) {
    try {
      if (versContains(rule.vers, version)) return rule;
    } catch {
      continue;
    }
  }
  return undefined;
}

/** True for a rule that names every version of a package; a `from:` requirement cannot be checked against a narrower range. */
function coversEveryVersion(rule: RegistryV2Rule): boolean {
  try {
    return parseVersLenient(rule.vers).all;
  } catch {
    return false;
  }
}

export class SwiftDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "swift";

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/swift.json`. */
  constructor(private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () => validateRegistryV2(await loadDataFile("registry/swift.json")).rules) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    const files = await swiftFiles(context.root);
    if (files.length === 0) return [];

    const byPurl = rulesByPurl(await this.loadRules());
    const findings: DetectorFinding[] = [];
    const report = (rule: RegistryV2Rule, path: string, line: number, summary: string): void => {
      findings.push({
        id: `${rule.id}:${path}:${line}`,
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
    };

    for (const file of files) {
      let contents: string;
      try {
        contents = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const path = relativePosix(context.root, file);
      const name = basename(file);

      if (name === ".xcode-version") {
        for (const declaration of parseXcodeVersion(contents)) {
          const rule = firstMatchingRule(byPurl.get(XCODE_PURL) ?? [], declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} pins Xcode ${declaration.value}. ${rule.summary}`);
        }
      } else if (name === ".swift-version") {
        for (const declaration of parseSwiftVersion(contents)) {
          const rule = firstMatchingRule(byPurl.get(SWIFT_PURL) ?? [], declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} pins Swift ${declaration.value}. ${rule.summary}`);
        }
      } else if (name === "Package.swift") {
        for (const declaration of parsePackageSwift(contents)) {
          if (declaration.kind === "tools-version") {
            const rule = firstMatchingRule(byPurl.get(SWIFT_PURL) ?? [], declaration.value);
            if (rule) report(rule, path, declaration.line, `${path} declares swift-tools-version ${declaration.value}. ${rule.summary}`);
            continue;
          }
          const identity = packageIdentity(declaration.url);
          if (identity === undefined) continue;
          const rules = byPurl.get(packagePurl(identity)) ?? [];
          if (declaration.requirement === "exact") {
            const rule = firstMatchingRule(rules, declaration.value);
            if (rule) report(rule, path, declaration.line, `${path} pins ${identity} ${declaration.value}. ${rule.summary}`);
          } else {
            const rule = rules.find(coversEveryVersion);
            if (rule) report(rule, path, declaration.line, `${path} requires ${identity} from ${declaration.value}. ${rule.summary}`);
          }
        }
      } else if (name === "Package.resolved") {
        for (const pin of parsePackageResolved(contents)) {
          const rule = firstMatchingRule(byPurl.get(packagePurl(pin.identity)) ?? [], pin.value);
          if (rule) report(rule, path, pin.line, `${path} resolves ${pin.identity} ${pin.value}. ${rule.summary}`);
        }
      }
    }

    findings.sort((left, right) => {
      if (left.location.path !== right.location.path) return left.location.path < right.location.path ? -1 : 1;
      return (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id);
    });
    return findings;
  }
}

export const swiftDetector = new SwiftDetector();

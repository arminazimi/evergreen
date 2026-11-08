import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "@velella/ebb/data-source";
import { relativePosix } from "../../paths.js";
import { purlIdentity } from "@velella/ebb/purl";
import { validateRegistryV2 } from "@velella/ebb/registry";
import type { RegistryV2Rule } from "@velella/ebb/registry";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { analyzeSourceUsage, findSwiftDynamicReferences } from "../../source-usage.js";
import { parseVersLenient, versContains } from "@velella/ebb/vers/index";
import { parsePackageResolved } from "./parse-package-resolved.js";
import { parsePackageSwift } from "./parse-package-swift.js";
import type { SwiftPackageDependencyDeclaration } from "./parse-package-swift.js";
import { parseXcodeProjectIOSDeploymentTargets } from "./parse-xcode-project.js";
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
 *
 * The iOS deployment target in `project.pbxproj` is read only from the build configurations of
 * application targets, so it names an App Store app and never a library. A `platforms:` minimum in
 * `Package.swift` is not matched, because a library declares one without being uploaded.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 500;
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  ".venv",
  "venv",
  "fixtures",
  "__fixtures__",
  "testdata",
]);
const SWIFT_FILES = new Set(["Package.swift", "Package.resolved", ".swift-version", ".xcode-version"]);
/** The Xcode project file. It is read only inside an `.xcodeproj` bundle. */
const XCODE_PROJECT_FILE = "project.pbxproj";
/** Rules for the Xcode release a project pins in `.xcode-version`. */
const XCODE_PURL = "pkg:generic/xcode";
/** Rules for the Swift toolchain: `.swift-version` and the manifest's `swift-tools-version`. */
const SWIFT_PURL = "pkg:generic/swift";
/** Rules for the iOS and iPadOS deployment target of an App Store app target. */
const IOS_PURL = "pkg:generic/ios";

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
      } else if (
        entry.isFile() &&
        (SWIFT_FILES.has(entry.name) ||
          (entry.name === XCODE_PROJECT_FILE && basename(directory).endsWith(".xcodeproj")))
      ) {
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

/** What one `analyze` run collects: the rules by Package URL, the findings, and the findings whose rule has usage matchers. */
interface SwiftScan {
  byPurl: Map<string, RegistryV2Rule[]>;
  findings: DetectorFinding[];
  usageContracts: Array<{ id: string; rule: RegistryV2Rule }>;
}

/** Reads one file of a Swift repository and reports the rules its declarations match. */
type SwiftFileScanner = (scan: SwiftScan, path: string, contents: string) => void;

function rulesFor(scan: SwiftScan, purl: string): RegistryV2Rule[] {
  return scan.byPurl.get(purl) ?? [];
}

/** Record a finding for a rule. A rule with usage matchers is also queued for the source-usage pass. */
function report(scan: SwiftScan, rule: RegistryV2Rule, path: string, line: number, summary: string): void {
  const id = `${rule.id}:${path}:${line}`;
  scan.findings.push({
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
  if ((rule.usage ?? []).length > 0) scan.usageContracts.push({ id, rule });
}

/** Report the matched rule, if there is one. `prefix` says what was read; the rule's summary follows it. */
function reportMatch(
  scan: SwiftScan,
  rule: RegistryV2Rule | undefined,
  path: string,
  line: number,
  prefix: string,
): void {
  if (rule) report(scan, rule, path, line, `${prefix}. ${rule.summary}`);
}

function scanXcodeVersion(scan: SwiftScan, path: string, contents: string): void {
  for (const declaration of parseXcodeVersion(contents)) {
    const rule = firstMatchingRule(rulesFor(scan, XCODE_PURL), declaration.value);
    reportMatch(scan, rule, path, declaration.line, `${path} pins Xcode ${declaration.value}`);
  }
}

function scanSwiftVersion(scan: SwiftScan, path: string, contents: string): void {
  for (const declaration of parseSwiftVersion(contents)) {
    const rule = firstMatchingRule(rulesFor(scan, SWIFT_PURL), declaration.value);
    reportMatch(scan, rule, path, declaration.line, `${path} pins Swift ${declaration.value}`);
  }
}

function scanPackageSwift(scan: SwiftScan, path: string, contents: string): void {
  for (const declaration of parsePackageSwift(contents)) {
    if (declaration.kind === "tools-version") {
      const rule = firstMatchingRule(rulesFor(scan, SWIFT_PURL), declaration.value);
      reportMatch(scan, rule, path, declaration.line, `${path} declares swift-tools-version ${declaration.value}`);
    } else {
      scanPackageDependency(scan, path, declaration);
    }
  }
}

/** An exact pin is matched against the first rule whose range holds it; a `from:` requirement only against a rule that covers every version. */
function scanPackageDependency(scan: SwiftScan, path: string, declaration: SwiftPackageDependencyDeclaration): void {
  const identity = packageIdentity(declaration.url);
  if (identity === undefined) return;
  const rules = rulesFor(scan, packagePurl(identity));
  if (declaration.requirement === "exact") {
    const rule = firstMatchingRule(rules, declaration.value);
    reportMatch(scan, rule, path, declaration.line, `${path} pins ${identity} ${declaration.value}`);
  } else {
    const rule = rules.find(coversEveryVersion);
    reportMatch(scan, rule, path, declaration.line, `${path} requires ${identity} from ${declaration.value}`);
  }
}

function scanProjectFile(scan: SwiftScan, path: string, contents: string): void {
  for (const declaration of parseXcodeProjectIOSDeploymentTargets(contents)) {
    const rule = firstMatchingRule(rulesFor(scan, IOS_PURL), declaration.value);
    reportMatch(
      scan,
      rule,
      path,
      declaration.line,
      `${path} sets IPHONEOS_DEPLOYMENT_TARGET ${declaration.value} on an app target`,
    );
  }
}

function scanPackageResolved(scan: SwiftScan, path: string, contents: string): void {
  for (const pin of parsePackageResolved(contents)) {
    const rule = firstMatchingRule(rulesFor(scan, packagePurl(pin.identity)), pin.value);
    reportMatch(scan, rule, path, pin.line, `${path} resolves ${pin.identity} ${pin.value}`);
  }
}

/** The scanner for each Swift file name. `project.pbxproj` is only ever collected from inside an `.xcodeproj` bundle. */
const SWIFT_FILE_SCANNERS = new Map<string, SwiftFileScanner>([
  [".xcode-version", scanXcodeVersion],
  [".swift-version", scanSwiftVersion],
  ["Package.swift", scanPackageSwift],
  [XCODE_PROJECT_FILE, scanProjectFile],
  ["Package.resolved", scanPackageResolved],
]);

async function scanFile(scan: SwiftScan, root: string, file: string): Promise<void> {
  const scanner = SWIFT_FILE_SCANNERS.get(basename(file));
  if (!scanner) return;
  let contents: string;
  try {
    contents = await readFile(file, "utf8");
  } catch {
    return;
  }
  scanner(scan, relativePosix(root, file), contents);
}

/** Match each usage-bearing finding against the source, and collect the dynamic Swift references that could not be classified. */
async function attachUsages(root: string, scan: SwiftScan): Promise<Array<DetectorAnalysis["unclassified"][number]>> {
  const unclassified: Array<DetectorAnalysis["unclassified"][number]> = [];
  if (scan.usageContracts.length === 0) return unclassified;
  const analyses = new Map(
    (
      await analyzeSourceUsage(
        root,
        scan.usageContracts.map(({ id, rule }) => ({ id, matchers: rule.usage ?? [] })),
      )
    ).map((analysis) => [analysis.contractId, analysis]),
  );
  for (const finding of scan.findings) {
    const analysis = analyses.get(finding.id);
    if (analysis) Object.assign(finding, { usages: analysis.usages, impact: analysis.impact });
  }
  for (const reference of await findSwiftDynamicReferences(root)) {
    unclassified.push({
      component: "swift",
      reference: reference.reference,
      reason: reference.reason,
      location: { path: reference.path, line: reference.line, column: reference.column },
    });
  }
  return unclassified;
}

/** Findings in path order, then line order, then identifier. */
function compareFindings(left: DetectorFinding, right: DetectorFinding): number {
  if (left.location.path !== right.location.path) return left.location.path < right.location.path ? -1 : 1;
  return (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id);
}

export class SwiftDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "swift";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: ["Package.swift", "Package.resolved", ".swift-version", ".xcode-version", "project.pbxproj"],
    sourceExtensions: [".swift"],
  };

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/swift.json`. */
  constructor(
    private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () =>
      validateRegistryV2(await loadDataFile("registry/swift.json")).rules,
  ) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await swiftFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const scan: SwiftScan = { byPurl: rulesByPurl(await this.loadRules()), findings: [], usageContracts: [] };
    for (const file of files) await scanFile(scan, context.root, file);
    const unclassified = await attachUsages(context.root, scan);
    scan.findings.sort(compareFindings);
    return { findings: scan.findings, unclassified };
  }
}

export const swiftDetector = new SwiftDetector();

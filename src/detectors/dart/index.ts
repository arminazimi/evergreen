import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import { relativePosix } from "../../paths.js";
import { purlIdentity } from "../../purl.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { analyzeSourceUsage, findDartDynamicReferences } from "../../source-usage.js";
import { parseVersLenient, versContains } from "../../vers/index.js";
import { parseFvmConfigJson, parseFvmrc } from "./parse-fvm.js";
import { parsePubspec } from "./parse-pubspec.js";
import { parsePubspecLock } from "./parse-pubspec-lock.js";

/**
 * Dart and Flutter lifecycle detector.
 *
 * It reads the SDK constraints and direct dependencies in `pubspec.yaml`, the resolved packages and SDK
 * constraints in `pubspec.lock`, and the Flutter version pinned in `.fvmrc` and `.fvm/fvm_config.json`.
 * Every declaration is matched against the rules whose Package URL it names: `pkg:generic/dart` for the Dart
 * SDK, `pkg:generic/flutter` for the Flutter SDK, and `pkg:pub/<name>` for a hosted package.
 *
 * A version that is pinned exactly (a resolved `pubspec.lock` package, an FVM pin, or a constraint written
 * without an operator) is matched against the first rule whose VERS range contains it. A constraint such as
 * `^1.0.0` or `>=3.8.0 <4.0.0` admits versions outside any single release line, so it is only matched against
 * a rule that covers every version, which is how a discontinued package is recorded. A rule whose VERS is
 * malformed never matches and does not hide a later rule. Dart, Flutter, and pub are never run and nothing is
 * fetched.
 *
 * A rule that lists `usage` matchers also gets the `.dart` files that import its package, call it through an
 * `as` prefix, or call a name it imports with `show`, so a migration packet lists exact files. A bare import
 * brings unknown names into scope, so its unqualified calls are not attributed. `Function.apply` and
 * `dart:mirrors` reflection are reported as unclassified.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 500;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", ".dart_tool", "fixtures", "__fixtures__", "testdata"]);
const DART_FILES = new Set(["pubspec.yaml", "pubspec.lock", ".fvmrc"]);
/** The legacy FVM configuration. It is read only inside an `.fvm` directory. */
const FVM_CONFIG_FILE = "fvm_config.json";
const DART_PURL = "pkg:generic/dart";
const FLUTTER_PURL = "pkg:generic/flutter";
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

async function dartFiles(root: string): Promise<string[]> {
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
      } else if (entry.isFile() && (DART_FILES.has(entry.name) || (entry.name === FVM_CONFIG_FILE && basename(directory) === ".fvm"))) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0);
  return files;
}

/** The Package URL a hosted pub package is matched by. */
function packagePurl(name: string): string {
  return `pkg:pub/${name}`;
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

/** True for a rule that names every version of a package; a constraint cannot be checked against a narrower range. */
function coversEveryVersion(rule: RegistryV2Rule): boolean {
  try {
    return parseVersLenient(rule.vers).all;
  } catch {
    return false;
  }
}

/** The rule a declared version or constraint matches: an exact version by range, any other constraint only by a rule covering every version. */
function ruleForDeclared(rules: readonly RegistryV2Rule[], value: string): RegistryV2Rule | undefined {
  return EXACT_VERSION.test(value) ? firstMatchingRule(rules, value) : rules.find(coversEveryVersion);
}

export class DartDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "dart";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = { fileNames: ["pubspec.yaml", "pubspec.lock", ".fvmrc", "fvm_config.json"], sourceExtensions: [".dart"] };

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/dart.json`. */
  constructor(private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () => validateRegistryV2(await loadDataFile("registry/dart.json")).rules) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await dartFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const byPurl = rulesByPurl(await this.loadRules());
    const findings: DetectorFinding[] = [];
    const usageContracts: Array<{ id: string; rule: RegistryV2Rule }> = [];
    const report = (rule: RegistryV2Rule, path: string, line: number, summary: string): void => {
      const id = `${rule.id}:${path}:${line}`;
      findings.push({
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
      if ((rule.usage ?? []).length > 0) usageContracts.push({ id, rule });
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

      if (name === ".fvmrc" || name === FVM_CONFIG_FILE) {
        for (const declaration of name === ".fvmrc" ? parseFvmrc(contents) : parseFvmConfigJson(contents)) {
          const rule = firstMatchingRule(byPurl.get(FLUTTER_PURL) ?? [], declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} pins Flutter ${declaration.value}. ${rule.summary}`);
        }
        continue;
      }

      for (const declaration of name === "pubspec.lock" ? parsePubspecLock(contents) : parsePubspec(contents)) {
        if (declaration.kind === "dart-sdk" || declaration.kind === "flutter-sdk") {
          const sdk = declaration.kind === "dart-sdk" ? "Dart" : "Flutter";
          const rule = ruleForDeclared(byPurl.get(declaration.kind === "dart-sdk" ? DART_PURL : FLUTTER_PURL) ?? [], declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} declares ${sdk} SDK ${declaration.value}. ${rule.summary}`);
        } else if (declaration.kind === "pub-package") {
          const rule = firstMatchingRule(byPurl.get(packagePurl(declaration.name)) ?? [], declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} resolves ${declaration.name} ${declaration.value}. ${rule.summary}`);
        } else {
          const rule = ruleForDeclared(byPurl.get(packagePurl(declaration.name)) ?? [], declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} depends on ${declaration.name} ${declaration.value}. ${rule.summary}`);
        }
      }
    }

    const unclassified: Array<DetectorAnalysis["unclassified"][number]> = [];
    if (usageContracts.length > 0) {
      const analyses = new Map((await analyzeSourceUsage(context.root, usageContracts.map(({ id, rule }) => ({ id, matchers: rule.usage ?? [] })))).map((analysis) => [analysis.contractId, analysis]));
      for (const finding of findings) {
        const analysis = analyses.get(finding.id);
        if (analysis) Object.assign(finding, { usages: analysis.usages, impact: analysis.impact });
      }
      for (const reference of await findDartDynamicReferences(context.root)) {
        unclassified.push({
          component: "dart",
          reference: reference.reference,
          reason: reference.reason,
          location: { path: reference.path, line: reference.line, column: reference.column },
        });
      }
    }

    findings.sort((left, right) => {
      if (left.location.path !== right.location.path) return left.location.path < right.location.path ? -1 : 1;
      return (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id);
    });
    return { findings, unclassified };
  }
}

export const dartDetector = new DartDetector();

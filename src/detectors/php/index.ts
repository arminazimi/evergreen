import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "@velella/ebb/data-source";
import { relativePosix } from "../../paths.js";
import { validateRegistryV2 } from "@velella/ebb/registry";
import type { RegistryV2Rule } from "@velella/ebb/registry";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type {
  Detector,
  DetectorAnalysis,
  DetectorContext,
  DetectorFinding,
  DetectorInputs,
  DetectorUnclassifiedReference,
} from "../../sdk.js";
import { analyzeSourceUsage, findPhpDynamicReferences } from "../../source-usage.js";
import { parseVersLenient, versContains } from "@velella/ebb/vers/index";
import { parseComposerJson } from "./parse-composer-json.js";
import { parseComposerLock } from "./parse-composer-lock.js";
import { allowedPhpLines } from "./parse-php-constraint.js";
import { parsePhpVersion, parseToolVersions } from "./parse-php-runtime.js";

/**
 * Finds PHP release lines that are end of life, and Composer packages covered by a lifecycle rule.
 *
 * It reads the runtime pins in `.php-version`, `.tool-versions`, `composer.json` `require.php` and
 * `config.platform.php`, and `composer.lock` `platform.php`; direct packages in `composer.json` for rules that
 * cover every version; and resolved packages in `composer.lock`. An `abandoned` flag records what Composer wrote
 * and is not itself a finding. A package rule with usage matchers also lists quoted `require` and `include`
 * paths and `use` names of that package, and the qualified calls and constructors those matchers name
 * (`Class::method` and `new Class`). When such a finding exists, a require or include whose argument is not a
 * string literal is unclassified, as is `new $class` or `$class::method()`. Runtime end-of-life rules do not
 * name source usages. PHP, phpenv, asdf, and Composer are never run and nothing is fetched.
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
const RUNTIME_PURL = "pkg:generic/php";
const COMPOSER_PURL_PREFIX = "pkg:composer/";
const PHP_FILES = new Set([".php-version", ".tool-versions", "composer.json", "composer.lock"]);

async function phpFiles(root: string): Promise<string[]> {
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
      } else if (entry.isFile() && PHP_FILES.has(entry.name)) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0);
  return files;
}

/** The phpenv prefix is not part of a PHP version. */
function runtimeVersion(value: string): string {
  return value.startsWith("php-") ? value.slice("php-".length) : value;
}

/** The first rule whose VERS range contains the version. A rule whose VERS is malformed is skipped. */
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

/** True for a rule that names every version of a package; false for one that lists specific versions. */
function coversEveryVersion(rule: RegistryV2Rule): boolean {
  try {
    return parseVersLenient(rule.vers).all;
  } catch {
    return false;
  }
}

type RuleList = readonly RegistryV2Rule[];

/** Findings and the rules that still need their usages matched, collected while the files are read. */
interface ScanState {
  readonly findings: DetectorFinding[];
  readonly withUsage: Array<{ id: string; rule: RegistryV2Rule }>;
}

function reportFinding(state: ScanState, rule: RegistryV2Rule, path: string, line: number, summary: string): void {
  const id = `${rule.id}:${path}:${line}`;
  state.findings.push({
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
  if ((rule.usage ?? []).length > 0) state.withUsage.push({ id, rule });
}

/** Splits the registry into runtime rules and package rules keyed by the decoded Composer package name. */
function indexRules(rules: RuleList): {
  runtimeRules: RuleList;
  packageRules: Map<string, RegistryV2Rule[]>;
} {
  const packageRules = new Map<string, RegistryV2Rule[]>();
  for (const rule of rules) {
    if (!rule.purl.startsWith(COMPOSER_PURL_PREFIX)) continue;
    const name = decodeURIComponent(rule.purl.slice(COMPOSER_PURL_PREFIX.length));
    const existing = packageRules.get(name);
    if (existing) existing.push(rule);
    else packageRules.set(name, [rule]);
  }
  return {
    runtimeRules: rules.filter((rule) => rule.purl === RUNTIME_PURL),
    packageRules,
  };
}

/** A PHP runtime pin: the first runtime rule whose range contains it is reported with the given verb. */
function reportRuntime(
  state: ScanState,
  runtimeRules: RuleList,
  path: string,
  declaration: { value: string; line: number },
  verb: string,
): void {
  const version = runtimeVersion(declaration.value);
  const rule = firstMatchingRule(runtimeRules, version) ?? endOfLifeCeiling(runtimeRules, version);
  if (rule) reportFinding(state, rule, path, declaration.line, `${path} ${verb} PHP ${version}. ${rule.summary}`);
}

/**
 * A constraint such as `^7.3` that can only resolve to end-of-life releases: the rule of the newest line it
 * allows. A constraint that also allows a supported or unjudged line returns nothing.
 */
function endOfLifeCeiling(runtimeRules: RuleList, constraint: string): RegistryV2Rule | undefined {
  const lines = allowedPhpLines(constraint);
  if (!lines) return undefined;
  const rules = lines.map((line) => firstMatchingRule(runtimeRules, `${line}.0`));
  if (rules.some((rule) => rule === undefined)) return undefined;
  return rules[rules.length - 1];
}

/** A direct `composer.json` package: only rules that name every version of the package apply. */
function reportDeclaredPackage(
  state: ScanState,
  packageRules: ReadonlyMap<string, RegistryV2Rule[]>,
  path: string,
  declaration: { name: string; value: string; line: number },
): void {
  for (const rule of packageRules.get(declaration.name) ?? []) {
    if (coversEveryVersion(rule))
      reportFinding(
        state,
        rule,
        path,
        declaration.line,
        `${path} declares ${declaration.name} ${declaration.value}. ${rule.summary}`,
      );
  }
}

/** A locked package version: the first rule whose range contains the resolved version is reported. */
function reportResolvedPackage(
  state: ScanState,
  packageRules: ReadonlyMap<string, RegistryV2Rule[]>,
  path: string,
  declaration: { name: string; value: string; line: number },
): void {
  const rule = firstMatchingRule(packageRules.get(declaration.name) ?? [], declaration.value);
  if (rule)
    reportFinding(
      state,
      rule,
      path,
      declaration.line,
      `${path} resolves ${declaration.name} ${declaration.value}. ${rule.summary}`,
    );
}

function scanComposerJson(
  state: ScanState,
  runtimeRules: RuleList,
  packageRules: ReadonlyMap<string, RegistryV2Rule[]>,
  path: string,
  contents: string,
): void {
  for (const declaration of parseComposerJson(contents)) {
    if (declaration.kind === "require-php") reportRuntime(state, runtimeRules, path, declaration, "requires");
    else if (declaration.kind === "platform-php") reportRuntime(state, runtimeRules, path, declaration, "pins");
    else reportDeclaredPackage(state, packageRules, path, declaration);
  }
}

function scanComposerLock(
  state: ScanState,
  runtimeRules: RuleList,
  packageRules: ReadonlyMap<string, RegistryV2Rule[]>,
  path: string,
  contents: string,
): void {
  for (const declaration of parseComposerLock(contents)) {
    if (declaration.kind === "platform-php") reportRuntime(state, runtimeRules, path, declaration, "resolves");
    else reportResolvedPackage(state, packageRules, path, declaration);
  }
}

/** Reads one of the four PHP files, whichever it is, and reports what it declares. */
function scanFile(
  state: ScanState,
  runtimeRules: RuleList,
  packageRules: ReadonlyMap<string, RegistryV2Rule[]>,
  name: string,
  path: string,
  contents: string,
): void {
  if (name === ".php-version") {
    for (const declaration of parsePhpVersion(contents)) reportRuntime(state, runtimeRules, path, declaration, "pins");
  } else if (name === ".tool-versions") {
    for (const declaration of parseToolVersions(contents))
      reportRuntime(state, runtimeRules, path, declaration, "pins");
  } else if (name === "composer.json") {
    scanComposerJson(state, runtimeRules, packageRules, path, contents);
  } else if (name === "composer.lock") {
    scanComposerLock(state, runtimeRules, packageRules, path, contents);
  }
}

/** Matches the usage rules of every finding that has them, and lists the dynamic references that block a match. */
async function attachUsages(root: string, state: ScanState): Promise<DetectorUnclassifiedReference[]> {
  if (state.withUsage.length === 0) return [];
  const analyses = new Map(
    (
      await analyzeSourceUsage(
        root,
        state.withUsage.map((item) => ({
          id: item.id,
          matchers: item.rule.usage ?? [],
        })),
      )
    ).map((analysis) => [analysis.contractId, analysis]),
  );
  for (const finding of state.findings) {
    const analysis = analyses.get(finding.id);
    if (analysis)
      Object.assign(finding, {
        usages: analysis.usages,
        impact: analysis.impact,
      });
  }
  return (await findPhpDynamicReferences(root)).map((reference) => ({
    component: "php",
    reference: reference.reference,
    reason: reference.reason,
    location: {
      path: reference.path,
      line: reference.line,
      column: reference.column,
    },
  }));
}

/** By path, then line, then id. */
function compareFindings(left: DetectorFinding, right: DetectorFinding): number {
  if (left.location.path !== right.location.path) return left.location.path < right.location.path ? -1 : 1;
  return (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id);
}

export class PhpDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "php";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: [".php-version", ".tool-versions", "composer.json", "composer.lock"],
    sourceExtensions: [".php"],
  };

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/php.json`. */
  constructor(
    private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () =>
      validateRegistryV2(await loadDataFile("registry/php.json")).rules,
  ) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await phpFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const { runtimeRules, packageRules } = indexRules(await this.loadRules());
    const state: ScanState = { findings: [], withUsage: [] };
    for (const file of files) {
      let contents: string;
      try {
        contents = await readFile(file, "utf8");
      } catch {
        continue;
      }
      scanFile(state, runtimeRules, packageRules, basename(file), relativePosix(context.root, file), contents);
    }

    const unclassified = await attachUsages(context.root, state);
    state.findings.sort(compareFindings);
    return { findings: state.findings, unclassified };
  }
}

export const phpDetector = new PhpDetector();

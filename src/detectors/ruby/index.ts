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
import { analyzeSourceUsage, findRubyDynamicReferences } from "../../source-usage.js";
import { parseVersLenient, versContains } from "@velella/ebb/vers/index";
import { parseGemfile } from "./parse-gemfile.js";
import { parseGemfileLock } from "./parse-gemfile-lock.js";
import { allowedRubyLines } from "./parse-ruby-requirement.js";
import { parseRubyVersion, parseToolVersions } from "./parse-ruby-runtime.js";

/**
 * Finds Ruby release lines that are end of life, and resolved gems covered by a lifecycle rule.
 *
 * It reads the runtime pins in `.ruby-version`, `.tool-versions`, the Gemfile `ruby` directive, and
 * Gemfile.lock `RUBY VERSION`; direct gems in a Gemfile for rules that cover every version; and resolved
 * gems in Gemfile.lock. A gem rule with usage matchers also lists `require`, `load`, `gem`, and
 * `autoload` of that gem, and the qualified calls and aliases those matchers name. When such a finding
 * exists, a require, load, or gem whose argument is not a string literal is unclassified, as is an
 * invocation skipped by a scan bound. Ruby, rbenv, asdf, and Bundler are never run and nothing is fetched.
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
const RUNTIME_PURL = "pkg:generic/ruby";
const GEM_PURL_PREFIX = "pkg:gem/";
const RUBY_FILES = new Set([".ruby-version", ".tool-versions", "Gemfile", "Gemfile.lock"]);

async function rubyFiles(root: string): Promise<string[]> {
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
      } else if (entry.isFile() && RUBY_FILES.has(entry.name)) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0);
  return files;
}

/** The rbenv prefix is not part of a RubyGems version, and `p53` is a Ruby patchlevel, not a prerelease. */
function runtimeVersion(value: string): string {
  const withoutPrefix = value.startsWith("ruby-") ? value.slice("ruby-".length) : value;
  return withoutPrefix.replace(/p\d+$/, "");
}

/** The runtime as written, without the rbenv prefix, for the finding summary. */
function displayRuntimeVersion(value: string): string {
  return value.startsWith("ruby-") ? value.slice("ruby-".length) : value;
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

/** True for a rule that names every version of a gem; false for one that lists specific versions. */
const coversEveryVersion = (rule: RegistryV2Rule): boolean => parseVersLenient(rule.vers).all;

type RuleList = readonly RegistryV2Rule[];
type Declaration = { value: string; line: number };

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

/** Splits the registry into runtime rules and gem rules keyed by the decoded gem name. */
function indexRules(rules: RuleList): {
  runtimeRules: RuleList;
  gemRules: Map<string, RegistryV2Rule[]>;
} {
  const gemRules = new Map<string, RegistryV2Rule[]>();
  for (const rule of rules) {
    if (!rule.purl.startsWith(GEM_PURL_PREFIX)) continue;
    const name = decodeURIComponent(rule.purl.slice(GEM_PURL_PREFIX.length));
    const existing = gemRules.get(name);
    if (existing) existing.push(rule);
    else gemRules.set(name, [rule]);
  }
  return {
    runtimeRules: rules.filter((rule) => rule.purl === RUNTIME_PURL),
    gemRules,
  };
}

/**
 * A Gemfile requirement such as `>= 2.5.0, < 2.7.0` that can only resolve to end-of-life releases: the rule of
 * the newest line it allows. A requirement that also allows a supported or unjudged line returns nothing.
 */
function endOfLifeCeiling(runtimeRules: RuleList, requirement: string): RegistryV2Rule | undefined {
  const lines = allowedRubyLines(requirement.split(/\s*,\s*/));
  if (!lines) return undefined;
  const rules = lines.map((line) => firstMatchingRule(runtimeRules, `${line}.0`));
  if (rules.some((rule) => rule === undefined)) return undefined;
  return rules[rules.length - 1];
}

/** A Ruby runtime pin: the first runtime rule whose range contains it is reported with the given verb. */
function reportRuntime(
  state: ScanState,
  runtimeRules: RuleList,
  path: string,
  declaration: Declaration,
  verb: string,
): void {
  const rule =
    firstMatchingRule(runtimeRules, runtimeVersion(declaration.value)) ??
    endOfLifeCeiling(runtimeRules, declaration.value);
  if (rule)
    reportFinding(
      state,
      rule,
      path,
      declaration.line,
      `${path} ${verb} Ruby ${displayRuntimeVersion(declaration.value)}. ${rule.summary}`,
    );
}

/** A direct Gemfile gem: only rules that name every version of the gem apply. */
function reportDeclaredGem(
  state: ScanState,
  gemRules: ReadonlyMap<string, RegistryV2Rule[]>,
  path: string,
  declaration: { name: string; value: string; line: number },
): void {
  for (const rule of gemRules.get(declaration.name) ?? []) {
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

/** A resolved gem version: the first rule whose range contains the locked version is reported. */
function reportResolvedGem(
  state: ScanState,
  gemRules: ReadonlyMap<string, RegistryV2Rule[]>,
  path: string,
  declaration: { name: string; value: string; line: number },
): void {
  const rule = firstMatchingRule(gemRules.get(declaration.name) ?? [], declaration.value);
  if (rule)
    reportFinding(
      state,
      rule,
      path,
      declaration.line,
      `${path} resolves ${declaration.name} ${declaration.value}. ${rule.summary}`,
    );
}

function scanGemfile(
  state: ScanState,
  runtimeRules: RuleList,
  gemRules: ReadonlyMap<string, RegistryV2Rule[]>,
  path: string,
  contents: string,
): void {
  for (const declaration of parseGemfile(contents)) {
    if (declaration.kind === "ruby") reportRuntime(state, runtimeRules, path, declaration, "requires");
    else reportDeclaredGem(state, gemRules, path, declaration);
  }
}

function scanGemfileLock(
  state: ScanState,
  runtimeRules: RuleList,
  gemRules: ReadonlyMap<string, RegistryV2Rule[]>,
  path: string,
  contents: string,
): void {
  for (const declaration of parseGemfileLock(contents)) {
    if (declaration.kind === "ruby") reportRuntime(state, runtimeRules, path, declaration, "resolves");
    else reportResolvedGem(state, gemRules, path, declaration);
  }
}

/** Reads one of the four Ruby files, whichever it is, and reports what it declares. */
function scanFile(
  state: ScanState,
  runtimeRules: RuleList,
  gemRules: ReadonlyMap<string, RegistryV2Rule[]>,
  name: string,
  path: string,
  contents: string,
): void {
  if (name === ".ruby-version") {
    for (const declaration of parseRubyVersion(contents)) reportRuntime(state, runtimeRules, path, declaration, "pins");
  } else if (name === ".tool-versions") {
    for (const declaration of parseToolVersions(contents))
      reportRuntime(state, runtimeRules, path, declaration, "pins");
  } else if (name === "Gemfile") {
    scanGemfile(state, runtimeRules, gemRules, path, contents);
  } else if (name === "Gemfile.lock") {
    scanGemfileLock(state, runtimeRules, gemRules, path, contents);
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
  return (await findRubyDynamicReferences(root)).map((reference) => ({
    component: "ruby",
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

export class RubyDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "ruby";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: [".ruby-version", ".tool-versions", "Gemfile", "Gemfile.lock"],
    sourceExtensions: [".rb", ".rake", ".ru"],
  };

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/ruby.json`. */
  constructor(
    private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () =>
      validateRegistryV2(await loadDataFile("registry/ruby.json")).rules,
  ) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await rubyFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const { runtimeRules, gemRules } = indexRules(await this.loadRules());
    const state: ScanState = { findings: [], withUsage: [] };
    for (const file of files) {
      let contents: string;
      try {
        contents = await readFile(file, "utf8");
      } catch {
        continue;
      }
      scanFile(state, runtimeRules, gemRules, basename(file), relativePosix(context.root, file), contents);
    }

    const unclassified = await attachUsages(context.root, state);
    state.findings.sort(compareFindings);
    return { findings: state.findings, unclassified };
  }
}

export const rubyDetector = new RubyDetector();

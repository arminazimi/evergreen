import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import { relativePosix } from "../../paths.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding } from "../../sdk.js";
import { analyzeSourceUsage, findRubyDynamicReferences } from "../../source-usage.js";
import { parseVersLenient, versContains } from "../../vers/index.js";
import { parseGemfile } from "./parse-gemfile.js";
import { parseGemfileLock } from "./parse-gemfile-lock.js";
import { parseRubyVersion, parseToolVersions } from "./parse-ruby-runtime.js";

/**
 * Finds Ruby release lines that are end of life, and resolved gems covered by a lifecycle rule.
 *
 * It reads the runtime pins in `.ruby-version`, `.tool-versions`, the Gemfile `ruby` directive, and
 * Gemfile.lock `RUBY VERSION`; direct gems in a Gemfile for rules that cover every version; and resolved
 * gems in Gemfile.lock. A gem rule with usage matchers also lists `require`, `load`, `gem`, and
 * `autoload` of that gem, and the qualified calls and aliases those matchers name. A require, load, or
 * gem whose argument is not a string literal is unclassified. Ruby, rbenv, asdf, and Bundler are never
 * run and nothing is fetched.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 500;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);
const RUNTIME_PURL = "pkg:generic/ruby";
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

export class RubyDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "ruby";

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/ruby.json`. */
  constructor(private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () => validateRegistryV2(await loadDataFile("registry/ruby.json")).rules) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await rubyFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const rules = await this.loadRules();
    const runtimeRules = rules.filter((rule) => rule.purl === RUNTIME_PURL);
    const gemRules = new Map<string, RegistryV2Rule[]>();
    for (const rule of rules) {
      if (!rule.purl.startsWith("pkg:gem/")) continue;
      const name = decodeURIComponent(rule.purl.slice("pkg:gem/".length));
      const existing = gemRules.get(name);
      if (existing) existing.push(rule);
      else gemRules.set(name, [rule]);
    }

    const findings: DetectorFinding[] = [];
    const withUsage: Array<{ id: string; rule: RegistryV2Rule }> = [];
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
      if ((rule.usage ?? []).length > 0) withUsage.push({ id, rule });
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

      if (name === ".ruby-version" || name === ".tool-versions") {
        const declarations = name === ".ruby-version" ? parseRubyVersion(contents) : parseToolVersions(contents);
        for (const declaration of declarations) {
          const rule = firstMatchingRule(runtimeRules, runtimeVersion(declaration.value));
          if (rule) report(rule, path, declaration.line, `${path} pins Ruby ${displayRuntimeVersion(declaration.value)}. ${rule.summary}`);
        }
      } else if (name === "Gemfile") {
        for (const declaration of parseGemfile(contents)) {
          if (declaration.kind === "ruby") {
            const rule = firstMatchingRule(runtimeRules, runtimeVersion(declaration.value));
            if (rule) report(rule, path, declaration.line, `${path} requires Ruby ${displayRuntimeVersion(declaration.value)}. ${rule.summary}`);
            continue;
          }
          for (const rule of gemRules.get(declaration.name) ?? []) {
            if (coversEveryVersion(rule)) report(rule, path, declaration.line, `${path} declares ${declaration.name} ${declaration.value}. ${rule.summary}`);
          }
        }
      } else if (name === "Gemfile.lock") {
        for (const declaration of parseGemfileLock(contents)) {
          if (declaration.kind === "ruby") {
            const rule = firstMatchingRule(runtimeRules, runtimeVersion(declaration.value));
            if (rule) report(rule, path, declaration.line, `${path} resolves Ruby ${displayRuntimeVersion(declaration.value)}. ${rule.summary}`);
            continue;
          }
          const rule = firstMatchingRule(gemRules.get(declaration.name) ?? [], declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} resolves ${declaration.name} ${declaration.value}. ${rule.summary}`);
        }
      }
    }

    if (withUsage.length > 0) {
      const analyses = new Map((await analyzeSourceUsage(context.root, withUsage.map((item) => ({ id: item.id, matchers: item.rule.usage ?? [] })))).map((analysis) => [analysis.contractId, analysis]));
      for (const finding of findings) {
        const analysis = analyses.get(finding.id);
        if (analysis) Object.assign(finding, { usages: analysis.usages, impact: analysis.impact });
      }
    }

    const unclassified = (await findRubyDynamicReferences(context.root)).map((reference) => ({
      component: "ruby",
      reference: reference.reference,
      reason: "the argument is not a string literal, so Evergreen does not attribute it to a gem",
      location: { path: reference.path, line: reference.line, column: reference.column },
    }));

    findings.sort((left, right) => {
      if (left.location.path !== right.location.path) return left.location.path < right.location.path ? -1 : 1;
      return (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id);
    });
    return { findings, unclassified };
  }
}

export const rubyDetector = new RubyDetector();

import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import { relativePosix } from "../../paths.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorContext, DetectorFinding } from "../../sdk.js";
import { parseVersLenient, versContains } from "../../vers/index.js";
import { parseComposerJson } from "./parse-composer-json.js";
import { parseComposerLock } from "./parse-composer-lock.js";
import { parsePhpVersion, parseToolVersions } from "./parse-php-runtime.js";

/**
 * Finds PHP release lines that are end of life, and Composer packages covered by a lifecycle rule.
 *
 * It reads the runtime pins in `.php-version`, `.tool-versions`, `composer.json` `require.php` and
 * `config.platform.php`, and `composer.lock` `platform.php`; direct packages in `composer.json` for rules that
 * cover every version; and resolved packages in `composer.lock`. An `abandoned` flag records what Composer wrote
 * and is not itself a finding. PHP, phpenv, asdf, and Composer are never run and nothing is fetched.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 500;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);
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

export class PhpDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "php";

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/php.json`. */
  constructor(private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () => validateRegistryV2(await loadDataFile("registry/php.json")).rules) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    const files = await phpFiles(context.root);
    if (files.length === 0) return [];

    const rules = await this.loadRules();
    const runtimeRules = rules.filter((rule) => rule.purl === RUNTIME_PURL);
    const packageRules = new Map<string, RegistryV2Rule[]>();
    for (const rule of rules) {
      if (!rule.purl.startsWith(COMPOSER_PURL_PREFIX)) continue;
      const name = decodeURIComponent(rule.purl.slice(COMPOSER_PURL_PREFIX.length));
      const existing = packageRules.get(name);
      if (existing) existing.push(rule);
      else packageRules.set(name, [rule]);
    }

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

      if (name === ".php-version" || name === ".tool-versions") {
        const declarations = name === ".php-version" ? parsePhpVersion(contents) : parseToolVersions(contents);
        for (const declaration of declarations) {
          const version = runtimeVersion(declaration.value);
          const rule = firstMatchingRule(runtimeRules, version);
          if (rule) report(rule, path, declaration.line, `${path} pins PHP ${version}. ${rule.summary}`);
        }
      } else if (name === "composer.json") {
        for (const declaration of parseComposerJson(contents)) {
          if (declaration.kind === "require-php" || declaration.kind === "platform-php") {
            const version = runtimeVersion(declaration.value);
            const rule = firstMatchingRule(runtimeRules, version);
            const verb = declaration.kind === "require-php" ? "requires" : "pins";
            if (rule) report(rule, path, declaration.line, `${path} ${verb} PHP ${version}. ${rule.summary}`);
            continue;
          }
          for (const rule of packageRules.get(declaration.name) ?? []) {
            if (coversEveryVersion(rule)) report(rule, path, declaration.line, `${path} declares ${declaration.name} ${declaration.value}. ${rule.summary}`);
          }
        }
      } else if (name === "composer.lock") {
        for (const declaration of parseComposerLock(contents)) {
          if (declaration.kind === "platform-php") {
            const version = runtimeVersion(declaration.value);
            const rule = firstMatchingRule(runtimeRules, version);
            if (rule) report(rule, path, declaration.line, `${path} resolves PHP ${version}. ${rule.summary}`);
            continue;
          }
          const rule = firstMatchingRule(packageRules.get(declaration.name) ?? [], declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} resolves ${declaration.name} ${declaration.value}. ${rule.summary}`);
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

export const phpDetector = new PhpDetector();

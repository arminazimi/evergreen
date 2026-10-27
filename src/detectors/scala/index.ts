import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import { relativePosix } from "../../paths.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { parseVersLenient, versContains } from "../../vers/index.js";
import { parseBuildProperties } from "./parse-build-properties.js";
import { parseBuildSbt } from "./parse-build-sbt.js";
import { parseScalaVersion } from "./parse-scala-version.js";

/**
 * Finds Scala and sbt release lines that are end of life, as declared in `.scala-version`,
 * `build.sbt`, and `project/build.properties`.
 *
 * It reads the Scala pin in `.scala-version`, a literal `scalaVersion := "…"` (including
 * `ThisBuild / scalaVersion` and the older `scalaVersion in ThisBuild` form) in `build.sbt`, and
 * `sbt.version` in `project/build.properties`. An exact pin matches the first rule whose range
 * contains that version; a constraint with an operator matches only a rule that covers every
 * version. Scala and sbt are never run and nothing is fetched.
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
  ".bloop",
  ".metals",
  ".scala-build",
  "fixtures",
  "__fixtures__",
  "testdata",
]);
const SCALA_PURL = "pkg:generic/scala";
const SBT_PURL = "pkg:generic/sbt";
/** An exact Scala or sbt pin: major.minor.patch, with no operator. */
const EXACT_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;

async function scalaFiles(root: string): Promise<string[]> {
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
      } else if (entry.isFile()) {
        if (entry.name === ".scala-version" || entry.name === "build.sbt") {
          files.push(join(directory, entry.name));
        } else if (entry.name === "build.properties" && basename(directory) === "project") {
          files.push(join(directory, entry.name));
        }
      }
    }
  }
  await walk(root, 0);
  return files;
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

/** An exact pin matches by range; any other constraint matches only a rule that covers every version. */
function ruleForDeclared(rules: readonly RegistryV2Rule[], value: string): RegistryV2Rule | undefined {
  return EXACT_VERSION.test(value) ? firstMatchingRule(rules, value) : rules.find(coversEveryVersion);
}

export class ScalaDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "scala";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = { fileNames: [".scala-version", "build.sbt", "build.properties"] };

  /** `loadRules` lets tests supply rules; by default they come from the packaged `registry/scala.json`. */
  constructor(private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () => validateRegistryV2(await loadDataFile("registry/scala.json")).rules) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await scalaFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const rules = await this.loadRules();
    const scalaRules = rules.filter((rule) => rule.purl === SCALA_PURL);
    const sbtRules = rules.filter((rule) => rule.purl === SBT_PURL);

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

      if (name === ".scala-version") {
        for (const declaration of parseScalaVersion(contents)) {
          const rule = firstMatchingRule(scalaRules, declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} pins Scala ${declaration.value}. ${rule.summary}`);
        }
      } else if (name === "build.sbt") {
        for (const declaration of parseBuildSbt(contents)) {
          const rule = ruleForDeclared(scalaRules, declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} declares Scala ${declaration.value}. ${rule.summary}`);
        }
      } else if (name === "build.properties") {
        for (const declaration of parseBuildProperties(contents)) {
          const rule = firstMatchingRule(sbtRules, declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} pins sbt ${declaration.value}. ${rule.summary}`);
        }
      }
    }

    findings.sort((left, right) => {
      if (left.location.path !== right.location.path) return left.location.path < right.location.path ? -1 : 1;
      return (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id);
    });
    return { findings, unclassified: [] };
  }
}

export const scalaDetector = new ScalaDetector();

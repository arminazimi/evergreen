import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { required } from "../../required.js";

import { loadDataFile } from "@velella/ebb/data-source";
import type { UnclassifiedReference } from "../../domain.js";
import { formatPurl } from "@velella/ebb/purl";
import { relativePosix } from "../../paths.js";
import { validateRegistryV2 } from "@velella/ebb/registry";
import type { RegistryV2Rule } from "@velella/ebb/registry";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { analyzeSourceUsage } from "../../source-usage.js";
import { versContains } from "@velella/ebb/vers/index";
import { jdkRuleVersion } from "./jdk-version.js";
import type { DependencyDeclaration, DynamicJdkDeclaration, JdkDeclaration } from "./jdk-version.js";
import { parseCatalog } from "./parse-catalog.js";
import { parseGradle } from "./parse-gradle.js";
import { parseJavaVersion, parseSdkmanrc, parseToolVersions } from "./parse-pins.js";
import { MAXIMUM_INPUT_BYTES, parsePom } from "./parse-pom.js";

/**
 * Finds JDK feature releases that are out of support, and Maven dependencies that have moved.
 *
 * It reads the JDK a project pins or targets (`pom.xml`, `build.gradle(.kts)`, `.java-version`,
 * `.sdkmanrc`, `.tool-versions`) and its direct Maven dependencies, and nothing else (decision 0009).
 * A toolchain or pinned JDK names the JDK itself and keeps the rule's severity; a compile level
 * (`maven.compiler.release`, `sourceCompatibility`) only names the language level code is compiled for,
 * so it is reported at medium severity. Nothing is built, resolved, or run.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 2000;
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  ".gradle",
  ".venv",
  "venv",
  "fixtures",
  "__fixtures__",
  "testdata",
]);
const JDK_PURL = "pkg:generic/java";

type Parser = (
  contents: string,
) => Array<JdkDeclaration | DynamicJdkDeclaration | DependencyDeclaration | { kind: string; line: number }>;

type LocatedDeclaration = ReturnType<Parser>[number];

const PARSERS = new Map<string, Parser>([
  ["pom.xml", parsePom],
  ["build.gradle", parseGradle],
  ["build.gradle.kts", parseGradle],
  ["libs.versions.toml", parseCatalog],
  [".java-version", parseJavaVersion],
  [".sdkmanrc", parseSdkmanrc],
  [".tool-versions", parseToolVersions],
]);

async function candidateFiles(root: string): Promise<string[]> {
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
      } else if (entry.isFile() && PARSERS.has(entry.name)) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0);
  return files;
}

function rulesByPurl(rules: readonly RegistryV2Rule[]): Map<string, RegistryV2Rule[]> {
  const map = new Map<string, RegistryV2Rule[]>();
  for (const rule of rules) map.set(rule.purl, [...(map.get(rule.purl) ?? []), rule]);
  return map;
}

function matches(rule: RegistryV2Rule, version: string): boolean {
  try {
    return versContains(rule.vers, version);
  } catch {
    return false;
  }
}

const ROLE_TEXT = {
  toolchain: "the JDK that builds the project",
  pin: "the pinned JDK",
  "compile-level": "the language level the code is compiled for",
} as const;

/** A file the detector may read, or `undefined` when it is unreadable or over the input ceiling. */
async function readJavaFile(file: string): Promise<string | undefined> {
  try {
    if ((await stat(file)).size > MAXIMUM_INPUT_BYTES) return undefined;
    return await readFile(file, "utf8");
  } catch {
    return undefined;
  }
}

interface Located {
  path: string;
  declaration: LocatedDeclaration;
}

/** Every declaration the parsers return for the candidate files, in directory and file order. */
async function collectDeclarations(root: string): Promise<Located[]> {
  const located: Located[] = [];
  for (const file of await candidateFiles(root)) {
    const contents = await readJavaFile(file);
    if (contents === undefined) continue;
    const path = relativePosix(root, file);
    const parser = required(PARSERS.get(basename(file)), "parser");
    for (const declaration of parser(contents)) located.push({ path, declaration });
  }
  return located;
}

/** What a judgment needs to report one declaration: its subject, candidate rules, version, and severity. */
interface Judgment {
  subject: string;
  candidates: RegistryV2Rule[] | undefined;
  version: string;
  severityOf: (rule: RegistryV2Rule) => RegistryV2Rule["severity"];
}

type Verdict = Judgment | { dynamic: DynamicJdkDeclaration };

/** The subject, candidate rules, and severity a declaration is judged by, or nothing when it is not judged. */
function judgeDeclaration(
  rules: ReadonlyMap<string, RegistryV2Rule[]>,
  declaration: LocatedDeclaration,
): Verdict | undefined {
  if (declaration.kind === "dynamic") return { dynamic: declaration as DynamicJdkDeclaration };
  if (declaration.kind === "jdk") {
    const jdk = declaration as JdkDeclaration;
    return {
      candidates: rules.get(JDK_PURL),
      version: jdkRuleVersion(jdk.major),
      subject: `JDK ${jdk.value}, ${ROLE_TEXT[jdk.role]},`,
      severityOf: jdk.role === "compile-level" ? () => "medium" : (rule) => rule.severity,
    };
  }
  if (declaration.kind === "dependency") {
    const dependency = declaration as DependencyDeclaration;
    return {
      candidates: rules.get(formatPurl({ type: "maven", namespace: dependency.group, name: dependency.artifact })),
      version: dependency.version,
      subject: `${dependency.group}:${dependency.artifact}:${dependency.version}`,
      severityOf: (rule) => rule.severity,
    };
  }
  return undefined;
}

/** Where the repository's Java and Kotlin source imports an affected dependency, so a packet can list the files. */
async function attachUsage(
  root: string,
  findings: readonly DetectorFinding[],
  withUsage: ReadonlyArray<{ id: string; rule: RegistryV2Rule }>,
): Promise<void> {
  const analyses = new Map(
    (
      await analyzeSourceUsage(
        root,
        withUsage.map((item) => ({ id: item.id, matchers: item.rule.usage ?? [] })),
      )
    ).map((analysis) => [analysis.contractId, analysis]),
  );
  for (const finding of findings) {
    const analysis = analyses.get(finding.id);
    if (analysis) Object.assign(finding, { usages: analysis.usages, impact: analysis.impact });
  }
}

export class JavaDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "java";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: [
      "pom.xml",
      "build.gradle",
      "build.gradle.kts",
      "libs.versions.toml",
      ".java-version",
      ".sdkmanrc",
      ".tool-versions",
    ],
    sourceExtensions: [".java", ".kt"],
  };

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const located = await collectDeclarations(context.root);
    if (located.length === 0) return { findings: [], unclassified: [] };

    const registry = validateRegistryV2(await loadDataFile("registry/java.json"));
    const rules = rulesByPurl(registry.rules);
    const findings: DetectorFinding[] = [];
    const unclassified: Omit<UnclassifiedReference, "detector">[] = [];
    const withUsage: Array<{ id: string; rule: RegistryV2Rule }> = [];

    for (const { path, declaration } of located) {
      const judgment = judgeDeclaration(rules, declaration);
      if (!judgment) continue;
      if ("dynamic" in judgment) {
        unclassified.push({
          component: "java",
          reference: judgment.dynamic.value,
          reason: `the JDK version of ${ROLE_TEXT[judgment.dynamic.role]} is a property, expression, or floating value, which Evergreen does not expand`,
          location: { path, line: declaration.line },
        });
        continue;
      }

      const rule = judgment.candidates?.find((item) => matches(item, judgment.version));
      if (!rule) continue;
      const id = `${rule.id}:${path}:${declaration.line}`;
      if ((rule.usage ?? []).length > 0) withUsage.push({ id, rule });
      findings.push({
        id,
        ruleId: rule.id,
        title: rule.title,
        summary: `${path} declares ${judgment.subject}. ${rule.summary}`,
        severity: judgment.severityOf(rule),
        location: { path, line: declaration.line },
        ...(rule.replacement ? { replacement: rule.replacement } : {}),
        ...(rule.deadline ? { deadline: rule.deadline } : {}),
        ...(rule.migration ? { migration: rule.migration } : {}),
        sources: rule.sources,
      });
    }

    await attachUsage(context.root, findings, withUsage);
    return { findings, unclassified };
  }
}

export const javaDetector = new JavaDetector();

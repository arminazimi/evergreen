import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import type { UnclassifiedReference } from "../../domain.js";
import { formatPurl } from "../../purl.js";
import { relativePosix } from "../../paths.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { analyzeSourceUsage } from "../../source-usage.js";
import { versContains } from "../../vers/index.js";
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
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "target", ".gradle", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);
const JDK_PURL = "pkg:generic/java";

type Parser = (contents: string) => Array<JdkDeclaration | DynamicJdkDeclaration | DependencyDeclaration | { kind: string; line: number }>;

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

export class JavaDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "java";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: ["pom.xml", "build.gradle", "build.gradle.kts", "libs.versions.toml", ".java-version", ".sdkmanrc", ".tool-versions"],
    sourceExtensions: [".java", ".kt"],
  };

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const located: Array<{ path: string; declaration: ReturnType<Parser>[number] }> = [];
    for (const file of await candidateFiles(context.root)) {
      let contents: string;
      try {
        if ((await stat(file)).size > MAXIMUM_INPUT_BYTES) continue;
        contents = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const path = relativePosix(context.root, file);
      const name = basename(file);
      for (const declaration of PARSERS.get(name)!(contents)) located.push({ path, declaration });
    }
    if (located.length === 0) return { findings: [], unclassified: [] };

    const registry = validateRegistryV2(await loadDataFile("registry/java.json"));
    const rules = rulesByPurl(registry.rules);
    const findings: DetectorFinding[] = [];
    const unclassified: Omit<UnclassifiedReference, "detector">[] = [];
    const withUsage: Array<{ id: string; rule: RegistryV2Rule }> = [];

    for (const { path, declaration } of located) {
      const location = { path, line: declaration.line };
      if (declaration.kind === "dynamic") {
        const dynamic = declaration as DynamicJdkDeclaration;
        unclassified.push({
          component: "java",
          reference: dynamic.value,
          reason: `the JDK version of ${ROLE_TEXT[dynamic.role]} is a property, expression, or floating value, which Evergreen does not expand`,
          location,
        });
        continue;
      }

      let subject: string;
      let candidates: RegistryV2Rule[] | undefined;
      let version: string;
      let severityOf = (rule: RegistryV2Rule): RegistryV2Rule["severity"] => rule.severity;
      if (declaration.kind === "jdk") {
        const jdk = declaration as JdkDeclaration;
        candidates = rules.get(JDK_PURL);
        version = jdkRuleVersion(jdk.major);
        subject = `JDK ${jdk.value}, ${ROLE_TEXT[jdk.role]},`;
        if (jdk.role === "compile-level") severityOf = () => "medium";
      } else if (declaration.kind === "dependency") {
        const dependency = declaration as DependencyDeclaration;
        candidates = rules.get(formatPurl({ type: "maven", namespace: dependency.group, name: dependency.artifact }));
        version = dependency.version;
        subject = `${dependency.group}:${dependency.artifact}:${dependency.version}`;
      } else {
        continue;
      }

      const rule = candidates?.find((item) => matches(item, version));
      if (!rule) continue;
      if ((rule.usage ?? []).length > 0) withUsage.push({ id: `${rule.id}:${path}:${declaration.line}`, rule });
      findings.push({
        id: `${rule.id}:${path}:${declaration.line}`,
        ruleId: rule.id,
        title: rule.title,
        summary: `${path} declares ${subject}. ${rule.summary}`,
        severity: severityOf(rule),
        location,
        ...(rule.replacement ? { replacement: rule.replacement } : {}),
        ...(rule.deadline ? { deadline: rule.deadline } : {}),
        ...(rule.migration ? { migration: rule.migration } : {}),
        sources: rule.sources,
      });
    }

    // Where the repository's Java and Kotlin source imports an affected dependency, so a packet can list the files.
    const analyses = new Map(
      (await analyzeSourceUsage(context.root, withUsage.map((item) => ({ id: item.id, matchers: item.rule.usage ?? [] })))).map((analysis) => [analysis.contractId, analysis]),
    );
    for (const finding of findings) {
      const analysis = analyses.get(finding.id);
      if (analysis) Object.assign(finding, { usages: analysis.usages, impact: analysis.impact });
    }
    return { findings, unclassified };
  }
}

export const javaDetector = new JavaDetector();

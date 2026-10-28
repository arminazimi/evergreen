import { readFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";

import { renderDiff } from "../agent-instructions.js";
import { parseJdkVersion } from "../detectors/java/jdk-version.js";
import type { DependencyDeclaration, DynamicJdkDeclaration, JdkDeclaration, KotlinPluginDeclaration } from "../detectors/java/jdk-version.js";
import { parseGradle } from "../detectors/java/parse-gradle.js";
import { parsePom } from "../detectors/java/parse-pom.js";
import type { FilePatch, Fixer } from "./index.js";

const JAVA_REPLACEMENT = /^Java (\d+)(?: \(LTS\))? or later$/;
const SUPPORTED_FILES = new Set(["pom.xml", "build.gradle", "build.gradle.kts"]);
type Declaration = JdkDeclaration | DynamicJdkDeclaration | DependencyDeclaration | KotlinPluginDeclaration;

/** `<maven.compiler.release>16</maven.compiler.release>` or a compiler plugin's `<release>16</release>`, optionally commented. */
const POM_RELEASE = /^(\s*<(maven\.compiler\.release|release)>)(\s*)(\d+(?:\.\d+)?)(\s*)(<\/\2>[^\n\r]*\r?)$/;
/** `sourceCompatibility = JavaVersion.VERSION_16`, `"16"`, `'16'`, or `16`. */
const COMPATIBILITY =
  /^(.*\bsourceCompatibility\s*(?:=|\.set\()?\s*)(JavaVersion\s*\.\s*VERSION_([0-9_]+)|(["'])(\d+(?:\.\d+)?)\4|(\d+(?:\.\d+)?))(\)?)([^\n\r]*)$/;
/** `jvmToolchain(16)`, quoted or not. */
const TOOLCHAIN = /^(.*\bjvmToolchain\(\s*)((["'])(\d+(?:\.\d+)?)\3|(\d+(?:\.\d+)?))(\s*\).*)$/;
/** `languageVersion = JavaLanguageVersion.of(16)` and the `.set(...)` Kotlin form. */
const LANGUAGE_VERSION = /^(.*\blanguageVersion\s*(?:=|\.set\()\s*JavaLanguageVersion\s*\.\s*of\(\s*)(\d+(?:\.\d+)?)(\s*\).*)$/;

/** The raised line, or undefined when the line is not one of the literal forms above. */
function rewriteGradle(line: string, target: string): string | undefined {
  const language = LANGUAGE_VERSION.exec(line);
  if (language) return `${language[1]}${target}${language[3]}`;
  const toolchain = TOOLCHAIN.exec(line);
  if (toolchain) {
    const quoted = toolchain[4] !== undefined;
    const raised = quoted ? `${toolchain[3]}${target}${toolchain[3]}` : target;
    return `${toolchain[1]}${raised}${toolchain[6]}`;
  }
  const compatibility = COMPATIBILITY.exec(line);
  if (!compatibility) return undefined;
  if (compatibility[3] !== undefined) {
    const constant = parseJdkVersion(compatibility[3]!.replace(/_/g, "."));
    if (!constant || constant.major >= Number(target)) return undefined;
    return `${compatibility[1]}JavaVersion.VERSION_${target}${compatibility[7]}${compatibility[8]}`;
  }
  const literal = compatibility[5] ?? compatibility[6];
  const current = parseJdkVersion(literal!);
  if (!current || current.major >= Number(target)) return undefined;
  const raised = compatibility[5] !== undefined ? `${compatibility[4]}${target}${compatibility[4]}` : target;
  return `${compatibility[1]}${raised}${compatibility[7]}${compatibility[8]}`;
}

function rewriteLine(name: string, line: string, target: string): string | undefined {
  if (name !== "pom.xml") return rewriteGradle(line, target);
  const match = POM_RELEASE.exec(line);
  if (!match) return undefined;
  const current = parseJdkVersion(match[4]!);
  if (!current || current.major >= Number(target)) return undefined;
  return `${match[1]}${match[3]}${target}${match[5]}${match[6]}`;
}

/**
 * Raises the Java level a `java.jdk.` finding names to the replacement's feature release: the `maven.compiler.release`
 * property and a `maven-compiler-plugin` `<release>` in a `pom.xml`, `sourceCompatibility` and the toolchain language
 * version in a Gradle script. A computed value is never expanded: only lines the detector parsed as literal JDK
 * declarations are rewritten, the edited text is parsed again, and nothing is emitted unless the result says every
 * other declaration survived untouched. `maven.compiler.source`/`target`, `targetCompatibility`, and the version pin
 * files are left for their own findings.
 */
export const javaFixer: Fixer = {
  id: "java",
  async plan(result) {
    const targets = new Map<string, Map<number, string>>();
    for (const finding of result.findings) {
      if (!finding.ruleId.startsWith("java.jdk.") || finding.location.line === undefined) continue;
      const name = basename(finding.location.path);
      if (!SUPPORTED_FILES.has(name)) continue;
      const target = JAVA_REPLACEMENT.exec(finding.replacement ?? "")?.[1];
      if (!target) continue;
      const lines = targets.get(finding.location.path) ?? new Map();
      const previous = lines.get(finding.location.line);
      if (previous === undefined || Number(target) > Number(previous)) lines.set(finding.location.line, target);
      targets.set(finding.location.path, lines);
    }

    const patches: FilePatch[] = [];
    for (const [path, lines] of [...targets].sort(([left], [right]) => left.localeCompare(right))) {
      const name = basename(path);
      const parse = name === "pom.xml" ? parsePom : parseGradle;
      const absolute = resolve(result.root, path);
      const inside = relative(resolve(result.root), absolute);
      if (inside.startsWith("..") || isAbsolute(inside)) continue;
      const before = await readFile(absolute, "utf8").catch(() => undefined);
      if (!before?.endsWith("\n")) continue;
      const declarations: Declaration[] = parse(before);
      // Only a line the detector itself parsed as a literal JDK declaration is safe to rewrite; a computed value,
      // an unsupported form, or a line the file has drifted away from is left as it is.
      const declared = new Set(declarations.filter((declaration) => declaration.kind === "jdk").map((declaration) => declaration.line));
      const rewritten = new Set<number>();
      const text = before.split("\n").map((line, index) => {
        const target = lines.get(index + 1);
        if (target === undefined || !declared.has(index + 1)) return line;
        const raised = rewriteLine(name, line, target);
        if (raised === undefined) return line;
        rewritten.add(index + 1);
        return raised;
      }).join("\n");
      if (text === before) continue;
      const expected = declarations.map((declaration) => {
        if (declaration.kind !== "jdk" || !rewritten.has(declaration.line)) return declaration;
        const target = lines.get(declaration.line)!;
        return { kind: "jdk" as const, role: declaration.role, value: target, major: Number(target), line: declaration.line };
      });
      if (JSON.stringify(expected) !== JSON.stringify(parse(text))) continue;
      patches.push({ path, diff: renderDiff(path, before.slice(0, -1), text.slice(0, -1)) });
    }
    return patches;
  },
};

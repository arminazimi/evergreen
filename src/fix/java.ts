import { readFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";

import { renderDiff } from "../agent-instructions.js";
import { parseJdkVersion } from "../detectors/java/jdk-version.js";
import type {
  DependencyDeclaration,
  DynamicJdkDeclaration,
  JdkDeclaration,
  KotlinPluginDeclaration,
} from "../detectors/java/jdk-version.js";
import { parseGradle } from "../detectors/java/parse-gradle.js";
import { parsePom } from "../detectors/java/parse-pom.js";
import type { Finding } from "../domain.js";
import type { FilePatch, Fixer, Refuse } from "./types.js";

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
const LANGUAGE_VERSION =
  /^(.*\blanguageVersion\s*(?:=|\.set\()\s*JavaLanguageVersion\s*\.\s*of\(\s*)(\d+(?:\.\d+)?)(\s*\).*)$/;

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
  const constantVersion = compatibility[3];
  if (constantVersion !== undefined) {
    const constant = parseJdkVersion(constantVersion.replace(/_/g, "."));
    if (!constant || constant.major >= Number(target)) return undefined;
    return `${compatibility[1]}JavaVersion.VERSION_${target}${compatibility[7]}${compatibility[8]}`;
  }
  const literal = compatibility[5] ?? compatibility[6];
  if (literal === undefined) return undefined;
  const current = parseJdkVersion(literal);
  if (!current || current.major >= Number(target)) return undefined;
  const raised = compatibility[5] !== undefined ? `${compatibility[4]}${target}${compatibility[4]}` : target;
  return `${compatibility[1]}${raised}${compatibility[7]}${compatibility[8]}`;
}

function rewriteLine(name: string, line: string, target: string): string | undefined {
  if (name !== "pom.xml") return rewriteGradle(line, target);
  const match = POM_RELEASE.exec(line);
  if (!match) return undefined;
  const release = match[4];
  if (release === undefined) return undefined;
  const current = parseJdkVersion(release);
  if (!current || current.major >= Number(target)) return undefined;
  return `${match[1]}${match[3]}${target}${match[5]}${match[6]}`;
}

interface Targets {
  lines: Map<number, string>;
  findings: Finding[];
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
  async plan(result, refuse) {
    const targets = javaTargets(result.findings, refuse);
    const patches: FilePatch[] = [];
    for (const [path, target] of [...targets].sort(([left], [right]) => left.localeCompare(right))) {
      const patch = await planFile(result.root, path, target, refuse);
      if (patch !== undefined) patches.push(patch);
    }
    return patches;
  },
};

/** The Java build files that carry a `java.jdk.` finding, each with the target level per line; unsupported findings are refused. */
function javaTargets(findings: readonly Finding[], refuse: Refuse | undefined): Map<string, Targets> {
  const targets = new Map<string, Targets>();
  for (const finding of findings) {
    if (!finding.ruleId.startsWith("java.jdk.") || !SUPPORTED_FILES.has(basename(finding.location.path))) continue;
    if (finding.location.line === undefined) {
      refuse?.(finding, "The finding names no line to rewrite.");
      continue;
    }
    const target = JAVA_REPLACEMENT.exec(finding.replacement ?? "")?.[1];
    if (!target) {
      refuse?.(finding, "The rule's replacement does not name a Java release.");
      continue;
    }
    const entry: Targets = targets.get(finding.location.path) ?? {
      lines: new Map(),
      findings: [],
    };
    const previous = entry.lines.get(finding.location.line);
    if (previous === undefined || Number(target) > Number(previous)) entry.lines.set(finding.location.line, target);
    entry.findings.push(finding);
    targets.set(finding.location.path, entry);
  }
  return targets;
}

/** The raised build file patch, or undefined when nothing can change; declined findings are reported. */
async function planFile(
  root: string,
  path: string,
  { lines, findings }: Targets,
  refuse: Refuse | undefined,
): Promise<FilePatch | undefined> {
  const decline = (reason: string): undefined => {
    for (const finding of findings) refuse?.(finding, reason);
    return undefined;
  };
  const name = basename(path);
  const parse = name === "pom.xml" ? parsePom : parseGradle;
  const source = await readBuildFile(root, path);
  if ("failure" in source) return decline(source.failure);
  const before = source.text;

  const declarations: Declaration[] = parse(before);
  const original = before.split("\n");
  // Only a line the detector itself parsed as a literal JDK declaration is safe to rewrite; a computed value,
  // an unsupported form, or a line the file has drifted away from is left as it is.
  const declared = declaredJdkLines(declarations);
  const { text, rewritten } = rewriteDeclaredLines(original, name, lines, declared);
  if (text !== before && !keepsDeclarations(declarations, parse, text, rewritten, lines))
    return decline("The edit would change other declarations in the file.");
  const patch: FilePatch | undefined =
    text === before
      ? undefined
      : {
          path,
          diff: renderDiff(path, before.slice(0, -1), text.slice(0, -1)),
        };
  refuseUnraised(findings, { name, original, rewritten, declared, lines }, refuse);
  return patch;
}

/** The build file's text, or why it cannot be read inside the repository or does not end with a newline. */
async function readBuildFile(root: string, path: string): Promise<{ text: string } | { failure: string }> {
  const absolute = resolve(root, path);
  const inside = relative(resolve(root), absolute);
  if (inside.startsWith("..") || isAbsolute(inside)) return { failure: "The path resolves outside the repository." };
  const text = await readFile(absolute, "utf8").catch(() => undefined);
  if (text === undefined) return { failure: "The build file could not be read." };
  if (!text.endsWith("\n")) return { failure: "The build file does not end with a newline." };
  return { text };
}

/** Whether re-parsing the edited text yields exactly the expected declarations: the rewritten ones, and every other one unchanged. */
function keepsDeclarations(
  declarations: readonly Declaration[],
  parse: (text: string) => Declaration[],
  text: string,
  rewritten: ReadonlySet<number>,
  lines: ReadonlyMap<number, string>,
): boolean {
  return JSON.stringify(expectedDeclarations(declarations, rewritten, lines)) === JSON.stringify(parse(text));
}

/** Refuses each finding its declaration was left alone for, with the reason it could not be raised. */
function refuseUnraised(
  findings: readonly Finding[],
  context: {
    name: string;
    original: readonly string[];
    rewritten: ReadonlySet<number>;
    declared: ReadonlySet<number>;
    lines: ReadonlyMap<number, string>;
  },
  refuse: Refuse | undefined,
): void {
  for (const finding of findings) {
    const { name, original, rewritten, declared, lines } = context;
    const reason = refusalFor(finding, name, original, rewritten, declared, lines);
    if (reason !== undefined) refuse?.(finding, reason);
  }
}

/** The line numbers of the declarations the detector parsed as literal JDK levels. */
function declaredJdkLines(declarations: readonly Declaration[]): Set<number> {
  return new Set(
    declarations.filter((declaration) => declaration.kind === "jdk").map((declaration) => declaration.line),
  );
}

/** The file's lines with each declared line raised to its target, and the line numbers that were actually rewritten. */
function rewriteDeclaredLines(
  original: readonly string[],
  name: string,
  lines: ReadonlyMap<number, string>,
  declared: ReadonlySet<number>,
): { text: string; rewritten: Set<number> } {
  const rewritten = new Set<number>();
  const text = original
    .map((line, index) => {
      const target = lines.get(index + 1);
      if (target === undefined || !declared.has(index + 1)) return line;
      const raised = rewriteLine(name, line, target);
      if (raised === undefined) return line;
      rewritten.add(index + 1);
      return raised;
    })
    .join("\n");
  return { text, rewritten };
}

/** The declarations the edit should produce: each rewritten JDK declaration takes its target value, every other one is unchanged. */
function expectedDeclarations(
  declarations: readonly Declaration[],
  rewritten: ReadonlySet<number>,
  lines: ReadonlyMap<number, string>,
): Declaration[] {
  return declarations.map((declaration) => {
    if (declaration.kind !== "jdk" || !rewritten.has(declaration.line)) return declaration;
    const target = lines.get(declaration.line);
    if (target === undefined) return declaration;
    return {
      kind: "jdk" as const,
      role: declaration.role,
      value: target,
      major: Number(target),
      line: declaration.line,
    };
  });
}

/** The refusal for a finding the edit left alone, or undefined when there is nothing to report. */
function refusalFor(
  finding: Finding,
  name: string,
  original: readonly string[],
  rewritten: ReadonlySet<number>,
  declared: ReadonlySet<number>,
  lines: ReadonlyMap<number, string>,
): string | undefined {
  const line = finding.location.line;
  if (line === undefined) return undefined;
  if (rewritten.has(line)) return undefined;
  if (!declared.has(line)) return "The declaration is computed or not a literal Java level.";
  const target = lines.get(line);
  if (target === undefined) return undefined;
  return refusalReason(name, original[line - 1] ?? "", target);
}

/** Why the declaration was left as it is, or undefined when it already names the target or a later release. */
function refusalReason(name: string, line: string, target: string): string | undefined {
  const literal = name === "pom.xml" ? pomLine(line) : gradleLine(line);
  if (literal === undefined) return "The declaration is computed or not a literal Java level.";
  const current = parseJdkVersion(literal);
  if (current && current.major >= Number(target)) return undefined;
  return "The declaration is computed or not a literal Java level.";
}

/** The release `line` names in a `pom.xml`, or undefined when it is not a literal release element. */
function pomLine(line: string): string | undefined {
  return POM_RELEASE.exec(line)?.[4];
}

/** The Java version `line` names in a Gradle script, or undefined when it is not one of the literal forms. */
function gradleLine(line: string): string | undefined {
  const language = LANGUAGE_VERSION.exec(line);
  if (language) return language[2];
  const toolchain = TOOLCHAIN.exec(line);
  if (toolchain) return toolchain[4] ?? toolchain[5];
  const compatibility = COMPATIBILITY.exec(line);
  if (!compatibility) return undefined;
  return compatibility[3]?.replace(/_/g, ".") ?? compatibility[5] ?? compatibility[6];
}

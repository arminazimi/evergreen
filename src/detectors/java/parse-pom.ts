import { jdkDeclaration } from "./jdk-version.js";
import type { DependencyDeclaration, DynamicJdkDeclaration, JdkDeclaration } from "./jdk-version.js";
import { child, children, parseXml } from "./xml.js";
import type { XmlElement } from "./xml.js";

/**
 * Pure, bounded parser for the JDK settings and direct dependencies of a `pom.xml`.
 *
 * Read: the `maven.compiler.release`, `maven.compiler.source`, `maven.compiler.target`, and
 * `java.version` properties; `release`, `source`, and `target` in a `maven-compiler-plugin`
 * configuration; and `<dependency>` entries with a literal `groupId`, `artifactId`, and `version`.
 * A `${property}` value is returned as dynamic and never expanded. Other plugins' settings, other
 * properties, `dependencyManagement`, profiles, comments, and malformed XML produce nothing. The
 * parser never evaluates contents, resolves a parent, or executes tools.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;

export type PomDeclaration = JdkDeclaration | DynamicJdkDeclaration | DependencyDeclaration;

const PROPERTIES = new Set(["maven.compiler.release", "maven.compiler.source", "maven.compiler.target", "java.version"]);
const COMPILER_SETTINGS = new Set(["release", "source", "target"]);
const COORDINATE = /^[A-Za-z0-9_.-]+$/;

function pluginDeclarations(project: XmlElement): PomDeclaration[] {
  const found: PomDeclaration[] = [];
  const build = child(project, "build");
  if (!build) return found;
  const management = child(build, "pluginManagement");
  const lists = [child(build, "plugins"), management ? child(management, "plugins") : undefined];
  for (const plugins of lists) {
    if (!plugins) continue;
    for (const plugin of children(plugins, "plugin")) {
      if (child(plugin, "artifactId")?.text !== "maven-compiler-plugin") continue;
      const configuration = child(plugin, "configuration");
      if (!configuration) continue;
      for (const setting of configuration.children) {
        if (!COMPILER_SETTINGS.has(setting.name)) continue;
        const declaration = jdkDeclaration("compile-level", setting.text, setting.line);
        if (declaration) found.push(declaration);
      }
    }
  }
  return found;
}

function dependencyDeclarations(project: XmlElement): PomDeclaration[] {
  const found: PomDeclaration[] = [];
  const dependencies = child(project, "dependencies");
  if (!dependencies) return found;
  for (const dependency of children(dependencies, "dependency")) {
    const group = child(dependency, "groupId");
    const artifact = child(dependency, "artifactId");
    const version = child(dependency, "version");
    if (!group || !artifact || !version) continue;
    if (![group.text, artifact.text].every((part) => COORDINATE.test(part))) continue;
    if (version.text === "" || version.text.includes("${") || /\s/.test(version.text)) continue;
    found.push({ kind: "dependency", group: group.text, artifact: artifact.text, version: version.text, line: version.line });
  }
  return found;
}

/** Parse a pom.xml without file, network, or process I/O. */
export function parsePom(contents: string): PomDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const project = parseXml(contents);
    if (!project || project.name !== "project") return [];

    const found: PomDeclaration[] = [];
    const properties = child(project, "properties");
    for (const property of properties?.children ?? []) {
      if (!PROPERTIES.has(property.name)) continue;
      const declaration = jdkDeclaration("compile-level", property.text, property.line);
      if (declaration) found.push(declaration);
    }
    found.push(...pluginDeclarations(project), ...dependencyDeclarations(project));
    return found.sort((left, right) => left.line - right.line);
  } catch {
    return [];
  }
}

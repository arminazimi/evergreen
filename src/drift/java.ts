import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Node } from "yaml";

import { parseCircleci } from "../detectors/ci-images/parse-circleci.js";
import { parseGitlabCi } from "../detectors/ci-images/parse-gitlab-ci.js";
import { parseDockerfile } from "../detectors/container/parse-dockerfile.js";
import type { DockerfileRuntimeDeclaration } from "../detectors/container/parse-dockerfile.js";
import { parseImageReference } from "../detectors/container/parse-image.js";
import { parseJdkVersion } from "../detectors/java/jdk-version.js";
import type { DynamicJdkDeclaration, JdkDeclaration } from "../detectors/java/jdk-version.js";
import { parseGradle } from "../detectors/java/parse-gradle.js";
import { parseJavaVersion, parseSdkmanrc, parseToolVersions } from "../detectors/java/parse-pins.js";
import { parsePom } from "../detectors/java/parse-pom.js";
import { relativePosix } from "../paths.js";
import type { DriftCollector, RuntimePin } from "./types.js";

/**
 * Collects every JDK version a repository states, at the major release granularity.
 *
 * Sources: Maven properties and `maven-compiler-plugin` configuration, Gradle toolchains and compatibility
 * settings (the compile levels are floors, the rest pins), `.java-version`, `.sdkmanrc`, `.tool-versions`, Dockerfile and CI images of the JDK families, and
 * `actions/setup-java`. Values that need a property expansion, a Gradle expression, a matrix expansion, or a
 * floating tag are reported as unresolved and never guessed. Nothing is fetched, installed, or executed.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 2000;
const MAXIMUM_INPUT_BYTES = 1024 * 1024;
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
const DOCKERFILE_NAME = /^(?:Dockerfile|Containerfile)(?:\.[A-Za-z0-9_.-]+)?$|\.(?:Dockerfile|Containerfile)$/;

const DIRECT_IMAGE_FAMILIES = new Set(["eclipse-temurin", "openjdk", "amazoncorretto"]);
const BUILD_IMAGE_FAMILIES = new Set(["maven", "gradle"]);
const IMAGE_FAMILY = /(?:^|[\/:])(?:eclipse-temurin|temurin|openjdk|amazoncorretto|corretto|maven|gradle)(?:[:\/@]|$)/i;
const BUILD_JDK_TAG =
  /(jdk[-_]?|(?:eclipse-temurin|temurin|amazoncorretto|corretto|openjdk|zulu|liberica|sapmachine)[-_])(\d+)(?=$|[-_])/i;
const SETUP_JAVA = /^actions\/setup-java@/i;
const MATRIX_REFERENCE = /^\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}$/;

const COMPILER_SOURCE = "pom.xml compiler setting";
const FLOATING_REASON = "the value is floating, which Evergreen does not resolve offline";
const EXPRESSION_REASON = "the value is an expression, which Evergreen does not expand";

interface CandidateFile {
  absolute: string;
  path: string;
  name: string;
}

async function candidateFiles(root: string): Promise<CandidateFile[]> {
  const files: CandidateFile[] = [];
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
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(absolute, depth + 1);
      } else if (entry.isFile()) {
        const path = relativePosix(root, absolute);
        if (isCandidateName(path)) files.push({ absolute, path, name: entry.name });
      }
    }
  }
  await walk(root, 0);
  return files;
}

function isCandidateName(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (
    name === "pom.xml" ||
    name === "build.gradle" ||
    name === "build.gradle.kts" ||
    name === ".java-version" ||
    name === ".sdkmanrc" ||
    name === ".tool-versions" ||
    name === ".gitlab-ci.yml" ||
    DOCKERFILE_NAME.test(name)
  )
    return true;
  if (path.endsWith(".circleci/config.yml")) return true;
  return (
    path.startsWith(".github/workflows/") &&
    /\.ya?ml$/i.test(name) &&
    !path.slice(".github/workflows/".length).includes("/")
  );
}

function pin(
  path: string,
  line: number,
  source: string,
  raw: string,
  release: string | undefined,
  unresolved?: string,
  kind: "pin" | "floor" = "pin",
): RuntimePin {
  return {
    path,
    line,
    source,
    raw,
    kind,
    ...(release === undefined ? {} : { release }),
    ...(unresolved === undefined ? {} : { unresolved }),
  };
}

function unresolvedReason(value: string): string {
  return /^(?:latest|system|lts|default)$/i.test(value.trim()) ? FLOATING_REASON : EXPRESSION_REASON;
}

function declarationReason(source: string, value: string): string {
  if (source === COMPILER_SOURCE && value.includes("${"))
    return "the value is a property reference, which Evergreen does not expand";
  if (source.endsWith("toolchain") || source.endsWith("compatibility"))
    return "the value is a Gradle expression, which Evergreen does not evaluate";
  return unresolvedReason(value);
}

function addJdkDeclaration(
  pins: RuntimePin[],
  path: string,
  source: string,
  declaration: JdkDeclaration | DynamicJdkDeclaration,
): void {
  // The source, target, and release levels say the oldest JDK the compiled code runs on: a floor, not the JDK that builds it.
  const kind = declaration.role === "compile-level" ? "floor" : "pin";
  if (declaration.kind === "jdk") {
    pins.push(pin(path, declaration.line, source, declaration.value, String(declaration.major), undefined, kind));
  } else {
    const reason = declarationReason(source, declaration.value);
    pins.push(pin(path, declaration.line, source, declaration.value, undefined, reason, kind));
  }
}

function addJavaImage(pins: RuntimePin[], path: string, source: string, value: string, line: number): void {
  const imagePin = javaImagePin(path, source, value, line);
  if (imagePin) {
    pins.push(imagePin);
    return;
  }
  if (IMAGE_FAMILY.test(value)) {
    pins.push(
      pin(path, line, source, value, undefined, "the image reference is dynamic, which Evergreen does not expand"),
    );
  }
}

/** The JDK feature release a leading version text names; `1.8` resolves to `8`. */
function leadingJdkMajor(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)*)(?:\.(?:x|\*))?/i.exec(value.trim());
  const version = match?.[1];
  if (version !== undefined) {
    const parsed = parseJdkVersion(version);
    if (parsed) return parsed.major;
  }
  return parseJdkVersion(value.trim())?.major;
}

function imageFamily(value: string): { kind: "direct" | "build"; tag?: string } | undefined {
  const reference = parseImageReference(value);
  if (!reference) return undefined;
  const repository = reference.repository.toLowerCase();
  const name = repository.slice(repository.lastIndexOf("/") + 1);
  const kind = DIRECT_IMAGE_FAMILIES.has(name) ? "direct" : BUILD_IMAGE_FAMILIES.has(name) ? "build" : undefined;
  if (!kind) return undefined;
  return { kind, ...(reference.tag === undefined ? {} : { tag: reference.tag }) };
}

function javaImagePin(path: string, source: string, value: string, line: number): RuntimePin | undefined {
  const family = imageFamily(value);
  if (!family) return undefined;
  if (family.kind === "direct") {
    if (family.tag === undefined)
      return pin(path, line, source, value, undefined, "the image has no tag, so it selects the floating default");
    const major = leadingJdkMajor(family.tag);
    if (major === undefined)
      return pin(path, line, source, family.tag, undefined, "the image tag does not name a JDK release");
    return pin(path, line, source, family.tag, String(major));
  }
  if (family.tag === undefined) return undefined;
  const match = BUILD_JDK_TAG.exec(family.tag);
  if (!match) return undefined;
  const [, , version = ""] = match;
  const major = parseJdkVersion(version);
  if (!major) return undefined;
  return pin(path, line, source, family.tag, String(major.major));
}

interface SetupJavaVersion {
  value: string;
  line: number;
  /** False when the value comes from `strategy.matrix`, so a patch would have to edit the matrix. */
  direct: boolean;
  /** Set for the entries of one `strategy.matrix` list, which are alternatives. */
  group?: string;
}

function setupJavaVersions(contents: string): SetupJavaVersion[] {
  const lineCounter = new LineCounter();
  const document = parseDocument(contents, { lineCounter, prettyErrors: false, keepSourceTokens: true });
  if (document.errors.length > 0 || !isMap(document.contents)) return [];
  const lineOf = (node: Node): number => lineCounter.linePos(node.range?.[0] ?? 0).line;
  const jobs = document.contents.get("jobs", true);
  if (!isMap(jobs)) return [];

  const versions: SetupJavaVersion[] = [];
  const add = (node: Node, direct: boolean, group?: string): void => {
    if (!isScalar(node)) return;
    const value =
      typeof node.value === "string"
        ? node.value.trim()
        : typeof node.value === "number"
          ? (node.source ?? String(node.value)).trim()
          : undefined;
    if (value === undefined || value === "") return;
    versions.push({ value, line: lineOf(node), direct, ...(group === undefined ? {} : { group }) });
  };

  for (const job of jobs.items) {
    if (!isMap(job.value)) continue;
    const strategy = job.value.get("strategy", true);
    const matrix = isMap(strategy) ? strategy.get("matrix", true) : undefined;
    const steps = job.value.get("steps", true);
    if (!isSeq(steps)) continue;
    for (const step of steps.items) {
      if (!isMap(step)) continue;
      const uses = step.get("uses");
      if (typeof uses !== "string" || !SETUP_JAVA.test(uses)) continue;
      const inputs = step.get("with", true);
      if (!isMap(inputs)) continue;
      const version = inputs.get("java-version", true) as Node | null;
      if (!version || !isScalar(version)) continue;
      const key = typeof version.value === "string" ? MATRIX_REFERENCE.exec(version.value.trim())?.[1] : undefined;
      const list = key !== undefined && isMap(matrix) ? matrix.get(key, true) : undefined;
      if (list !== undefined && list !== null) {
        const group = `matrix:${key}@${lineOf(list as Node)}`;
        if (isSeq(list)) for (const item of list.items) add(item as Node, false, group);
        else add(list as Node, false, group);
      } else {
        add(version, true);
      }
    }
  }
  return versions;
}

function isLiteralJdkValue(value: string): boolean {
  return parseJdkVersion(value) !== undefined;
}

function buildJdkReplacement(text: string, release: string): string | undefined {
  const match = BUILD_JDK_TAG.exec(text);
  if (!match) return undefined;
  const [, prefix = "", version = ""] = match;
  const start = match.index + prefix.length;
  return text.slice(0, start) + release + text.slice(start + version.length);
}

/** Rewrites the tag of the Java image token in `lineText` when it is a plain major the collector can align. */
function alignImageLine(lineText: string, raw: string, release: string): string | undefined {
  for (const match of lineText.matchAll(/[^\s"'#]+/g)) {
    const token = match[0];
    const matchIndex = match.index;
    if (token === undefined || matchIndex === undefined) continue;
    const leading = /^[\[({,]*/.exec(token)?.[0].length ?? 0;
    const trailing = /[\])},;]*$/.exec(token)?.[0].length ?? 0;
    const core = token.slice(leading, token.length - trailing);
    const reference = parseImageReference(core);
    if (!reference || reference.tag !== raw || reference.digest !== undefined) continue;
    const family = imageFamily(core);
    if (!family) continue;
    let replacement: string | undefined;
    if (family.kind === "direct") {
      if (!/^\d+$/.test(raw)) return undefined;
      replacement = `${core.slice(0, core.length - raw.length)}${release}`;
    } else {
      replacement = buildJdkReplacement(core, release);
    }
    if (replacement === undefined) return undefined;
    const start = matchIndex + leading;
    return lineText.slice(0, start) + replacement + lineText.slice(start + core.length);
  }
  return undefined;
}

/** The JDK pins of a candidate file, keyed by the kind its name and path select. */
type CandidateKindReader = (path: string, name: string, contents: string) => RuntimePin[];

function pomPins(path: string, contents: string): RuntimePin[] {
  const pins: RuntimePin[] = [];
  for (const declaration of parsePom(contents)) {
    if (declaration.kind === "jdk" || declaration.kind === "dynamic") {
      addJdkDeclaration(pins, path, COMPILER_SOURCE, declaration);
    }
  }
  return pins;
}

function gradlePins(path: string, name: string, contents: string): RuntimePin[] {
  const pins: RuntimePin[] = [];
  for (const declaration of parseGradle(contents)) {
    if (declaration.kind === "jdk" || declaration.kind === "dynamic") {
      const source = declaration.role === "toolchain" ? `${name} toolchain` : `${name} compatibility`;
      addJdkDeclaration(pins, path, source, declaration);
    }
  }
  return pins;
}

function declaredPins(
  path: string,
  source: string,
  declarations: readonly (JdkDeclaration | DynamicJdkDeclaration)[],
): RuntimePin[] {
  const pins: RuntimePin[] = [];
  for (const declaration of declarations) addJdkDeclaration(pins, path, source, declaration);
  return pins;
}

/** The pins a Dockerfile adds: image references, `RUN` installs of a JDK, and dynamic references it cannot expand. */
function dockerfilePins(path: string, name: string, contents: string): RuntimePin[] {
  const pins: RuntimePin[] = [];
  for (const declaration of parseDockerfile(contents)) {
    if (declaration.kind === "image") addJavaImage(pins, path, `${name} FROM`, declaration.value, declaration.line);
    else if (declaration.kind === "runtime" && declaration.runtime === "java") addRunPin(pins, path, name, declaration);
    else if (declaration.kind === "dynamic" && IMAGE_FAMILY.test(declaration.value)) {
      pins.push(
        pin(
          path,
          declaration.line,
          `${name} FROM`,
          declaration.value,
          undefined,
          "the image reference is dynamic, which Evergreen does not expand",
        ),
      );
    }
  }
  return pins;
}

function addRunPin(pins: RuntimePin[], path: string, name: string, declaration: DockerfileRuntimeDeclaration): void {
  const major = leadingJdkMajor(declaration.value);
  pins.push(
    major === undefined
      ? pin(
          path,
          declaration.line,
          `${name} RUN`,
          declaration.value,
          undefined,
          "the value does not name a JDK release",
        )
      : pin(path, declaration.line, `${name} RUN`, declaration.value, String(major)),
  );
}

function imagePins(path: string, items: readonly { line: number; value: string }[]): RuntimePin[] {
  const pins: RuntimePin[] = [];
  for (const item of items) addJavaImage(pins, path, `${path} image`, item.value, item.line);
  return pins;
}

function setupJavaPin(path: string, version: SetupJavaVersion): RuntimePin {
  const source = `${path} actions/setup-java java-version${version.direct ? "" : " matrix"}`;
  const major = leadingJdkMajor(version.value);
  if (version.value.includes("${{"))
    return pin(path, version.line, source, version.value, undefined, EXPRESSION_REASON);
  if (major === undefined) {
    return pin(path, version.line, source, version.value, undefined, "the value does not name a JDK release");
  }
  return pin(path, version.line, source, version.value, String(major));
}

function setupJavaPins(path: string, contents: string): RuntimePin[] {
  return setupJavaVersions(contents).map((version) => {
    const made = setupJavaPin(path, version);
    return version.group === undefined ? made : { ...made, group: `${path}:${version.group}` };
  });
}

type CandidateFileKind =
  | "pom"
  | "gradle"
  | "java-version"
  | "sdkmanrc"
  | "tool-versions"
  | "dockerfile"
  | "gitlab"
  | "circleci"
  | "workflow";

/** The reader a candidate file gets; the first rule that matches wins, so the order is the dispatch. */
function candidateKind(name: string, path: string): CandidateFileKind | undefined {
  if (name === "pom.xml") return "pom";
  if (name === "build.gradle" || name === "build.gradle.kts") return "gradle";
  if (name === ".java-version") return "java-version";
  if (name === ".sdkmanrc") return "sdkmanrc";
  if (name === ".tool-versions") return "tool-versions";
  if (DOCKERFILE_NAME.test(name)) return "dockerfile";
  if (name === ".gitlab-ci.yml") return "gitlab";
  if (name === "config.yml" && path.endsWith(".circleci/config.yml")) return "circleci";
  if (/\.ya?ml$/i.test(name)) return "workflow";
  return undefined;
}

const PINS_BY_KIND: Record<CandidateFileKind, CandidateKindReader> = {
  pom: (path, _name, contents) => pomPins(path, contents),
  gradle: (path, name, contents) => gradlePins(path, name, contents),
  "java-version": (path, _name, contents) => declaredPins(path, ".java-version", parseJavaVersion(contents)),
  sdkmanrc: (path, _name, contents) => declaredPins(path, ".sdkmanrc java", parseSdkmanrc(contents)),
  "tool-versions": (path, _name, contents) => declaredPins(path, ".tool-versions java", parseToolVersions(contents)),
  dockerfile: dockerfilePins,
  gitlab: (path, _name, contents) => imagePins(path, parseGitlabCi(contents).unclassified),
  circleci: (path, _name, contents) => {
    const parsed = parseCircleci(contents);
    return imagePins(path, [...parsed.declarations, ...parsed.unclassified]);
  },
  workflow: (path, _name, contents) => setupJavaPins(path, contents),
};

/** The file contents, or undefined when the file is too large to read or cannot be read at all. */
async function candidateText(file: CandidateFile): Promise<string | undefined> {
  try {
    const info = await stat(file.absolute);
    if (info.size > MAXIMUM_INPUT_BYTES) return undefined;
    return await readFile(file.absolute, "utf8");
  } catch {
    return undefined;
  }
}

async function collect(root: string): Promise<RuntimePin[]> {
  const pins: RuntimePin[] = [];
  for (const file of await candidateFiles(root)) {
    const kind = candidateKind(file.name, file.path);
    if (kind === undefined) continue;
    const contents = await candidateText(file);
    if (contents === undefined) continue;
    pins.push(...PINS_BY_KIND[kind](file.path, file.name, contents));
  }
  return pins;
}

function alignJavaVersionFile(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (lineText.trim() !== pin.raw || !isLiteralJdkValue(pin.raw)) return undefined;
  const index = lineText.indexOf(pin.raw);
  return `${lineText.slice(0, index)}${release}${lineText.slice(index + pin.raw.length)}`;
}

function alignSdkmanrcLine(pin: RuntimePin, lineText: string, release: string): string | undefined {
  const match = /^(\s*java\s*=\s*)(\S+)(\s*)$/.exec(lineText);
  if (!match || match[2] !== pin.raw || !isLiteralJdkValue(pin.raw)) return undefined;
  return `${match[1]}${release}${match[3]}`;
}

function alignToolVersionsLine(pin: RuntimePin, lineText: string, release: string): string | undefined {
  const match = /^(\s*java\s+)(\S+)(.*)$/.exec(lineText);
  if (!match || match[2] !== pin.raw || !isLiteralJdkValue(pin.raw)) return undefined;
  return `${match[1]}${release}${match[3]}`;
}

function alignSetupJavaLine(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (!isLiteralJdkValue(pin.raw)) return undefined;
  const match = /^(\s*(?:-\s*)?java-version\s*:\s*)(["']?)([^"'#\s]+)(\2)(.*)$/.exec(lineText);
  if (!match || match[3] !== pin.raw) return undefined;
  return `${match[1]}${match[2]}${release}${match[2]}${match[5]}`;
}

/** Which rewriter a pin source gets; the first rule that matches wins, so the order is the dispatch. */
interface JavaAlignRule {
  appliesTo: (source: string) => boolean;
  rewrite: (pin: RuntimePin, lineText: string, release: string) => string | undefined;
}

const JAVA_ALIGN_RULES: readonly JavaAlignRule[] = [
  { appliesTo: (source) => source === ".java-version", rewrite: alignJavaVersionFile },
  { appliesTo: (source) => source === ".sdkmanrc java", rewrite: alignSdkmanrcLine },
  { appliesTo: (source) => source === ".tool-versions java", rewrite: alignToolVersionsLine },
  { appliesTo: (source) => source.endsWith("actions/setup-java java-version"), rewrite: alignSetupJavaLine },
  {
    appliesTo: (source) => source.endsWith(" FROM") || source.endsWith(" image"),
    rewrite: (pin, lineText, release) => alignImageLine(lineText, pin.raw, release),
  },
];

/**
 * Rewrites a candidate line, or undefined. A source with no rule here — a Gradle toolchain or compatibility
 * setting, a `RUN` install, or a matrix value — is never rewritten, because the patch would not be the value
 * the build reads.
 */
function align(candidate: RuntimePin, lineText: string, release: string): string | undefined {
  if (!/^\d+$/.test(release)) return undefined;
  const rule = JAVA_ALIGN_RULES.find((entry) => entry.appliesTo(candidate.source));
  return rule === undefined ? undefined : rule.rewrite(candidate, lineText, release);
}

export const javaCollector: DriftCollector = { runtime: "java", collect, align };

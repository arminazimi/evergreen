import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { parse as parseToml } from "smol-toml";
import { LineCounter, isMap, isNode, isScalar, isSeq, parseDocument } from "yaml";
import type { YAMLMap, YAMLSeq } from "yaml";

import { parseCircleci } from "../detectors/ci-images/parse-circleci.js";
import { parseGitlabCi } from "../detectors/ci-images/parse-gitlab-ci.js";
import { parseDockerfile } from "../detectors/container/parse-dockerfile.js";
import { parseImageReference } from "../detectors/container/parse-image.js";
import type { ImageReference } from "../detectors/container/parse-image.js";
import { relativePosix } from "../paths.js";
import type { DriftCollector, RuntimePin } from "./types.js";

/**
 * Collects every Python version a repository states, with the exact file and line, and resolves each to the
 * `major.minor` release line it selects. It reads repository files only: no network, no commands, and repository
 * code is never evaluated. `setup.py` contributes literal `python_requires` strings only.
 */

const ROOT_FILES = [
  ".python-version",
  ".tool-versions",
  "runtime.txt",
  "Pipfile",
  "pyproject.toml",
  "setup.cfg",
  "setup.py",
] as const;
const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 2000;
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "bin",
  "obj",
  "target",
  ".venv",
  "venv",
  "fixtures",
  "__fixtures__",
  "testdata",
]);
const DOCKERFILE_NAME = /^(?:Dockerfile|Containerfile)(?:\.[A-Za-z0-9_.-]+)?$|\.(?:Dockerfile|Containerfile)$/;
const AZURE_PIPELINES_NAME = /^azure-pipelines\.ya?ml$/;
const ENVIRONMENT_NAME = /^environment\.ya?ml$/;
const WORKFLOW_PATH = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const PYTHON_CI_IMAGES = new Set(["library/python", "cimg/python", "circleci/python"]);
const PYTHON_IMAGE_PREFIX = /^(?:[a-z0-9.-]+\/)?(?:library\/|cimg\/|circleci\/)?python(?::|@|$)/i;

const VERSION = /^v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?(?:[-+._a-zA-Z].*)?$/;
const LOWER_BOUND = /^\s*(>=|<=|===|==|!=|~=|\^|~|>|<)?\s*v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?.*$/;

interface Resolved {
  release?: string;
  unresolved?: string;
}

function resolvePython(value: string): Resolved {
  const trimmed = value.trim().replace(/^python[-_ ]?/i, "");
  if (trimmed === "") return { unresolved: "the value is empty." };
  const match = VERSION.exec(trimmed);
  if (!match) return { unresolved: `"${trimmed}" is not a version Evergreen reads.` };
  const minor = match[2];
  if (minor === undefined || /^[x*]$/i.test(minor)) {
    return { unresolved: `"${trimmed}" names no minor version, so the release line is unknown.` };
  }
  return { release: `${Number(match[1])}.${Number(minor)}` };
}

/** The minimum a constraint allows, read from its first lower bound. Ranges without one stay unresolved. */
function resolveFloor(constraint: string): Resolved {
  const trimmed = constraint.trim();
  if (trimmed === "" || trimmed === "*") return { unresolved: "the constraint names no minimum version." };
  for (const clause of trimmed.split(",")) {
    const match = LOWER_BOUND.exec(clause);
    if (!match) continue;
    const operator = match[1];
    if (operator === "<" || operator === "<=" || operator === "!=") continue;
    const minor = match[3];
    if (minor === undefined || /^[x*]$/i.test(minor)) {
      return { unresolved: `"${trimmed}" names no minimum minor version, so the release line is unknown.` };
    }
    return { release: `${Number(match[2])}.${Number(minor)}` };
  }
  return { unresolved: `"${trimmed}" names no minimum version.` };
}

function resolveTag(tag: string | undefined): Resolved {
  if (tag === undefined) return { unresolved: "the image names no tag." };
  const version = /^(\d+(?:\.\d+){0,2})/.exec(tag)?.[1];
  if (version === undefined) return { unresolved: `the tag "${tag}" names no version.` };
  return resolvePython(version);
}

function isPythonImage(reference: ImageReference, names: ReadonlySet<string> = PYTHON_CI_IMAGES): boolean {
  return reference.registry === "docker.io" && names.has(reference.repository);
}

function namesPythonImage(value: string): boolean {
  return PYTHON_IMAGE_PREFIX.test(value);
}

function addPin(
  pins: RuntimePin[],
  path: string,
  line: number,
  source: string,
  raw: string,
  kind: "pin" | "floor",
  resolved: Resolved,
  group?: string,
): void {
  pins.push({ path, line, source, raw, kind, ...(group === undefined ? {} : { group }), ...resolved });
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function walk(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string, depth: number): Promise<void> {
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
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await visit(join(directory, entry.name), depth + 1);
      } else if (entry.isFile()) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await visit(root, 0);
  return files;
}

/** The 1-based line of a literal `key = ...` in a TOML section, or undefined when it is not written that way. */
function tomlLine(lines: readonly string[], section: string, key: string): number | undefined {
  let current = "";
  const pattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`);
  for (const [index, line] of lines.entries()) {
    const header = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/.exec(line);
    const headerName = header?.[1];
    if (headerName !== undefined) {
      current = headerName.trim();
      continue;
    }
    if (current === section && pattern.test(line)) return index + 1;
  }
  return undefined;
}

/** The 1-based line and full value of an INI option, including indented continuation lines. */
function iniValue(lines: readonly string[], section: string, key: string): { line: number; value: string } | undefined {
  let current = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    const headerName = header?.[1];
    if (headerName !== undefined) {
      current = headerName.trim().toLowerCase();
      continue;
    }
    if (current !== section) continue;
    const match = /^(\s*)([A-Za-z0-9_-]+)\s*[=:]\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, whitespace = "", optionName = "", optionValue = ""] = match;
    if (optionName.toLowerCase() !== key) continue;
    const indent = whitespace.length;
    const start = index + 1;
    const parts = [optionValue.trim()];
    for (let next = index + 1; next < lines.length; next += 1) {
      const continuation = lines[next];
      if (continuation === undefined) break;
      if (continuation.trim() === "") continue;
      const continuationIndent = continuation.length - continuation.trimStart().length;
      if (continuationIndent <= indent || /^\s*\[/.test(continuation)) break;
      parts.push(continuation.trim());
      index = next;
    }
    return { line: start, value: parts.filter((part) => part !== "").join(",") };
  }
  return undefined;
}

function collectToolVersionsEntries(pins: RuntimePin[], path: string, lines: readonly string[]): void {
  for (const [index, line] of lines.entries()) {
    const match = /^\s*python\s+(.+?)\s*$/.exec(line);
    const versions = match?.[1];
    if (versions === undefined) continue;
    for (const value of versions.replace(/#.*$/, "").trim().split(/\s+/).filter(Boolean)) {
      addPin(
        pins,
        path,
        index + 1,
        ".tool-versions",
        value,
        "pin",
        resolvePython(value),
        `.tool-versions:${path}:${index + 1}`,
      );
    }
  }
}

/** Several lines are versions installed side by side, which are alternatives, not drift. */
function collectPythonVersionFile(pins: RuntimePin[], path: string, lines: readonly string[]): void {
  for (const [index, line] of lines.entries()) {
    const value = line.replace(/#.*$/, "").trim();
    if (value === "") continue;
    addPin(pins, path, index + 1, ".python-version", value, "pin", resolvePython(value), `.python-version:${path}`);
  }
}

function collectRuntimeTxt(pins: RuntimePin[], path: string, lines: readonly string[]): void {
  for (const [index, line] of lines.entries()) {
    const match = /^\s*python[-_]\s*(\S+)\s*$/.exec(line.replace(/#.*$/, ""));
    const version = match?.[1];
    if (version === undefined) continue;
    addPin(pins, path, index + 1, "runtime.txt", line.trim(), "pin", resolvePython(version));
  }
}

function collectPipfile(pins: RuntimePin[], path: string, contents: string, lines: readonly string[]): void {
  const document = parseToml(contents) as Record<string, unknown>;
  const requires = document.requires;
  if (typeof requires !== "object" || requires === null) return;
  for (const key of ["python_version", "python_full_version"]) {
    const value = Reflect.get(requires, key);
    if (typeof value !== "string") continue;
    const line = tomlLine(lines, "requires", key);
    if (line !== undefined) addPin(pins, path, line, "Pipfile requires", value, "pin", resolvePython(value));
  }
}

function collectPyprojectRequires(
  pins: RuntimePin[],
  path: string,
  document: Record<string, unknown>,
  lines: readonly string[],
): void {
  const project = document.project;
  const requires =
    typeof project === "object" && project !== null ? Reflect.get(project, "requires-python") : undefined;
  if (typeof requires !== "string") return;
  const line = tomlLine(lines, "project", "requires-python");
  if (line !== undefined)
    addPin(pins, path, line, "pyproject.toml requires-python", requires, "floor", resolveFloor(requires));
}

function collectPoetryPython(
  pins: RuntimePin[],
  path: string,
  document: Record<string, unknown>,
  lines: readonly string[],
): void {
  const tool = document.tool;
  const poetry = typeof tool === "object" && tool !== null ? Reflect.get(tool, "poetry") : undefined;
  const dependencies = typeof poetry === "object" && poetry !== null ? Reflect.get(poetry, "dependencies") : undefined;
  const python =
    typeof dependencies === "object" && dependencies !== null ? Reflect.get(dependencies, "python") : undefined;
  if (typeof python !== "string") return;
  const line = tomlLine(lines, "tool.poetry.dependencies", "python");
  if (line !== undefined)
    addPin(pins, path, line, "pyproject.toml poetry python", python, "floor", resolveFloor(python));
}

function collectPyprojectToml(pins: RuntimePin[], path: string, contents: string, lines: readonly string[]): void {
  const document = parseToml(contents) as Record<string, unknown>;
  collectPyprojectRequires(pins, path, document, lines);
  collectPoetryPython(pins, path, document, lines);
}

function collectSetupCfg(pins: RuntimePin[], path: string, lines: readonly string[]): void {
  const value = iniValue(lines, "options", "python_requires");
  if (value !== undefined)
    addPin(pins, path, value.line, "setup.cfg python_requires", value.value, "floor", resolveFloor(value.value));
}

function collectSetupPy(pins: RuntimePin[], path: string, lines: readonly string[]): void {
  for (const [index, line] of lines.entries()) {
    if (line.trimStart().startsWith("#")) continue;
    const match = /\bpython_requires\s*=\s*(["'])([^"'\\\r\n]*)\1/.exec(line);
    const requirement = match?.[2];
    if (requirement === undefined) continue;
    addPin(pins, path, index + 1, "setup.py python_requires", requirement, "floor", resolveFloor(requirement));
  }
}

type RootFileReader = (pins: RuntimePin[], path: string, contents: string, lines: readonly string[]) => void;

const ROOT_FILE_READERS: Readonly<Record<string, RootFileReader>> = {
  ".python-version": (pins, path, _contents, lines) => collectPythonVersionFile(pins, path, lines),
  ".tool-versions": (pins, path, _contents, lines) => collectToolVersionsEntries(pins, path, lines),
  "runtime.txt": (pins, path, _contents, lines) => collectRuntimeTxt(pins, path, lines),
  Pipfile: collectPipfile,
  "pyproject.toml": collectPyprojectToml,
  "setup.cfg": (pins, path, _contents, lines) => collectSetupCfg(pins, path, lines),
  "setup.py": (pins, path, _contents, lines) => collectSetupPy(pins, path, lines),
};

export function collectRootFiles(pins: RuntimePin[], path: string, contents: string): void {
  const reader = ROOT_FILE_READERS[basename(path)];
  if (reader === undefined) return;
  reader(pins, path, contents, contents.split(/\r?\n/));
}

function collectDockerfile(pins: RuntimePin[], path: string, contents: string): void {
  for (const declaration of parseDockerfile(contents)) {
    if (declaration.kind === "dynamic") {
      if (namesPythonImage(declaration.value)) {
        addPin(pins, path, declaration.line, "Dockerfile FROM", declaration.value, "pin", {
          unresolved: "the image reference is dynamic.",
        });
      }
      continue;
    }
    if (declaration.kind !== "image") continue;
    const reference = parseImageReference(declaration.value);
    if (!reference || !isPythonImage(reference)) continue;
    if (reference.tag === undefined) {
      addPin(pins, path, declaration.line, "Dockerfile FROM", declaration.value, "pin", {
        unresolved: "the image names no tag.",
      });
      continue;
    }
    addPin(pins, path, declaration.line, "Dockerfile FROM", declaration.value, "pin", resolveTag(reference.tag));
  }
}

interface SetupVersion {
  value: string;
  line: number;
  matrix: boolean;
  group?: string;
}

function nodeLine(counter: LineCounter, node: unknown): number {
  return counter.linePos(isNode(node) ? (node.range?.[0] ?? 0) : 0).line;
}

function nodeText(node: unknown): string | undefined {
  if (!isScalar(node)) return undefined;
  if (typeof node.value === "string") return node.value.trim();
  if (typeof node.value === "number") return (node.source ?? String(node.value)).trim();
  return undefined;
}

/** The entries of a matrix list share one group: they are alternatives, not drift. */
function matrixVersions(counter: LineCounter, list: YAMLSeq, key: string): SetupVersion[] {
  const versions: SetupVersion[] = [];
  const group = list.items.length === 0 ? undefined : `matrix:${key}@${nodeLine(counter, list.items[0])}`;
  for (const item of list.items) {
    const value = nodeText(item);
    if (value === undefined || value === "") continue;
    versions.push({ value, line: nodeLine(counter, item), matrix: true, ...(group === undefined ? {} : { group }) });
  }
  return versions;
}

function stepVersions(counter: LineCounter, step: YAMLMap, matrix: unknown): SetupVersion[] {
  const uses = step.get("uses");
  if (typeof uses !== "string" || !/^actions\/setup-python@/i.test(uses)) return [];
  const inputs = step.get("with", true);
  if (!isMap(inputs)) return [];
  const version = inputs.get("python-version", true);
  if (!isScalar(version)) return [];
  const key =
    typeof version.value === "string"
      ? /^\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}$/.exec(version.value.trim())?.[1]
      : undefined;
  const list = key !== undefined && isMap(matrix) ? matrix.get(key, true) : undefined;
  if (key !== undefined && isSeq(list)) return matrixVersions(counter, list, key);
  const value = nodeText(version);
  return value === undefined || value === "" ? [] : [{ value, line: nodeLine(counter, version), matrix: false }];
}

export function setupPythonVersions(contents: string): SetupVersion[] {
  const lineCounter = new LineCounter();
  const document = parseDocument(contents, { lineCounter, prettyErrors: false, keepSourceTokens: true });
  if (document.errors.length > 0 || !isMap(document.contents)) return [];
  const jobs = document.contents.get("jobs", true);
  if (!isMap(jobs)) return [];
  const versions: SetupVersion[] = [];
  for (const job of jobs.items) {
    if (!isMap(job.value)) continue;
    const strategy = job.value.get("strategy", true);
    const matrix = isMap(strategy) ? strategy.get("matrix", true) : undefined;
    const steps = job.value.get("steps", true);
    if (!isSeq(steps)) continue;
    for (const step of steps.items) if (isMap(step)) versions.push(...stepVersions(lineCounter, step, matrix));
  }
  return versions;
}

function collectWorkflow(pins: RuntimePin[], path: string, contents: string): void {
  for (const version of setupPythonVersions(contents)) {
    const unresolved = version.value.includes("${{")
      ? { unresolved: "the value is an expression." }
      : resolvePython(version.value);
    addPin(
      pins,
      path,
      version.line,
      version.matrix ? "setup-python matrix" : "setup-python python-version",
      version.value,
      "pin",
      unresolved,
      version.group === undefined ? undefined : `${path}:${version.group}`,
    );
  }
}

function collectGitlab(pins: RuntimePin[], path: string, contents: string): void {
  for (const reference of parseGitlabCi(contents).unclassified) {
    if (reference.reason === "dynamic") {
      if (namesPythonImage(reference.value))
        addPin(pins, path, reference.line, "GitLab CI image", reference.value, "pin", {
          unresolved: "the image reference is dynamic.",
        });
      continue;
    }
    const image = parseImageReference(reference.value);
    if (!image || !isPythonImage(image)) continue;
    addPin(pins, path, reference.line, "GitLab CI image", reference.value, "pin", resolveTag(image.tag));
  }
}

function collectCircleci(pins: RuntimePin[], path: string, contents: string): void {
  const parsed = parseCircleci(contents);
  for (const reference of [
    ...parsed.declarations,
    ...parsed.unclassified.filter((item) => item.reason !== "orb-not-resolved"),
  ]) {
    if ("reason" in reference && reference.reason === "dynamic") {
      if (namesPythonImage(reference.value))
        addPin(pins, path, reference.line, "CircleCI image", reference.value, "pin", {
          unresolved: "the image reference is dynamic.",
        });
      continue;
    }
    const image = parseImageReference(reference.value);
    if (!image || !isPythonImage(image)) continue;
    addPin(pins, path, reference.line, "CircleCI image", reference.value, "pin", resolveTag(image.tag));
  }
}

function collectConda(pins: RuntimePin[], path: string, contents: string): void {
  const lineCounter = new LineCounter();
  const document = parseDocument(contents, { lineCounter, prettyErrors: false });
  if (document.errors.length > 0 || !isMap(document.contents)) return;
  const dependencies = document.contents.get("dependencies", true);
  if (!isSeq(dependencies)) return;
  for (const item of dependencies.items) {
    if (!isScalar(item) || typeof item.value !== "string" || !item.range) continue;
    const raw = item.value.trim();
    const match = /^python\s*(>=|<=|>|<|==|=|~=|!=)?\s*(\S+)$/i.exec(raw);
    const version = match?.[2];
    if (version === undefined) continue;
    const line = lineCounter.linePos(item.range[0]).line;
    const operator = match?.[1];
    if (operator === ">=" || operator === ">" || operator === "~=") {
      addPin(pins, path, line, "conda environment.yml", raw, "floor", resolveFloor(`${operator}${version}`));
    } else if (operator === "<" || operator === "<=" || operator === "!=") {
      addPin(pins, path, line, "conda environment.yml", raw, "pin", {
        unresolved: "the constraint names no lower bound.",
      });
    } else {
      addPin(pins, path, line, "conda environment.yml", raw, "pin", resolvePython(version));
    }
  }
}

function collectAzure(pins: RuntimePin[], path: string, contents: string): void {
  const images = azureContainerImages(contents);
  for (const reference of images) {
    if (reference.value.includes("$")) {
      if (namesPythonImage(reference.value))
        addPin(pins, path, reference.line, "Azure Pipelines image", reference.value, "pin", {
          unresolved: "the image reference is dynamic.",
        });
      continue;
    }
    const image = parseImageReference(reference.value);
    if (!image || !isPythonImage(image)) continue;
    addPin(pins, path, reference.line, "Azure Pipelines image", reference.value, "pin", resolveTag(image.tag));
  }
}

/** Literal container images from a pipeline's `container` and `resources.containers` values. */
function azureContainerImages(contents: string): Array<{ value: string; line: number }> {
  const lineCounter = new LineCounter();
  const document = parseDocument(contents, { lineCounter, merge: false });
  if (document.errors.length > 0 || !isMap(document.contents)) return [];
  const references: Array<{ value: string; line: number }> = [];
  const add = (node: unknown): void => {
    if (!isScalar(node) || typeof node.value !== "string" || !node.range) return;
    references.push({ value: node.value, line: lineCounter.linePos(node.range[0]).line });
  };
  const addContainer = (node: unknown): void => {
    if (isMap(node)) add(node.get("image", true));
    else add(node);
  };
  const root = document.contents;
  addContainer(root.get("container", true));
  const collectJobs = (jobs: unknown): void => {
    if (!isSeq(jobs)) return;
    for (const job of jobs.items) if (isMap(job)) addContainer(job.get("container", true));
  };
  collectJobs(root.get("jobs", true));
  const stages = root.get("stages", true);
  if (isSeq(stages)) for (const stage of stages.items) if (isMap(stage)) collectJobs(stage.get("jobs", true));
  const resources = root.get("resources", true);
  const containers = isMap(resources) ? resources.get("containers", true) : undefined;
  if (isSeq(containers)) for (const container of containers.items) addContainer(container);
  return references;
}

function alignPythonVersionLine(_pin: RuntimePin, lineText: string, release: string): string | undefined {
  const match = /^(\s*)(python[-_]?)?(v?\d+(?:\.\d+)*)(\s*)$/i.exec(lineText);
  if (!match) return undefined;
  return `${match[1]}${match[2] ?? ""}${release}${match[4]}`;
}

function alignToolVersionsLine(_pin: RuntimePin, lineText: string, release: string): string | undefined {
  const match = /^(\s*python\s+)(\S+)(\s*(?:#.*)?\s*)$/i.exec(lineText);
  if (!match) return undefined;
  const [, prefix = "", , rest = ""] = match;
  if (rest.replace(/#.*$/, "").trim() !== "") return undefined;
  return `${prefix}${release}${rest}`;
}

function alignRuntimeTxtLine(_pin: RuntimePin, lineText: string, release: string): string | undefined {
  const match = /^(\s*python[-_])(\S+)(\s*)$/i.exec(lineText);
  if (!match) return undefined;
  return `${match[1]}${release}${match[3]}`;
}

function alignPipfileLine(_pin: RuntimePin, lineText: string, release: string): string | undefined {
  const match = /^(\s*(?:python_version|python_full_version)\s*=\s*)(["'])([^"']*)\2(\s*(?:#.*)?)$/.exec(lineText);
  if (!match) return undefined;
  return `${match[1]}${match[2]}${release}${match[2]}${match[4]}`;
}

function alignDockerfileFromLine(_pin: RuntimePin, lineText: string, release: string): string | undefined {
  const match = /^(\s*FROM\s+(?:--\S+\s+)*)(\S+)([\s\S]*)$/i.exec(lineText);
  if (!match) return undefined;
  const [, prefix = "", original = "", rest = ""] = match;
  const image = parseImageReference(original);
  if (!image || !isPythonImage(image) || image.tag === undefined) return undefined;
  const tag = image.tag.replace(/^\d+(?:\.\d+){0,2}/, release);
  if (tag === image.tag) return undefined;
  const colon = original.lastIndexOf(":");
  const withoutTag = colon > original.lastIndexOf("/") ? original.slice(0, colon) : original;
  return `${prefix}${withoutTag}:${tag}${rest}`;
}

function alignSetupPythonLine(_pin: RuntimePin, lineText: string, release: string): string | undefined {
  const match = /^(\s*python-version\s*:\s*)(["']?)([^"'#\s]+)\2(\s*(?:#.*)?)$/.exec(lineText);
  if (!match) return undefined;
  return `${match[1]}${match[2]}${release}${match[2]}${match[4]}`;
}

type LineAligner = (pin: RuntimePin, lineText: string, release: string) => string | undefined;

const ALIGNERS: Readonly<Record<string, LineAligner>> = {
  ".python-version": alignPythonVersionLine,
  ".tool-versions": alignToolVersionsLine,
  "runtime.txt": alignRuntimeTxtLine,
  "Pipfile requires": alignPipfileLine,
  "Dockerfile FROM": alignDockerfileFromLine,
  "setup-python python-version": alignSetupPythonLine,
};

export function collectAlignable(pin: RuntimePin, lineText: string, release: string): string | undefined {
  return ALIGNERS[pin.source]?.(pin, lineText, release);
}

/** A reader the collector applies to the first file kind that matches; the order is the dispatch. */
interface FileCollector {
  matches(path: string, name: string): boolean;
  collect(pins: RuntimePin[], path: string, contents: string): void;
}

const FILE_COLLECTORS: readonly FileCollector[] = [
  { matches: (_path, name) => (ROOT_FILES as readonly string[]).includes(name), collect: collectRootFiles },
  { matches: (_path, name) => DOCKERFILE_NAME.test(name), collect: collectDockerfile },
  { matches: (_path, name) => name === ".gitlab-ci.yml", collect: collectGitlab },
  {
    matches: (path, name) => name === "config.yml" && path.endsWith(".circleci/config.yml"),
    collect: collectCircleci,
  },
  { matches: (_path, name) => AZURE_PIPELINES_NAME.test(name), collect: collectAzure },
  { matches: (_path, name) => ENVIRONMENT_NAME.test(name), collect: collectConda },
  { matches: (path) => WORKFLOW_PATH.test(path), collect: collectWorkflow },
];

function fileCollector(path: string, name: string): FileCollector | undefined {
  return FILE_COLLECTORS.find((candidate) => candidate.matches(path, name));
}

export const pythonCollector: DriftCollector = {
  runtime: "python",
  async collect(root: string): Promise<RuntimePin[]> {
    const pins: RuntimePin[] = [];
    for (const file of await walk(root)) {
      const path = relativePosix(root, file);
      const collector = fileCollector(path, basename(file));
      if (collector === undefined) continue;
      const contents = await readOptional(file);
      if (contents !== undefined) collector.collect(pins, path, contents);
    }
    return pins;
  },
  align(pin: RuntimePin, lineText: string, release: string): string | undefined {
    return collectAlignable(pin, lineText, release);
  },
};

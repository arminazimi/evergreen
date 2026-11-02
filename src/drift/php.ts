import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Node } from "yaml";

import { parseCircleci } from "../detectors/ci-images/parse-circleci.js";
import { parseGitlabCi } from "../detectors/ci-images/parse-gitlab-ci.js";
import { parseDockerfile } from "../detectors/container/parse-dockerfile.js";
import { parseImageReference } from "../detectors/container/parse-image.js";
import type { ImageReference } from "../detectors/container/parse-image.js";
import { parseComposerJson } from "../detectors/php/parse-composer-json.js";
import { parseComposerLock } from "../detectors/php/parse-composer-lock.js";
import { MAXIMUM_INPUT_BYTES, PINNED_PHP_VERSION, parsePhpVersion, parseToolVersions } from "../detectors/php/parse-php-runtime.js";
import { relativePosix } from "../paths.js";
import type { DriftCollector, RuntimePin } from "./types.js";

/**
 * Collects every PHP version a repository states, at `major.minor` granularity, with file and line.
 *
 * It reads `composer.json` `config.platform.php` and `require.php`, `composer.lock` `platform.php`,
 * `.php-version`, `.tool-versions`, Dockerfile and Containerfile `FROM`/`RUN` lines, the `php-version`
 * input of `shivammathur/setup-php` workflows, and GitLab CI and CircleCI PHP images. The detectors'
 * parsers and bounded input limits are reused unchanged. Nothing is evaluated, executed, fetched, or
 * written; values that cannot be resolved offline are reported with the reason.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 2000;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);
const DOCKERFILE_NAME = /^(?:Dockerfile|Containerfile)(?:\.[A-Za-z0-9_.-]+)?$|\.(?:Dockerfile|Containerfile)$/;
const WORKFLOW_NAME = /\.ya?ml$/i;
const SETUP_PHP = /^shivammathur\/setup-php@/i;
const MATRIX_REFERENCE = /^\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}$/;
const PHP_VERSION = /^(?:php-)?(\d+)\.(\d+)(?:\.\d+)?(?:[-+][0-9A-Za-z._-]+)?$/;
const FLOOR_BOUND = /(?:^|[\s,|])(?:\^|~>|~|>=|>|=)?\s*v?(\d+)(?:\.(\d+|[x*]))?/g;
const TAG_VERSION = /^(\d+\.\d+)(?:\.\d+)?((?:[-+].*)?)$/;

const SOURCE_PHP_VERSION = ".php-version";
const SOURCE_TOOL_VERSIONS = ".tool-versions";
const SOURCE_COMPOSER_PLATFORM = "composer.json config.platform.php";
const SOURCE_COMPOSER_REQUIRE = "composer.json require.php";
const SOURCE_COMPOSER_LOCK = "composer.lock platform.php";
const SOURCE_SETUP_PHP = "GitHub Actions shivammathur/setup-php php-version";
const SOURCE_SETUP_PHP_MATRIX = "setup-php matrix";
const SOURCE_GITLAB = "GitLab CI image";
const SOURCE_CIRCLECI = "CircleCI image";

type PhpFileKind = "php-version" | "tool-versions" | "composer" | "composer-lock" | "dockerfile" | "workflow" | "gitlab" | "circleci";

interface PhpFile {
  kind: PhpFileKind;
  path: string;
}

interface Resolved {
  release?: string;
  unresolved?: string;
}

function fileKind(name: string, directory: string): PhpFileKind | undefined {
  if (name === ".php-version") return "php-version";
  if (name === ".tool-versions") return "tool-versions";
  if (name === "composer.json") return "composer";
  if (name === "composer.lock") return "composer-lock";
  if (DOCKERFILE_NAME.test(name)) return "dockerfile";
  if (name === ".gitlab-ci.yml") return "gitlab";
  if (name === "config.yml" && basename(directory) === ".circleci") return "circleci";
  if (WORKFLOW_NAME.test(name) && basename(directory) === "workflows" && basename(dirname(directory)) === ".github") return "workflow";
  return undefined;
}

async function phpFiles(root: string): Promise<PhpFile[]> {
  const files: PhpFile[] = [];
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
        const kind = fileKind(entry.name, directory);
        if (kind) files.push({ kind, path: join(directory, entry.name) });
      }
    }
  }
  await walk(root, 0);
  return files;
}

function releaseOf(value: string): string | undefined {
  const match = PHP_VERSION.exec(value.trim());
  return match ? `${Number(match[1])}.${Number(match[2])}` : undefined;
}

/** The lowest release a constraint admits, read from its first lower bound. */
function floorRelease(value: string): string | undefined {
  for (const match of value.matchAll(FLOOR_BOUND)) {
    const minor = match[2];
    if (minor === undefined || /^[x*]$/i.test(minor)) return `${Number(match[1])}.0`;
    return `${Number(match[1])}.${Number(minor)}`;
  }
  return undefined;
}

function resolvedVersion(value: string): Resolved {
  const release = releaseOf(value);
  return release === undefined ? { unresolved: `"${value.trim()}" is not a PHP major.minor release` } : { release };
}

function makePin(path: string, line: number, source: string, raw: string, kind: "pin" | "floor", resolved: Resolved, group?: string): RuntimePin {
  return {
    path,
    line,
    source,
    raw,
    kind,
    ...(group === undefined ? {} : { group }),
    ...(resolved.release === undefined
      ? { unresolved: resolved.unresolved ?? `"${raw}" is not a PHP major.minor release` }
      : { release: resolved.release }),
  };
}

function collectPhpVersion(contents: string, path: string, pins: RuntimePin[]): void {
  const declarations = parsePhpVersion(contents);
  if (declarations.length > 0) {
    for (const declaration of declarations) {
      pins.push(makePin(path, declaration.line, SOURCE_PHP_VERSION, declaration.value, "pin", resolvedVersion(declaration.value)));
    }
    return;
  }
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return;
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const value = rawLine.trim();
    if (value === "" || value.startsWith("#")) continue;
    pins.push(makePin(path, index + 1, SOURCE_PHP_VERSION, value, "pin", PINNED_PHP_VERSION.test(value) ? resolvedVersion(value) : { unresolved: `"${value}" is not a PHP version Evergreen reads` }));
  }
}

function collectToolVersions(contents: string, path: string, pins: RuntimePin[]): void {
  for (const declaration of parseToolVersions(contents)) {
    pins.push(makePin(path, declaration.line, SOURCE_TOOL_VERSIONS, declaration.value, "pin", resolvedVersion(declaration.value)));
  }
}

function collectComposerJson(contents: string, path: string, pins: RuntimePin[]): void {
  for (const declaration of parseComposerJson(contents)) {
    if (declaration.kind === "require-php") {
      const release = floorRelease(declaration.value);
      pins.push(makePin(path, declaration.line, SOURCE_COMPOSER_REQUIRE, declaration.value, "floor",
        release === undefined ? { unresolved: `"${declaration.value}" states no minimum PHP release` } : { release }));
    } else if (declaration.kind === "platform-php") {
      pins.push(makePin(path, declaration.line, SOURCE_COMPOSER_PLATFORM, declaration.value, "pin", resolvedVersion(declaration.value)));
    }
  }
}

function collectComposerLock(contents: string, path: string, pins: RuntimePin[]): void {
  for (const declaration of parseComposerLock(contents)) {
    if (declaration.kind !== "platform-php") continue;
    const release = floorRelease(declaration.value);
    pins.push(makePin(path, declaration.line, SOURCE_COMPOSER_LOCK, declaration.value, "floor",
      release === undefined ? { unresolved: `"${declaration.value}" states no minimum PHP release` } : { release }));
  }
}

function isPhpImage(image: ImageReference): boolean {
  return image.registry === "docker.io" && (image.repository === "library/php" || image.repository === "cimg/php");
}

function imagePin(path: string, line: number, source: string, value: string): RuntimePin | undefined {
  const image = parseImageReference(value);
  if (!image || !isPhpImage(image)) return undefined;
  if (image.tag === undefined) {
    return { path, line, source, raw: value, kind: "pin", unresolved: "the image reference has no tag" };
  }
  return makePin(path, line, source, image.tag, "pin", resolvedVersion(image.tag));
}

function imagePins(references: ReadonlyArray<{ value: string; line: number }>, source: string, path: string, pins: RuntimePin[]): void {
  for (const reference of references) {
    const found = imagePin(path, reference.line, source, reference.value);
    if (found) pins.push(found);
  }
}

function collectDockerfile(contents: string, path: string, pins: RuntimePin[]): void {
  const name = path.slice(path.lastIndexOf("/") + 1);
  for (const declaration of parseDockerfile(contents)) {
    if (declaration.kind === "image") {
      const found = imagePin(path, declaration.line, `${name} FROM`, declaration.value);
      if (found) pins.push(found);
    } else if (declaration.kind === "runtime" && declaration.runtime === "php") {
      pins.push(makePin(path, declaration.line, `${name} RUN`, declaration.value, "pin", resolvedVersion(declaration.value)));
    }
  }
}

/** The text a scalar was written as: YAML reads `8.3` as the number 8.3, so numbers use their source. */
function textOf(node: Node): string | undefined {
  if (!isScalar(node)) return undefined;
  if (typeof node.value === "string") return node.value.trim();
  if (typeof node.value === "number") return (node.source ?? String(node.value)).trim();
  return undefined;
}

interface SetupPhpVersion {
  value: string;
  line: number;
  expression: boolean;
  matrix: boolean;
}

function setupPhpVersions(contents: string): SetupPhpVersion[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];
  const lineCounter = new LineCounter();
  const document = parseDocument(contents, { lineCounter, prettyErrors: false, keepSourceTokens: true });
  if (document.errors.length > 0 || !isMap(document.contents)) return [];
  const lineOf = (node: Node): number => lineCounter.linePos(node.range?.[0] ?? 0).line;

  const jobs = document.contents.get("jobs", true);
  if (!isMap(jobs)) return [];
  const versions: SetupPhpVersion[] = [];
  const add = (node: Node | null | undefined, matrix: boolean): void => {
    if (!node) return;
    const value = textOf(node);
    if (value !== undefined && value !== "") versions.push({ value, line: lineOf(node), expression: value.includes("${{"), matrix });
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
      if (typeof uses !== "string" || !SETUP_PHP.test(uses)) continue;
      const inputs = step.get("with", true);
      if (!isMap(inputs)) continue;
      const version = inputs.get("php-version", true) as Node | null;
      if (!version || !isScalar(version)) continue;
      const key = typeof version.value === "string" ? MATRIX_REFERENCE.exec(version.value.trim())?.[1] : undefined;
      const list = key !== undefined && isMap(matrix) ? matrix.get(key, true) : undefined;
      if (isSeq(list)) for (const item of list.items) add(item as Node, true);
      else add(version, false);
    }
  }
  return versions;
}

function collectWorkflow(contents: string, path: string, pins: RuntimePin[]): void {
  for (const version of setupPhpVersions(contents)) {
    const source = version.matrix ? SOURCE_SETUP_PHP_MATRIX : SOURCE_SETUP_PHP;
    const resolved = version.expression
      ? { unresolved: `"${version.value}" is an expression, which Evergreen does not evaluate` }
      : resolvedVersion(version.value);
    pins.push(makePin(path, version.line, source, version.value, "pin", resolved, version.matrix ? SOURCE_SETUP_PHP_MATRIX : undefined));
  }
}

function alignTag(tag: string, release: string): string | undefined {
  const match = TAG_VERSION.exec(tag);
  return match ? `${release}${match[2]}` : undefined;
}

function alignImage(pin: RuntimePin, lineText: string, release: string): string | undefined {
  const match = /^(\s*FROM\s+(?:--\S+\s+)*)(\S+)(.*)$/i.exec(lineText);
  if (!match) return undefined;
  const value = match[2]!;
  const reference = parseImageReference(value);
  if (!reference || reference.tag !== pin.raw || reference.digest !== undefined || !isPhpImage(reference)) return undefined;
  const tag = alignTag(reference.tag, release);
  if (tag === undefined) return undefined;
  return `${match[1]}${value.slice(0, value.length - reference.tag.length)}${tag}${match[3]}`;
}

function alignCiImage(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (lineText.includes("@sha256:")) return undefined;
  const tag = alignTag(pin.raw, release);
  if (tag === undefined) return undefined;
  const at = lineText.indexOf(`:${pin.raw}`);
  if (at === -1) return undefined;
  return `${lineText.slice(0, at)}:${tag}${lineText.slice(at + 1 + pin.raw.length)}`;
}

function alignComposerPlatform(pin: RuntimePin, lineText: string, release: string): string | undefined {
  const match = /("php"\s*:\s*")([^"]*)(")/.exec(lineText);
  if (!match || match[2] !== pin.raw) return undefined;
  return `${lineText.slice(0, match.index)}${match[1]}${release}${match[3]}${lineText.slice(match.index + match[0].length)}`;
}

function align(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (pin.kind === "floor" || !/^\d+\.\d+$/.test(release)) return undefined;

  if (pin.source === SOURCE_PHP_VERSION) {
    const value = lineText.trim();
    if (value !== pin.raw) return undefined;
    const indent = lineText.slice(0, lineText.length - lineText.trimStart().length);
    return `${indent}${value.startsWith("php-") ? "php-" : ""}${release}`;
  }

  if (pin.source === SOURCE_TOOL_VERSIONS) {
    const match = /^(\s*php\s+)([^\s#]+)(\s*(?:#.*)?)$/.exec(lineText);
    return match && match[2] === pin.raw ? `${match[1]}${release}${match[3]}` : undefined;
  }

  if (pin.source === SOURCE_COMPOSER_PLATFORM) return alignComposerPlatform(pin, lineText, release);

  if (pin.source.endsWith(" FROM")) return alignImage(pin, lineText, release);

  if (pin.source === SOURCE_GITLAB || pin.source === SOURCE_CIRCLECI) return alignCiImage(pin, lineText, release);

  if (pin.source === SOURCE_SETUP_PHP) {
    if (pin.raw.includes("${{")) return undefined;
    const match = /^(\s*(?:-\s*)?php-version\s*:\s*)(["']?)([^"'\s#]+)\2(\s*(?:#.*)?)$/.exec(lineText);
    return match && match[3] === pin.raw ? `${match[1]}${match[2]}${release}${match[2]}${match[4]}` : undefined;
  }

  return undefined;
}

export const phpDriftCollector: DriftCollector = {
  runtime: "php",
  async collect(root: string): Promise<RuntimePin[]> {
    const pins: RuntimePin[] = [];
    for (const file of await phpFiles(root)) {
      let contents: string;
      try {
        contents = await readFile(file.path, "utf8");
      } catch {
        continue;
      }
      const path = relativePosix(root, file.path);
      if (file.kind === "php-version") collectPhpVersion(contents, path, pins);
      else if (file.kind === "tool-versions") collectToolVersions(contents, path, pins);
      else if (file.kind === "composer") collectComposerJson(contents, path, pins);
      else if (file.kind === "composer-lock") collectComposerLock(contents, path, pins);
      else if (file.kind === "dockerfile") collectDockerfile(contents, path, pins);
      else if (file.kind === "workflow") collectWorkflow(contents, path, pins);
      else if (file.kind === "gitlab") imagePins(parseGitlabCi(contents).unclassified, SOURCE_GITLAB, path, pins);
      else imagePins(parseCircleci(contents).declarations, SOURCE_CIRCLECI, path, pins);
    }
    return pins;
  },
  align,
};

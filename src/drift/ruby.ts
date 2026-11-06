import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { LineCounter, isMap, isNode, isScalar, isSeq, parseDocument } from "yaml";
import type { YAMLMap } from "yaml";

import { parseCircleci } from "../detectors/ci-images/parse-circleci.js";
import { parseGitlabCi } from "../detectors/ci-images/parse-gitlab-ci.js";
import { parseDockerfile } from "../detectors/container/parse-dockerfile.js";
import { parseImageReference } from "../detectors/container/parse-image.js";
import type { ImageReference } from "../detectors/container/parse-image.js";
import { parseGemfile } from "../detectors/ruby/parse-gemfile.js";
import { parseGemfileLock } from "../detectors/ruby/parse-gemfile-lock.js";
import { parseGemspec } from "../detectors/ruby/parse-gemspec.js";
import {
  MAXIMUM_INPUT_BYTES,
  PINNED_RUBY_VERSION,
  parseRubyVersion,
  parseToolVersions,
} from "../detectors/ruby/parse-ruby-runtime.js";
import { relativePosix } from "../paths.js";
import type { DriftCollector, RuntimePin } from "./types.js";

/**
 * Collects every Ruby version a repository states, with file and line.
 *
 * It reads `.ruby-version`, `.tool-versions`, `Gemfile`, `Gemfile.lock`, `*.gemspec`, Dockerfile and
 * Containerfile `FROM`/`RUN` lines, `ruby/setup-ruby` workflow inputs, and GitLab CI and CircleCI Ruby
 * images. The detectors' parsers and bounded input limits are reused unchanged. Values that cannot be
 * resolved offline are reported with the reason; nothing is evaluated, executed, fetched, or written.
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
  ".venv",
  "venv",
  "fixtures",
  "__fixtures__",
  "testdata",
]);
const DOCKERFILE_NAME = /^(?:Dockerfile|Containerfile)(?:\.[A-Za-z0-9_.-]+)?$|\.(?:Dockerfile|Containerfile)$/;
const GEMFILE_RUBY = /^\s*ruby\s+(["'])([^"'#]*)\1\s*(?:#.*)?$/;
const FLOOR_CLAUSE = /^\s*(?:>=|>|=|~>)?\s*v?(\d+)\.(\d+)(?:\.\d+)*(?:p\d+)?\s*$/;
const SETUP_RUBY = /^ruby\/setup-ruby@/i;
const MATRIX_REFERENCE = /^\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}$/;
const TAG_VERSION = /^(v?)(\d+\.\d+)(?:\.\d+)?(?:p\d+)?(.*)$/;

const SOURCE_RUBY_VERSION = ".ruby-version";
const SOURCE_TOOL_VERSIONS = ".tool-versions";
const SOURCE_GEMFILE = "Gemfile ruby";
const SOURCE_GEMFILE_LOCK = "Gemfile.lock RUBY VERSION";
const SOURCE_GEMSPEC = "gemspec required_ruby_version";
const SOURCE_DOCKERFILE_FROM = "Dockerfile FROM";
const SOURCE_DOCKERFILE_RUN = "Dockerfile RUN";
const SOURCE_SETUP_RUBY = "GitHub Actions ruby/setup-ruby ruby-version";
const SOURCE_GITLAB = "GitLab CI image";
const SOURCE_CIRCLECI = "CircleCI image";

type RubyFileKind =
  | "ruby-version"
  | "tool-versions"
  | "gemfile"
  | "gemfile-lock"
  | "gemspec"
  | "dockerfile"
  | "gitlab"
  | "circleci"
  | "workflow";

interface RubyFile {
  kind: RubyFileKind;
  path: string;
}

function fileKind(name: string, directory: string): RubyFileKind | undefined {
  if (name === ".ruby-version") return "ruby-version";
  if (name === ".tool-versions") return "tool-versions";
  if (name === "Gemfile") return "gemfile";
  if (name === "Gemfile.lock") return "gemfile-lock";
  if (name.endsWith(".gemspec")) return "gemspec";
  if (DOCKERFILE_NAME.test(name)) return "dockerfile";
  if (name === ".gitlab-ci.yml") return "gitlab";
  if (name === "config.yml" && basename(directory) === ".circleci") return "circleci";
  if (/\.ya?ml$/.test(name) && basename(directory) === "workflows" && basename(dirname(directory)) === ".github")
    return "workflow";
  return undefined;
}

async function rubyFiles(root: string): Promise<RubyFile[]> {
  const files: RubyFile[] = [];
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
  const match = /^(?:ruby-)?(\d+)\.(\d+)/.exec(value.trim());
  return match ? `${match[1]}.${match[2]}` : undefined;
}

/** The lowest release a literal requirement admits, or undefined when it states no minimum. */
function floorRelease(value: string): string | undefined {
  for (const clause of value.split(",")) {
    const match = FLOOR_CLAUSE.exec(clause);
    if (match) return `${match[1]}.${match[2]}`;
  }
  return undefined;
}

function makePin(
  path: string,
  line: number,
  source: string,
  raw: string,
  kind: "pin" | "floor",
  release: string | undefined,
  unresolved?: string,
): RuntimePin {
  return {
    path,
    line,
    source,
    raw,
    kind,
    ...(release === undefined ? {} : { release }),
    ...(release === undefined ? { unresolved: unresolved ?? `"${raw}" does not name a Ruby major.minor release` } : {}),
  };
}

function collectRubyVersion(contents: string, path: string, pins: RuntimePin[]): void {
  const declarations = parseRubyVersion(contents);
  if (declarations.length > 0) {
    for (const declaration of declarations)
      pins.push(
        makePin(path, declaration.line, SOURCE_RUBY_VERSION, declaration.value, "pin", releaseOf(declaration.value)),
      );
    return;
  }
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return;
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const value = rawLine.trim();
    if (value === "" || value.startsWith("#")) continue;
    pins.push(
      makePin(
        path,
        index + 1,
        SOURCE_RUBY_VERSION,
        value,
        "pin",
        PINNED_RUBY_VERSION.test(value) ? releaseOf(value) : undefined,
        `"${value}" is not a single Ruby version Evergreen reads`,
      ),
    );
  }
}

function collectToolVersions(contents: string, path: string, pins: RuntimePin[]): void {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return;
  const byLine = new Map<number, string[]>();
  for (const declaration of parseToolVersions(contents)) {
    const values = byLine.get(declaration.line);
    if (values) values.push(declaration.value);
    else byLine.set(declaration.line, [declaration.value]);
  }
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const [beforeComment = ""] = rawLine.split("#", 1);
    const text = beforeComment.trim();
    if (text === "") continue;
    const [tool, ...versions] = text.split(/\s+/);
    if (tool !== "ruby" || versions.length === 0) continue;
    const parsed = byLine.get(index + 1);
    if (parsed) {
      for (const value of parsed)
        pins.push(makePin(path, index + 1, SOURCE_TOOL_VERSIONS, value, "pin", releaseOf(value)));
      continue;
    }
    for (const value of versions) {
      pins.push(
        makePin(
          path,
          index + 1,
          SOURCE_TOOL_VERSIONS,
          value,
          "pin",
          PINNED_RUBY_VERSION.test(value) ? releaseOf(value) : undefined,
          `"${value}" is not a Ruby version Evergreen reads`,
        ),
      );
    }
  }
}

function collectGemfile(contents: string, path: string, pins: RuntimePin[]): void {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return;
  for (const declaration of parseGemfile(contents)) {
    if (declaration.kind !== "ruby") continue;
    pins.push(makePin(path, declaration.line, SOURCE_GEMFILE, declaration.value, "pin", releaseOf(declaration.value)));
  }
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const match = GEMFILE_RUBY.exec(rawLine);
    const value = match?.[2];
    if (!value || PINNED_RUBY_VERSION.test(value) || value.includes("#{") || value.includes("${")) continue;
    pins.push(
      makePin(
        path,
        index + 1,
        SOURCE_GEMFILE,
        value,
        "floor",
        floorRelease(value),
        `"${value}" does not state a minimum Ruby release`,
      ),
    );
  }
}

function collectGemfileLock(contents: string, path: string, pins: RuntimePin[]): void {
  const declarations = parseGemfileLock(contents).filter((declaration) => declaration.kind === "ruby");
  if (declarations.length > 0) {
    for (const declaration of declarations) {
      if (declaration.kind !== "ruby") continue;
      pins.push(
        makePin(path, declaration.line, SOURCE_GEMFILE_LOCK, declaration.value, "pin", releaseOf(declaration.value)),
      );
    }
    return;
  }
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return;
  let section = "";
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine !== "" && !/^\s/.test(rawLine)) {
      section = rawLine.trim();
      continue;
    }
    if (section !== "RUBY VERSION") continue;
    const match = /^\s*ruby\s+(\S+)\s*$/.exec(rawLine);
    if (match?.[1])
      pins.push(
        makePin(
          path,
          index + 1,
          SOURCE_GEMFILE_LOCK,
          match[1],
          "pin",
          releaseOf(match[1]),
          `"${match[1]}" is not a Ruby version Evergreen reads`,
        ),
      );
  }
}

function collectGemspec(contents: string, path: string, pins: RuntimePin[]): void {
  for (const declaration of parseGemspec(contents)) {
    pins.push(
      makePin(
        path,
        declaration.line,
        SOURCE_GEMSPEC,
        declaration.value,
        "floor",
        floorRelease(declaration.value),
        `"${declaration.value}" does not state a minimum Ruby release`,
      ),
    );
  }
}

function isRubyImage(image: ImageReference): boolean {
  return image.registry === "docker.io" && (image.repository === "library/ruby" || image.repository === "cimg/ruby");
}

function imagePins(
  references: ReadonlyArray<{ value: string; line: number }>,
  source: string,
  path: string,
  pins: RuntimePin[],
): void {
  for (const reference of references) {
    const image = parseImageReference(reference.value);
    if (!image || !isRubyImage(image)) continue;
    if (image.tag === undefined) {
      pins.push(
        makePin(path, reference.line, source, reference.value, "pin", undefined, "the image reference has no tag"),
      );
      continue;
    }
    pins.push(
      makePin(
        path,
        reference.line,
        source,
        image.tag,
        "pin",
        releaseOf(image.tag),
        `"${image.tag}" does not name a Ruby major.minor release`,
      ),
    );
  }
}

function collectDockerfile(contents: string, path: string, pins: RuntimePin[]): void {
  for (const declaration of parseDockerfile(contents)) {
    if (declaration.kind === "image") {
      const image = parseImageReference(declaration.value);
      if (!image || !isRubyImage(image)) continue;
      if (image.tag === undefined) {
        pins.push(
          makePin(
            path,
            declaration.line,
            SOURCE_DOCKERFILE_FROM,
            declaration.value,
            "pin",
            undefined,
            "the image reference has no tag",
          ),
        );
      } else {
        pins.push(
          makePin(
            path,
            declaration.line,
            SOURCE_DOCKERFILE_FROM,
            image.tag,
            "pin",
            releaseOf(image.tag),
            `"${image.tag}" does not name a Ruby major.minor release`,
          ),
        );
      }
    } else if (declaration.kind === "runtime" && declaration.runtime === "ruby") {
      pins.push(
        makePin(path, declaration.line, SOURCE_DOCKERFILE_RUN, declaration.value, "pin", releaseOf(declaration.value)),
      );
    }
  }
}

/** The text a scalar was written as: YAML reads `3.3` as the number 3.3, so numbers use their source. */
function textOf(node: unknown): string | undefined {
  if (!isScalar(node)) return undefined;
  if (typeof node.value === "string") return node.value.trim();
  if (typeof node.value === "number") return (node.source ?? String(node.value)).trim();
  return undefined;
}

interface SetupRubyVersion {
  value: string;
  line: number;
  expression: boolean;
  /** Set for the entries of one `strategy.matrix` list, which are alternatives. */
  group?: string;
}

function rubyNodeLine(counter: LineCounter, node: unknown): number {
  return counter.linePos(isNode(node) ? (node.range?.[0] ?? 0) : 0).line;
}

function addSetupRubyVersion(versions: SetupRubyVersion[], node: unknown, counter: LineCounter, group?: string): void {
  if (node === undefined || node === null) return;
  const value = textOf(node);
  if (value === undefined || value === "") return;
  versions.push({
    value,
    line: rubyNodeLine(counter, node),
    expression: value.includes("${{"),
    ...(group === undefined ? {} : { group }),
  });
}

function appendRubyVersionsOfStep(
  versions: SetupRubyVersion[],
  step: YAMLMap,
  matrix: unknown,
  counter: LineCounter,
): void {
  const uses = step.get("uses");
  if (typeof uses !== "string" || !SETUP_RUBY.test(uses)) return;
  const inputs = step.get("with", true);
  if (!isMap(inputs)) return;
  const version = inputs.get("ruby-version", true);
  if (!isScalar(version)) return;
  const key = typeof version.value === "string" ? MATRIX_REFERENCE.exec(version.value.trim())?.[1] : undefined;
  const list = key !== undefined && isMap(matrix) ? matrix.get(key, true) : undefined;
  if (!isSeq(list)) {
    addSetupRubyVersion(versions, version, counter);
    return;
  }
  const group = `matrix:${key}@${rubyNodeLine(counter, list)}`;
  for (const item of list.items) addSetupRubyVersion(versions, item, counter, group);
}

function appendRubyVersionsOfJob(versions: SetupRubyVersion[], job: YAMLMap, counter: LineCounter): void {
  const strategy = job.get("strategy", true);
  const matrix = isMap(strategy) ? strategy.get("matrix", true) : undefined;
  const steps = job.get("steps", true);
  if (!isSeq(steps)) return;
  for (const step of steps.items) if (isMap(step)) appendRubyVersionsOfStep(versions, step, matrix, counter);
}

export function setupRubyVersions(contents: string): SetupRubyVersion[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];
  const lineCounter = new LineCounter();
  const document = parseDocument(contents, { lineCounter, prettyErrors: false, keepSourceTokens: true });
  if (document.errors.length > 0 || !isMap(document.contents)) return [];
  const jobs = document.contents.get("jobs", true);
  if (!isMap(jobs)) return [];
  const versions: SetupRubyVersion[] = [];
  for (const job of jobs.items) if (isMap(job.value)) appendRubyVersionsOfJob(versions, job.value, lineCounter);
  return versions;
}

function collectWorkflow(contents: string, path: string, pins: RuntimePin[]): void {
  for (const entry of setupRubyVersions(contents)) {
    if (entry.expression) {
      pins.push(
        makePin(
          path,
          entry.line,
          SOURCE_SETUP_RUBY,
          entry.value,
          "pin",
          undefined,
          `"${entry.value}" is an expression, which Evergreen does not evaluate`,
        ),
      );
      continue;
    }
    const pin = makePin(path, entry.line, SOURCE_SETUP_RUBY, entry.value, "pin", releaseOf(entry.value));
    pins.push(entry.group === undefined ? pin : { ...pin, group: `${path}:${entry.group}` });
  }
}

function alignTag(tag: string, release: string): string | undefined {
  const match = TAG_VERSION.exec(tag);
  return match ? `${match[1]}${release}${match[3]}` : undefined;
}

function alignImage(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (lineText.includes("@sha256:")) return undefined;
  const tag = alignTag(pin.raw, release);
  if (tag === undefined) return undefined;
  const at = lineText.indexOf(`:${pin.raw}`);
  if (at === -1) return undefined;
  return `${lineText.slice(0, at)}:${tag}${lineText.slice(at + 1 + pin.raw.length)}`;
}

function alignRubyVersionLine(pin: RuntimePin, lineText: string, release: string): string | undefined {
  const value = lineText.trim();
  if (value !== pin.raw) return undefined;
  const indent = lineText.slice(0, lineText.length - lineText.trimStart().length);
  return `${indent}${value.startsWith("ruby-") ? "ruby-" : ""}${release}`;
}

function alignToolVersionsLine(_pin: RuntimePin, lineText: string, release: string): string | undefined {
  const match = /^(\s*ruby\s+)([^\s#]+)(\s*(?:#.*)?)$/.exec(lineText);
  if (!match) return undefined;
  return `${match[1]}${release}${match[3]}`;
}

function alignGemfileLine(_pin: RuntimePin, lineText: string, release: string): string | undefined {
  const match = /^(\s*ruby\s+)(["'])([^"']*)\2(\s*(?:#.*)?)$/.exec(lineText);
  if (!match) return undefined;
  return `${match[1]}${match[2]}${release}${match[2]}${match[4]}`;
}

function alignDockerfileRunLine(pin: RuntimePin, lineText: string, release: string): string | undefined {
  const at = lineText.indexOf(pin.raw);
  if (at === -1) return undefined;
  return `${lineText.slice(0, at)}${release}${lineText.slice(at + pin.raw.length)}`;
}

function alignSetupRubyLine(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (pin.raw.includes("${{")) return undefined;
  const match = /^(\s*(?:-\s*)?ruby-version\s*:\s*)(["']?)([^"'\s#]+)\2(\s*(?:#.*)?)$/.exec(lineText);
  if (!match) return undefined;
  return `${match[1]}${match[2]}${release}${match[2]}${match[4]}`;
}

type LineAligner = (pin: RuntimePin, lineText: string, release: string) => string | undefined;

const IMAGE_SOURCES = new Set([SOURCE_DOCKERFILE_FROM, SOURCE_GITLAB, SOURCE_CIRCLECI]);

const ALIGNERS: Readonly<Record<string, LineAligner>> = {
  [SOURCE_RUBY_VERSION]: alignRubyVersionLine,
  [SOURCE_TOOL_VERSIONS]: alignToolVersionsLine,
  [SOURCE_GEMFILE]: alignGemfileLine,
  [SOURCE_DOCKERFILE_RUN]: alignDockerfileRunLine,
  [SOURCE_SETUP_RUBY]: alignSetupRubyLine,
};

export function align(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (pin.kind === "floor") return undefined;
  if (IMAGE_SOURCES.has(pin.source)) return alignImage(pin, lineText, release);
  return ALIGNERS[pin.source]?.(pin, lineText, release);
}

export const rubyDriftCollector: DriftCollector = {
  runtime: "ruby",
  async collect(root: string): Promise<RuntimePin[]> {
    const pins: RuntimePin[] = [];
    for (const file of await rubyFiles(root)) {
      let contents: string;
      try {
        contents = await readFile(file.path, "utf8");
      } catch {
        continue;
      }
      const path = relativePosix(root, file.path);
      if (file.kind === "ruby-version") collectRubyVersion(contents, path, pins);
      else if (file.kind === "tool-versions") collectToolVersions(contents, path, pins);
      else if (file.kind === "gemfile") collectGemfile(contents, path, pins);
      else if (file.kind === "gemfile-lock") collectGemfileLock(contents, path, pins);
      else if (file.kind === "gemspec") collectGemspec(contents, path, pins);
      else if (file.kind === "dockerfile") collectDockerfile(contents, path, pins);
      else if (file.kind === "gitlab") imagePins(parseGitlabCi(contents).unclassified, SOURCE_GITLAB, path, pins);
      else if (file.kind === "circleci") imagePins(parseCircleci(contents).declarations, SOURCE_CIRCLECI, path, pins);
      else collectWorkflow(contents, path, pins);
    }
    return pins;
  },
  align,
};

import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";

import { parseCircleci } from "../detectors/ci-images/parse-circleci.js";
import { parseGitlabCi } from "../detectors/ci-images/parse-gitlab-ci.js";
import { parseDevcontainer } from "../detectors/container/parse-devcontainer.js";
import { parseDockerfile } from "../detectors/container/parse-dockerfile.js";
import { parseImageReference } from "../detectors/container/parse-image.js";
import type { ImageReference } from "../detectors/container/parse-image.js";
import { setupNodeVersions } from "../detectors/github-actions-node.js";
import { relativePosix } from "../paths.js";
import type { DriftCollector, RuntimePin } from "./types.js";

/**
 * Collects every Node.js version a repository states, at the major release granularity.
 *
 * It reads `.nvmrc`, `.node-version`, `.tool-versions`, `package.json` `volta.node` and `engines.node`,
 * Dockerfile and Containerfile `FROM` lines of the official Node.js image, `devcontainer.json` images and
 * the Node feature `version`, `actions/setup-node` workflow inputs, and GitLab CI, CircleCI, and Azure
 * Pipelines Node.js images. The detectors' parsers are reused unchanged. Values that need a network lookup,
 * such as `lts/*` or `latest`, are reported with the reason; nothing is fetched, executed, or written.
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
  ".venv",
  "venv",
  "fixtures",
  "__fixtures__",
  "testdata",
]);
const DOCKERFILE_NAME = /^(?:Dockerfile|Containerfile)(?:\.[A-Za-z0-9_.-]+)?$|\.(?:Dockerfile|Containerfile)$/;
const WORKFLOW_NAME = /\.ya?ml$/i;

const SOURCE_NVMRC = ".nvmrc";
const SOURCE_NODE_VERSION = ".node-version";
const SOURCE_TOOL_VERSIONS = ".tool-versions";
const SOURCE_VOLTA = "package.json volta.node";
const SOURCE_ENGINES = "package.json engines.node";
const SOURCE_DEVCONTAINER_IMAGE = "devcontainer.json image";
const SOURCE_DEVCONTAINER_FEATURE = "devcontainer.json node feature";
const SOURCE_SETUP_NODE = "actions/setup-node node-version";
const SOURCE_SETUP_NODE_MATRIX = "setup-node matrix";
const SOURCE_GITLAB = "GitLab CI image";
const SOURCE_CIRCLECI = "CircleCI image";
const SOURCE_AZURE = "Azure Pipelines container";

/**
 * Node.js LTS codenames and the major release each one names, from the Node.js release schedule:
 * https://github.com/nodejs/Release#release-schedule
 */
const LTS_CODENAMES = new Map<string, string>([
  ["argon", "4"],
  ["boron", "6"],
  ["carbon", "8"],
  ["dubnium", "10"],
  ["erbium", "12"],
  ["fermium", "14"],
  ["gallium", "16"],
  ["hydrogen", "18"],
  ["iron", "20"],
  ["jod", "22"],
  ["krypton", "24"],
]);

const NODE_IMAGES = new Set(["library/node", "cimg/node", "circleci/node"]);
const DEVCONTAINER_NODE_IMAGES = new Set(["devcontainers/javascript-node", "devcontainers/typescript-node"]);
const NODE_FEATURE = /"(?:ghcr\.io\/devcontainers\/features\/node(?::[^"]*)?|node)"\s*:\s*\{/g;

type NodeFileKind =
  | "nvmrc"
  | "node-version"
  | "tool-versions"
  | "manifest"
  | "dockerfile"
  | "devcontainer"
  | "workflow"
  | "gitlab"
  | "circleci"
  | "azure";

interface NodeFile {
  kind: NodeFileKind;
  path: string;
}

interface Resolved {
  release?: string;
  unresolved?: string;
}

function fileKind(name: string, directory: string): NodeFileKind | undefined {
  if (name === ".nvmrc") return "nvmrc";
  if (name === ".node-version") return "node-version";
  if (name === ".tool-versions") return "tool-versions";
  if (name === "package.json") return "manifest";
  if (DOCKERFILE_NAME.test(name)) return "dockerfile";
  if (name === "devcontainer.json") return "devcontainer";
  if (name === ".gitlab-ci.yml") return "gitlab";
  if (name === "azure-pipelines.yml") return "azure";
  if (name === "config.yml" && basename(directory) === ".circleci") return "circleci";
  if (WORKFLOW_NAME.test(name) && basename(directory) === "workflows" && basename(dirname(directory)) === ".github")
    return "workflow";
  return undefined;
}

async function nodeFiles(root: string): Promise<NodeFile[]> {
  const files: NodeFile[] = [];
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

/** The major release a version file or workflow input names; codenames resolve through the release schedule. */
function resolveVersion(value: string): Resolved {
  const trimmed = value.trim();
  if (trimmed === "") return { unresolved: "the value is empty" };
  const codename = /^lts\/(.*)$/i.exec(trimmed);
  if (codename) {
    const [, rawName = ""] = codename;
    const name = rawName.trim().toLowerCase();
    if (name === "*" || name === "")
      return { unresolved: `"${trimmed}" selects the current LTS line, which Evergreen does not resolve offline` };
    const major = LTS_CODENAMES.get(name);
    return major === undefined
      ? { unresolved: `"${trimmed}" names no Node.js LTS codename Evergreen knows` }
      : { release: major };
  }
  if (/^(?:lts|latest|current|node)$/i.test(trimmed)) {
    return { unresolved: `"${trimmed}" is a floating alias, which Evergreen does not resolve offline` };
  }
  const version = /^v?(\d+)(?:\.(?:\d+|[x*])){0,2}(?:[-+][0-9A-Za-z.-]+)?$/i.exec(trimmed);
  return version === null
    ? { unresolved: `"${trimmed}" is not a Node.js version Evergreen reads` }
    : { release: String(Number(version[1])) };
}

/** The major release and tag suffix a Docker image tag names, such as `18.19.0-alpine` or `lts-hydrogen-slim`. */
function resolveTag(tag: string): Resolved & { variant?: string } {
  // One optional suffix, not a repetition of one: the body class already contains the separator
  // characters, so a repeated group would accept the same language while backtracking
  // exponentially on a run of `-` or `.` (`js/redos`).
  const codename = /^lts[-/]([a-z]+)((?:[-.][0-9A-Za-z_.-]+)?)$/i.exec(tag);
  if (codename) {
    const [, codeName = "", suffix = ""] = codename;
    const major = LTS_CODENAMES.get(codeName.toLowerCase());
    const variant = suffix;
    return major === undefined
      ? { unresolved: `"${tag}" names no Node.js LTS codename Evergreen knows` }
      : { release: major, variant };
  }
  if (/^(?:lts|latest|current|node)(?:$|[-.])/i.test(tag)) {
    return { unresolved: `"${tag}" is a floating tag, which Evergreen does not resolve offline` };
  }
  const version = /^v?(\d+)((?:\.\d+){0,2})((?:[-+].*)?)$/.exec(tag);
  return version === null
    ? { unresolved: `"${tag}" does not name a Node.js release` }
    : { release: String(Number(version[1])), variant: version[3] ?? "" };
}

/** The Node.js major in a Dev Container image tag, such as `1-20-bookworm` or `18-bookworm`. */
function releaseFromDevcontainerTag(tag: string): Resolved {
  const parts = tag.split("-");
  const [first = ""] = parts;
  const node = parts.length >= 3 && /^\d+$/.test(first) ? parts[1] : first;
  return node !== undefined && /^\d+$/.test(node)
    ? { release: String(Number(node)) }
    : { unresolved: `"${tag}" does not name a Node.js release` };
}

/** The minimum a range admits, read from its first lower bound. Ranges without one stay unresolved. */
function resolveFloor(range: string): Resolved {
  const lowerBound = /(?:^|[\s,|])(\^|~>|~|>=|>|=)?\s*v?(\d+)/g;
  for (const match of range.matchAll(lowerBound)) {
    return { release: String(Number(match[2])) };
  }
  return { unresolved: `"${range.trim()}" states no minimum Node.js release` };
}

function makePin(
  path: string,
  line: number,
  source: string,
  raw: string,
  kind: "pin" | "floor",
  resolved: Resolved,
  group?: string,
): RuntimePin {
  return {
    path,
    line,
    source,
    raw,
    kind,
    ...(group === undefined ? {} : { group }),
    ...(resolved.release === undefined ? {} : { release: resolved.release }),
    ...(resolved.release === undefined
      ? { unresolved: resolved.unresolved ?? `"${raw}" is not a Node.js version Evergreen reads` }
      : {}),
  };
}

function collectVersionFile(contents: string, path: string, source: string, pins: RuntimePin[]): void {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return;
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const value = rawLine.replace(/#.*$/, "").trim();
    if (value === "") continue;
    pins.push(makePin(path, index + 1, source, value, "pin", resolveVersion(value)));
  }
}

function collectToolVersions(contents: string, path: string, pins: RuntimePin[]): void {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return;
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const fields = rawLine.replace(/#.*$/, "").trim().split(/\s+/);
    if (fields[0] !== "nodejs") continue;
    const values = fields.slice(1).filter((value) => value !== "");
    if (values.length === 0) {
      pins.push({
        path,
        line: index + 1,
        source: SOURCE_TOOL_VERSIONS,
        raw: "nodejs",
        kind: "pin",
        unresolved: "the nodejs entry has no version",
      });
      continue;
    }
    for (const value of values)
      pins.push(makePin(path, index + 1, SOURCE_TOOL_VERSIONS, value, "pin", resolveVersion(value)));
  }
}

/** The text a scalar was written as: YAML reads `20.11` as the number 20.11, so numbers use their source. */
function textOf(value: unknown): string | undefined {
  if (!isScalar(value)) return undefined;
  if (typeof value.value === "string") return value.value.trim();
  if (typeof value.value === "number") return (value.source ?? String(value.value)).trim();
  return undefined;
}

interface ManifestField {
  value: string;
  line: number;
}

function manifestField(contents: string, section: string, field: string): ManifestField | undefined {
  try {
    const lineCounter = new LineCounter();
    const document = parseDocument(contents, { lineCounter, prettyErrors: false });
    if (document.errors.length > 0 || !isMap(document.contents)) return undefined;
    const group = document.contents.get(section, true);
    if (!isMap(group)) return undefined;
    const node = group.get(field, true);
    const value = textOf(node);
    if (value === undefined || value === "") return undefined;
    const range = isScalar(node) ? node.range : undefined;
    return { value, line: range == null ? 1 : lineCounter.linePos(range[0]).line };
  } catch {
    return undefined;
  }
}

function collectManifest(contents: string, path: string, pins: RuntimePin[]): void {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return;
  const volta = manifestField(contents, "volta", "node");
  if (volta) pins.push(makePin(path, volta.line, SOURCE_VOLTA, volta.value, "pin", resolveVersion(volta.value)));
  const engines = manifestField(contents, "engines", "node");
  if (engines)
    pins.push(makePin(path, engines.line, SOURCE_ENGINES, engines.value, "floor", resolveFloor(engines.value)));
}

function isNodeImage(reference: ImageReference): boolean {
  return reference.registry === "docker.io" && NODE_IMAGES.has(reference.repository);
}

function isDevcontainerNodeImage(reference: ImageReference): boolean {
  return reference.registry === "mcr.microsoft.com" && DEVCONTAINER_NODE_IMAGES.has(reference.repository);
}

function imagePin(path: string, line: number, source: string, value: string): RuntimePin | undefined {
  const reference = parseImageReference(value);
  if (!reference || (!isNodeImage(reference) && !isDevcontainerNodeImage(reference))) return undefined;
  if (reference.tag === undefined) {
    return {
      path,
      line,
      source,
      raw: value,
      kind: "pin",
      unresolved: "the image has no tag, so it selects the floating default",
    };
  }
  const resolved = isDevcontainerNodeImage(reference)
    ? releaseFromDevcontainerTag(reference.tag)
    : resolveTag(reference.tag);
  return makePin(path, line, source, reference.tag, "pin", resolved);
}

function imagePins(
  references: ReadonlyArray<{ value: string; line: number }>,
  source: string,
  path: string,
  pins: RuntimePin[],
): void {
  for (const reference of references) {
    const found = imagePin(path, reference.line, source, reference.value);
    if (found) pins.push(found);
  }
}

function collectDockerfile(contents: string, path: string, pins: RuntimePin[]): void {
  const source = `${path.slice(path.lastIndexOf("/") + 1)} FROM`;
  for (const declaration of parseDockerfile(contents)) {
    if (declaration.kind === "image") {
      const found = imagePin(path, declaration.line, source, declaration.value);
      if (found) pins.push(found);
    } else if (
      declaration.kind === "dynamic" &&
      /^(?:[a-z0-9.-]+\/)?(?:library\/)?(?:node|cimg\/node|circleci\/node)(?::|@|$)/i.test(declaration.value)
    ) {
      pins.push({
        path,
        line: declaration.line,
        source,
        raw: declaration.value,
        kind: "pin",
        unresolved: "the image reference is dynamic, which Evergreen does not expand",
      });
    }
  }
}

function lineAt(contents: string, index: number): number {
  let line = 1;
  for (let offset = 0; offset < index && offset < contents.length; offset++) {
    if (contents[offset] === "\n") line++;
  }
  return line;
}

/** The `version` of a Node.js Dev Container feature, which selects the Node.js the container installs. */
function nodeFeatureVersions(contents: string): Array<{ value: string; line: number }> {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];
  const versions: Array<{ value: string; line: number }> = [];
  for (const feature of contents.matchAll(NODE_FEATURE)) {
    const open = (feature.index ?? 0) + feature[0].length - 1;
    const close = contents.indexOf("}", open);
    if (close === -1) continue;
    const body = contents.slice(open + 1, close);
    const version = /"version"\s*:\s*(?:"([^"]*)"|(\d+(?:\.\d+)*))/.exec(body);
    if (!version) continue;
    const value = (version[1] ?? version[2] ?? "").trim();
    if (value === "") continue;
    versions.push({ value, line: lineAt(contents, open + 1 + (version.index ?? 0)) });
  }
  return versions;
}

function collectDevcontainer(contents: string, path: string, pins: RuntimePin[]): void {
  for (const declaration of parseDevcontainer(contents)) {
    const found = imagePin(path, declaration.line, SOURCE_DEVCONTAINER_IMAGE, declaration.value);
    if (found) pins.push(found);
  }
  for (const feature of nodeFeatureVersions(contents)) {
    if (feature.value.toLowerCase() === "none") {
      pins.push({
        path,
        line: feature.line,
        source: SOURCE_DEVCONTAINER_FEATURE,
        raw: feature.value,
        kind: "pin",
        unresolved: "the feature installs no Node.js version",
      });
      continue;
    }
    pins.push(
      makePin(path, feature.line, SOURCE_DEVCONTAINER_FEATURE, feature.value, "pin", resolveVersion(feature.value)),
    );
  }
}

/** The 1-based lines of the entries under every job's `strategy.matrix`, which are alternatives, not drift. */
function matrixLines(contents: string): Set<number> {
  const lines = new Set<number>();
  try {
    const lineCounter = new LineCounter();
    const document = parseDocument(contents, { lineCounter, prettyErrors: false });
    if (document.errors.length > 0 || !isMap(document.contents)) return lines;
    const jobs = document.contents.get("jobs", true);
    if (!isMap(jobs)) return lines;
    for (const job of jobs.items) {
      if (!isMap(job.value)) continue;
      const strategy = job.value.get("strategy", true);
      const matrix = isMap(strategy) ? strategy.get("matrix", true) : undefined;
      if (!isMap(matrix)) continue;
      for (const item of matrix.items) {
        const entries = isSeq(item.value) ? item.value.items : [item.value];
        for (const entry of entries) {
          if (isScalar(entry) && entry.range) lines.add(lineCounter.linePos(entry.range[0]).line);
        }
      }
    }
  } catch {
    return lines;
  }
  return lines;
}

function collectWorkflow(contents: string, path: string, pins: RuntimePin[]): void {
  const versions = setupNodeVersions(contents);
  if (versions.length === 0) return;
  const matrix = matrixLines(contents);
  for (const version of versions) {
    const fromMatrix = matrix.has(version.line);
    const resolved = version.expression
      ? { unresolved: `"${version.value}" is an expression, which Evergreen does not evaluate` }
      : resolveVersion(version.value);
    pins.push(
      makePin(
        path,
        version.line,
        fromMatrix ? SOURCE_SETUP_NODE_MATRIX : SOURCE_SETUP_NODE,
        version.value,
        "pin",
        resolved,
        fromMatrix ? SOURCE_SETUP_NODE_MATRIX : undefined,
      ),
    );
  }
}

/** Literal and map-form `container` images on Azure Pipelines jobs. */
function azureContainerImages(contents: string): Array<{ value: string; line: number }> {
  try {
    const lineCounter = new LineCounter();
    const document = parseDocument(contents, { lineCounter, merge: false });
    if (document.errors.length > 0 || !isMap(document.contents)) return [];
    const images: Array<{ value: string; line: number }> = [];
    const add = (node: unknown): void => {
      if (isScalar(node) && typeof node.value === "string" && node.range) {
        images.push({ value: node.value, line: lineCounter.linePos(node.range[0]).line });
      } else if (isMap(node)) {
        add(node.get("image", true));
      }
    };
    const jobs = (node: unknown): void => {
      if (!isSeq(node)) return;
      for (const job of node.items) if (isMap(job)) add(job.get("container", true));
    };
    add(document.contents.get("container", true));
    jobs(document.contents.get("jobs", true));
    const stages = document.contents.get("stages", true);
    if (isSeq(stages)) for (const stage of stages.items) if (isMap(stage)) jobs(stage.get("jobs", true));
    return images;
  } catch {
    return [];
  }
}

function alignVersionFile(pin: RuntimePin, lineText: string, release: string): string | undefined {
  const value = lineText.trim();
  if (value !== pin.raw) return undefined;
  const indent = lineText.slice(0, lineText.length - lineText.trimStart().length);
  return `${indent}${pin.raw.startsWith("v") ? "v" : ""}${release}`;
}

function alignImage(pin: RuntimePin, lineText: string, release: string): string | undefined {
  const match = /^(\s*FROM\s+(?:--\S+\s+)*)(\S+)(.*)$/i.exec(lineText);
  if (!match) return undefined;
  const [, prefix = "", value = "", suffix = ""] = match;
  const reference = parseImageReference(value);
  if (!reference || reference.tag !== pin.raw || reference.digest !== undefined || !isNodeImage(reference))
    return undefined;
  const resolved = resolveTag(reference.tag);
  if (resolved.release === undefined) return undefined;
  return `${prefix}${value.slice(0, value.length - reference.tag.length)}${release}${resolved.variant ?? ""}${suffix}`;
}

function align(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (pin.kind === "floor" || !/^\d+$/.test(release)) return undefined;
  if (pin.source === SOURCE_NVMRC || pin.source === SOURCE_NODE_VERSION)
    return alignVersionFile(pin, lineText, release);

  if (pin.source === SOURCE_TOOL_VERSIONS) {
    const match = /^(\s*nodejs\s+)(\S+)(\s*(?:#.*)?)$/.exec(lineText);
    return match && match[2] === pin.raw ? `${match[1]}${release}${match[3]}` : undefined;
  }

  if (pin.source === SOURCE_VOLTA) {
    const match = /^(\s*"node"\s*:\s*")([^"]*)("\s*,?\s*)$/.exec(lineText);
    return match && match[2] === pin.raw ? `${match[1]}${release}${match[3]}` : undefined;
  }

  if (pin.source.endsWith(" FROM")) return alignImage(pin, lineText, release);

  if (pin.source === SOURCE_SETUP_NODE) {
    const match = /^(\s*(?:-\s*)?node-version\s*:\s*)(["']?)([^"'#\s]+)\2(\s*(?:#.*)?)$/.exec(lineText);
    return match && match[3] === pin.raw ? `${match[1]}${match[2]}${release}${match[2]}${match[4]}` : undefined;
  }

  return undefined;
}

export const nodejsDriftCollector: DriftCollector = {
  runtime: "nodejs",
  async collect(root: string): Promise<RuntimePin[]> {
    const pins: RuntimePin[] = [];
    for (const file of await nodeFiles(root)) {
      let contents: string;
      try {
        contents = await readFile(file.path, "utf8");
      } catch {
        continue;
      }
      const path = relativePosix(root, file.path);
      if (file.kind === "nvmrc") collectVersionFile(contents, path, SOURCE_NVMRC, pins);
      else if (file.kind === "node-version") collectVersionFile(contents, path, SOURCE_NODE_VERSION, pins);
      else if (file.kind === "tool-versions") collectToolVersions(contents, path, pins);
      else if (file.kind === "manifest") collectManifest(contents, path, pins);
      else if (file.kind === "dockerfile") collectDockerfile(contents, path, pins);
      else if (file.kind === "devcontainer") collectDevcontainer(contents, path, pins);
      else if (file.kind === "workflow") collectWorkflow(contents, path, pins);
      else if (file.kind === "gitlab") imagePins(parseGitlabCi(contents).unclassified, SOURCE_GITLAB, path, pins);
      else if (file.kind === "circleci") {
        const parsed = parseCircleci(contents);
        imagePins([...parsed.declarations, ...parsed.unclassified], SOURCE_CIRCLECI, path, pins);
      } else imagePins(azureContainerImages(contents), SOURCE_AZURE, path, pins);
    }
    return pins;
  },
  align,
};

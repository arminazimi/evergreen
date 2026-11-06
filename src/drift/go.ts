import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";

import { parseCircleci } from "../detectors/ci-images/parse-circleci.js";
import { parseGitlabCi } from "../detectors/ci-images/parse-gitlab-ci.js";
import { parseDockerfile } from "../detectors/container/parse-dockerfile.js";
import { parseImageReference } from "../detectors/container/parse-image.js";
import { parseGoMod } from "../detectors/go/parse-go-mod.js";
import type { GoModDeclaration } from "../detectors/go/parse-go-mod.js";
import { parseGoWork } from "../detectors/go/parse-go-work.js";
import type { GoWorkDeclaration } from "../detectors/go/parse-go-work.js";
import { relativePosix } from "../paths.js";
import type { DriftCollector, RuntimePin } from "./types.js";

/**
 * Collects every Go version a repository states: go.mod and go.work toolchains, the `go` directives as floors,
 * `.go-version`, `.tool-versions`, Dockerfile images, `actions/setup-go`, GitLab, CircleCI, and Azure Pipelines
 * images. It reads repository files only. The Go toolchain is never invoked, no network is used, and no file
 * is written. Release granularity is `1.minor`, so `go1.22.4` and `golang:1.22.4-alpine` both resolve to `1.22`.
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
const WORKFLOW_NAME = /\.ya?ml$/i;
const SETUP_GO = /^actions\/setup-go@/i;
const MATRIX_REFERENCE = /^\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}$/;
const GO_VERSION = /^\d+\.\d+(?:\.\d+)?(?:rc\d+)?$/;
const DOCKER_TAG = /^(\d+)\.(\d+)(?:\.\d+)?(?:rc\d+)?([-+].*)?$/;

type RepositoryFileKind =
  | "go-mod"
  | "go-work"
  | "go-version"
  | "tool-versions"
  | "dockerfile"
  | "workflow"
  | "gitlab"
  | "circleci"
  | "azure";

interface RepositoryFile {
  path: string;
  kind: RepositoryFileKind;
}

/** Which reader a repository file gets; the first rule that matches wins, so the order is the dispatch. */
interface FileKindRule {
  kind: RepositoryFileKind;
  matches: (name: string, directory: string) => boolean;
}

const FILE_KIND_RULES: readonly FileKindRule[] = [
  { kind: "go-mod", matches: (name) => name === "go.mod" },
  { kind: "go-work", matches: (name) => name === "go.work" },
  { kind: "go-version", matches: (name) => name === ".go-version" },
  { kind: "tool-versions", matches: (name) => name === ".tool-versions" },
  { kind: "dockerfile", matches: (name) => DOCKERFILE_NAME.test(name) },
  { kind: "gitlab", matches: (name) => name === ".gitlab-ci.yml" },
  { kind: "azure", matches: (name) => name === "azure-pipelines.yml" },
  { kind: "circleci", matches: (name, directory) => name === "config.yml" && basename(directory) === ".circleci" },
  {
    kind: "workflow",
    matches: (name, directory) =>
      WORKFLOW_NAME.test(name) && basename(directory) === "workflows" && basename(dirname(directory)) === ".github",
  },
];

function fileKind(name: string, directory: string): RepositoryFileKind | undefined {
  for (const rule of FILE_KIND_RULES) {
    if (rule.matches(name, directory)) return rule.kind;
  }
  return undefined;
}

async function repositoryFiles(root: string): Promise<RepositoryFile[]> {
  const files: RepositoryFile[] = [];
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
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(path, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const kind = fileKind(entry.name, directory);
      if (kind !== undefined) files.push({ path, kind });
    }
  }
  await walk(root, 0);
  return files;
}

function releaseFromVersion(value: string): string | undefined {
  const match = /^(?:go)?(\d+)\.(\d+)(?:\.\d+)?(?:rc\d+)?$/.exec(value.trim());
  return match ? `${match[1]}.${match[2]}` : undefined;
}

function releaseFromDockerTag(tag: string): { release?: string; variant: string } {
  const match = DOCKER_TAG.exec(tag);
  return match ? { release: `${match[1]}.${match[2]}`, variant: match[3] ?? "" } : { variant: "" };
}

function versionPin(path: string, line: number, source: string, raw: string, kind: "pin" | "floor"): RuntimePin {
  const release = releaseFromVersion(raw);
  return release === undefined
    ? { path, line, source, raw, kind, unresolved: `"${raw}" is not a Go release number` }
    : { path, line, source, raw, kind, release };
}

/** The tag of a Docker Hub `golang` image, or undefined for any other image. Dynamic values keep their written tag. */
function golangImageTag(value: string): { tag?: string } | undefined {
  const reference = parseImageReference(value);
  if (reference) {
    if (reference.registry !== "docker.io" || reference.repository !== "library/golang") return undefined;
    return reference.tag === undefined ? {} : { tag: reference.tag };
  }
  const [withoutDigest = ""] = value.split("@");
  const slash = withoutDigest.lastIndexOf("/");
  const colon = withoutDigest.lastIndexOf(":");
  const repository = (colon > slash ? withoutDigest.slice(0, colon) : withoutDigest).toLowerCase();
  if (repository !== "golang" && repository !== "library/golang" && repository !== "docker.io/library/golang")
    return undefined;
  return colon > slash ? { tag: withoutDigest.slice(colon + 1) } : {};
}

function imagePin(path: string, line: number, source: string, value: string): RuntimePin | undefined {
  const image = golangImageTag(value);
  if (!image) return undefined;
  if (image.tag === undefined) {
    return {
      path,
      line,
      source,
      raw: value,
      kind: "pin",
      unresolved: "the image has no tag, so it follows the latest release",
    };
  }
  const parts = releaseFromDockerTag(image.tag);
  return parts.release === undefined
    ? { path, line, source, raw: image.tag, kind: "pin", unresolved: `"${image.tag}" does not name a Go release line` }
    : { path, line, source, raw: image.tag, kind: "pin", release: parts.release };
}

function textOf(node: unknown): string | undefined {
  if (!isScalar(node)) return undefined;
  if (typeof node.value === "string") return node.value.trim();
  if (typeof node.value === "number") return (node.source ?? String(node.value)).trim();
  return undefined;
}

/** A node whose start offset the line counter can resolve. */
type LineNode = { range?: [number, number, ...unknown[]] | null };

/** The 1-based line a node starts on. */
type LineOf = (node: LineNode) => number;

/** `actions/setup-go` inputs in one workflow. A matrix reference is followed to the job's literal list. */
function workflowPins(path: string, contents: string): RuntimePin[] {
  try {
    const lineCounter = new LineCounter();
    const document = parseDocument(contents, { lineCounter, prettyErrors: false, keepSourceTokens: true });
    if (document.errors.length > 0 || !isMap(document.contents)) return [];
    const jobs = document.contents.get("jobs", true);
    if (!isMap(jobs)) return [];
    const lineOf: LineOf = (node) => lineCounter.linePos(node.range?.[0] ?? 0).line;
    const pins: RuntimePin[] = [];
    for (const job of jobs.items) pins.push(...jobSetupGoPins(path, job, lineOf));
    return pins;
  } catch {
    return [];
  }
}

/** The setup-go pins of one job; a matrix reference resolves against that job's own matrix. */
function jobSetupGoPins(path: string, job: { value?: unknown }, lineOf: LineOf): RuntimePin[] {
  if (!isMap(job.value)) return [];
  const strategy = job.value.get("strategy", true);
  const matrix = isMap(strategy) ? strategy.get("matrix", true) : undefined;
  const steps = job.value.get("steps", true);
  if (!isSeq(steps)) return [];
  const pins: RuntimePin[] = [];
  for (const step of steps.items) pins.push(...setupGoStepPins(path, step, matrix, lineOf));
  return pins;
}

/** The pins of a step that uses `actions/setup-go`; every other step contributes nothing. */
function setupGoStepPins(path: string, step: unknown, matrix: unknown, lineOf: LineOf): RuntimePin[] {
  if (!isMap(step)) return [];
  const uses = step.get("uses");
  if (typeof uses !== "string" || !SETUP_GO.test(uses)) return [];
  const inputs = step.get("with", true);
  if (!isMap(inputs)) return [];
  return [
    ...goVersionPins(path, inputs.get("go-version", true), matrix, lineOf),
    ...goVersionFilePins(path, inputs.get("go-version-file", true), lineOf),
  ];
}

/** One pin per entry of the matrix a `go-version` reference names, or the literal value when it names none. */
function goVersionPins(path: string, version: unknown, matrix: unknown, lineOf: LineOf): RuntimePin[] {
  if (!isScalar(version)) return [];
  const key = typeof version.value === "string" ? MATRIX_REFERENCE.exec(version.value.trim())?.[1] : undefined;
  const list = key !== undefined && isMap(matrix) ? matrix.get(key, true) : undefined;
  if (isSeq(list)) {
    const pins: RuntimePin[] = [];
    const group = `${path}:matrix:${key}@${lineOf(list)}`;
    for (const item of list.items) {
      const value = textOf(item);
      if (value === undefined || value === "") continue;
      pins.push({ ...versionPin(path, lineOf(item as LineNode), "actions/setup-go matrix", value, "pin"), group });
    }
    return pins;
  }
  const value = textOf(version);
  return value === undefined ? [] : [versionPin(path, lineOf(version), "actions/setup-go go-version", value, "pin")];
}

/** The pin naming the file a `go-version-file` input defers to, which the report reads separately. */
function goVersionFilePins(path: string, versionFile: unknown, lineOf: LineOf): RuntimePin[] {
  if (!isScalar(versionFile)) return [];
  const value = textOf(versionFile);
  if (value === undefined || value === "") return [];
  return [
    {
      path,
      line: lineOf(versionFile),
      source: "actions/setup-go go-version-file",
      raw: value,
      kind: "pin",
      unresolved: `the version comes from ${value}, which this report reads separately`,
    },
  ];
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

function versionFilePins(path: string, contents: string): RuntimePin[] {
  const lines = (contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents).split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const value = raw.replace(/#.*$/, "").trim();
    if (value === "") continue;
    return [versionPin(path, index + 1, ".go-version", value, "pin")];
  }
  return [];
}

function toolVersionsPins(path: string, contents: string): RuntimePin[] {
  for (const [index, raw] of contents.split(/\r?\n/).entries()) {
    const fields = raw.replace(/#.*$/, "").trim().split(/\s+/);
    if (fields[0] !== "golang") continue;
    const value = fields[1];
    if (value === undefined)
      return [
        {
          path,
          line: index + 1,
          source: ".tool-versions",
          raw: "golang",
          kind: "pin",
          unresolved: "the golang entry has no version",
        },
      ];
    if (/^(?:ref|path):/.test(value)) {
      return [
        {
          path,
          line: index + 1,
          source: ".tool-versions",
          raw: value,
          kind: "pin",
          unresolved: `"${value}" names a source, not a release`,
        },
      ];
    }
    return [versionPin(path, index + 1, ".tool-versions", value, "pin")];
  }
  return [];
}

/** Which rewriter a pin source gets; the first rule that matches wins, so the order is the dispatch. */
interface GoAlignRule {
  appliesTo: (source: string) => boolean;
  rewrite: (lineText: string, version: string) => string | undefined;
}

function alignToolchainLine(lineText: string, version: string): string | undefined {
  const match = /^(\s*toolchain\s+)(\S+)(.*)$/.exec(lineText);
  return match ? `${match[1]}go${version}${match[3]}` : undefined;
}

function alignGoVersionLine(lineText: string, version: string): string | undefined {
  const match = /^(\s*)(\S+)(\s*(?:#.*)?)$/.exec(lineText);
  return match ? `${match[1]}${version}${match[3]}` : undefined;
}

function alignToolVersionsLine(lineText: string, version: string): string | undefined {
  const match = /^(\s*golang\s+)(\S+)(\s*(?:#.*)?)$/.exec(lineText);
  return match ? `${match[1]}${version}${match[3]}` : undefined;
}

function alignGolangFrom(lineText: string, version: string): string | undefined {
  const match = /^(\s*FROM\s+(?:--\S+\s+)*)(\S+)(.*)$/i.exec(lineText);
  if (!match) return undefined;
  const [, prefix = "", imageText = "", rest = ""] = match;
  const reference = parseImageReference(imageText);
  if (
    !reference ||
    reference.digest !== undefined ||
    reference.registry !== "docker.io" ||
    reference.repository !== "library/golang" ||
    reference.tag === undefined
  )
    return undefined;
  const parts = releaseFromDockerTag(reference.tag);
  if (parts.release === undefined) return undefined;
  return `${prefix}golang:${version}${parts.variant}${rest}`;
}

function alignSetupGoLine(lineText: string, version: string): string | undefined {
  const match = /^(\s*(?:-\s+)?go-version:\s*)(["']?)([^"'\s#]+)(["']?)(.*)$/.exec(lineText);
  return match ? `${match[1]}${match[2]}${version}${match[4]}${match[5]}` : undefined;
}

const GO_ALIGN_RULES: readonly GoAlignRule[] = [
  {
    appliesTo: (source) => source === "go.mod toolchain" || source === "go.work toolchain",
    rewrite: alignToolchainLine,
  },
  { appliesTo: (source) => source === ".go-version", rewrite: alignGoVersionLine },
  { appliesTo: (source) => source === ".tool-versions", rewrite: alignToolVersionsLine },
  { appliesTo: (source) => source.endsWith(" FROM"), rewrite: alignGolangFrom },
  { appliesTo: (source) => source === "actions/setup-go go-version", rewrite: alignSetupGoLine },
];

function align(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (pin.kind !== "pin") return undefined;
  const version = release.trim().replace(/^go/, "");
  if (!GO_VERSION.test(version)) return undefined;
  const rule = GO_ALIGN_RULES.find((entry) => entry.appliesTo(pin.source));
  return rule === undefined ? undefined : rule.rewrite(lineText, version);
}

/** The pins one repository file adds, keyed by the kind the traversal gave it. */
type KindReader = (path: string, contents: string, absolute: string) => RuntimePin[];

const PINS_BY_KIND: Record<RepositoryFileKind, KindReader> = {
  "go-mod": (path, contents) => declarationPins(path, "go.mod", parseGoMod(contents)),
  "go-work": (path, contents) => declarationPins(path, "go.work", parseGoWork(contents)),
  "go-version": (path, contents) => versionFilePins(path, contents),
  "tool-versions": (path, contents) => toolVersionsPins(path, contents),
  dockerfile: (path, contents, absolute) => dockerfilePins(path, contents, absolute),
  workflow: (path, contents) => workflowPins(path, contents),
  gitlab: (path, contents) => imagePins(path, "GitLab CI image", parseGitlabCi(contents).unclassified),
  circleci: (path, contents) => {
    const parsed = parseCircleci(contents);
    return imagePins(path, "CircleCI image", [...parsed.declarations, ...parsed.unclassified]);
  },
  azure: (path, contents) => imagePins(path, "Azure Pipelines container", azureContainerImages(contents)),
};

function declarationPins(
  path: string,
  source: string,
  declarations: readonly (GoModDeclaration | GoWorkDeclaration)[],
): RuntimePin[] {
  const pins: RuntimePin[] = [];
  for (const declaration of declarations) {
    if (declaration.kind === "require") continue;
    if (declaration.kind === "toolchain")
      pins.push(versionPin(path, declaration.line, `${source} toolchain`, declaration.value, "pin"));
    else pins.push(versionPin(path, declaration.line, `${source} go`, declaration.value, "floor"));
  }
  return pins;
}

function dockerfilePins(path: string, contents: string, absolute: string): RuntimePin[] {
  const pins: RuntimePin[] = [];
  for (const declaration of parseDockerfile(contents)) {
    if (declaration.kind !== "image") continue;
    const found = imagePin(path, declaration.line, `${basename(absolute)} FROM`, declaration.value);
    if (found) pins.push(found);
  }
  return pins;
}

function imagePins(path: string, source: string, items: readonly { line: number; value: string }[]): RuntimePin[] {
  const pins: RuntimePin[] = [];
  for (const item of items) {
    const found = imagePin(path, item.line, source, item.value);
    if (found) pins.push(found);
  }
  return pins;
}

/** The file contents, or undefined when the file cannot be read. */
async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function collect(root: string): Promise<RuntimePin[]> {
  const pins: RuntimePin[] = [];
  for (const file of await repositoryFiles(root)) {
    const contents = await readText(file.path);
    if (contents === undefined) continue;
    pins.push(...PINS_BY_KIND[file.kind](relativePosix(root, file.path), contents, file.path));
  }
  return pins;
}

export const goDriftCollector: DriftCollector = { runtime: "go", collect, align };

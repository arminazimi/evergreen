import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { LineCounter, isMap, isNode, isScalar, isSeq, parseDocument } from "yaml";
import type { YAMLMap } from "yaml";

import { parseCircleci } from "../detectors/ci-images/parse-circleci.js";
import { parseGitlabCi } from "../detectors/ci-images/parse-gitlab-ci.js";
import { parseDockerfile } from "../detectors/container/parse-dockerfile.js";
import { parseImageReference } from "../detectors/container/parse-image.js";
import { parseCargoToml } from "../detectors/rust/parse-cargo-toml.js";
import { parseRustToolchain } from "../detectors/rust/parse-rust-toolchain.js";
import { relativePosix } from "../paths.js";
import type { DriftCollector, RuntimePin } from "./types.js";

/**
 * Collects every Rust version a repository states: the `rust-toolchain` and `rust-toolchain.toml` channel,
 * `.tool-versions`, Dockerfile images, `dtolnay/rust-toolchain` and `actions-rs/toolchain` steps, CI images,
 * and the `rust-version` floors in Cargo.toml. It reads repository files only. rustup and Cargo are never
 * invoked, no network is used, and no file is written. Release granularity is `1.minor`, so `1.79.0` and
 * `rust:1.79.0-slim` both resolve to `1.79`.
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
const DTOLNAY = /^dtolnay\/rust-toolchain(?:@(.+))?$/i;
const ACTIONS_RS = /^actions-rs\/toolchain@/i;
const RUST_RELEASE = /^1\.(\d+)(?:\.\d+)?([-+][A-Za-z0-9_.+-]+)?$/;

const IMAGE_SOURCES = new Set([
  "GitLab CI image",
  "CircleCI image",
  "Azure Pipelines container",
  "GitHub Actions container",
  "GitHub Actions service image",
]);

type RepositoryFileKind =
  | "toolchain"
  | "cargo"
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

interface FileKindRule {
  kind: RepositoryFileKind;
  matches: (name: string, directory: string) => boolean;
}

/** Which reader a file gets; the first rule that matches wins, so the order is the dispatch. */
const FILE_KIND_RULES: readonly FileKindRule[] = [
  { kind: "toolchain", matches: (name) => name === "rust-toolchain" || name === "rust-toolchain.toml" },
  { kind: "cargo", matches: (name) => name === "Cargo.toml" },
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

/** The release line and trailing target or image variant of a Rust version or image tag. */
function releaseParts(value: string): { release: string; suffix: string } | undefined {
  const match = RUST_RELEASE.exec(value.trim());
  return match ? { release: `1.${match[1]}`, suffix: match[2] ?? "" } : undefined;
}

function unresolvedReason(value: string): string {
  return /^(?:stable|beta|nightly)(?:-|$)/i.test(value)
    ? `"${value}" is a moving channel, not a release Evergreen can resolve offline`
    : `"${value}" is not a Rust release number`;
}

function versionPin(path: string, line: number, source: string, raw: string, kind: "pin" | "floor"): RuntimePin {
  const parts = releaseParts(raw);
  return parts === undefined
    ? { path, line, source, raw, kind, unresolved: unresolvedReason(raw) }
    : { path, line, source, raw, kind, release: parts.release };
}

/** The tag of a Docker Hub `rust` image, or undefined for any other image. Dynamic values keep their written tag. */
function rustImageTag(value: string): { tag?: string } | undefined {
  const reference = parseImageReference(value);
  if (reference) {
    if (reference.registry !== "docker.io" || reference.repository !== "library/rust") return undefined;
    return reference.tag === undefined ? {} : { tag: reference.tag };
  }
  const [withoutDigest = ""] = value.split("@");
  const slash = withoutDigest.lastIndexOf("/");
  const colon = withoutDigest.lastIndexOf(":");
  const repository = (colon > slash ? withoutDigest.slice(0, colon) : withoutDigest).toLowerCase();
  if (repository !== "rust" && repository !== "library/rust" && repository !== "docker.io/library/rust")
    return undefined;
  return colon > slash ? { tag: withoutDigest.slice(colon + 1) } : {};
}

function imagePin(path: string, line: number, source: string, value: string): RuntimePin | undefined {
  const image = rustImageTag(value);
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
  const parts = releaseParts(image.tag);
  return parts === undefined
    ? { path, line, source, raw: image.tag, kind: "pin", unresolved: unresolvedReason(image.tag) }
    : { path, line, source, raw: image.tag, kind: "pin", release: parts.release };
}

function textOf(node: unknown): string | undefined {
  if (!isScalar(node)) return undefined;
  if (typeof node.value === "string") return node.value.trim();
  if (typeof node.value === "number") return (node.source ?? String(node.value)).trim();
  return undefined;
}

interface ImageValue {
  value: string;
  line: number;
}

/** The 1-based line a YAML node starts on; nodes without a source range read as line 1. */
type LineOf = (node: unknown) => number;

function imageValue(node: unknown, lineOf: LineOf): ImageValue | undefined {
  if (isScalar(node) && typeof node.value === "string" && node.range) {
    return { value: node.value, line: lineOf(node) };
  }
  if (isMap(node)) return imageValue(node.get("image", true), lineOf);
  return undefined;
}

/** One `rust` image pin from a literal or map-form `container` or `services` entry. */
function containerImagePin(path: string, node: unknown, source: string, lineOf: LineOf): RuntimePin[] {
  const found = imageValue(node, lineOf);
  if (found === undefined) return [];
  const pin = imagePin(path, found.line, source, found.value);
  return pin === undefined ? [] : [pin];
}

/** The `dtolnay/rust-toolchain@1.79` ref, when the step pins its version in the `uses` line. */
function dtolnayRefPin(path: string, usesNode: unknown, version: string | undefined, lineOf: LineOf): RuntimePin[] {
  if (version === undefined || !isScalar(usesNode) || usesNode.range === undefined) return [];
  return [versionPin(path, lineOf(usesNode), "dtolnay/rust-toolchain ref", version, "pin")];
}

/** The `toolchain` input of a `dtolnay/rust-toolchain` or `actions-rs/toolchain` step. */
function toolchainInputPins(path: string, step: unknown, dtolnay: boolean, lineOf: LineOf): RuntimePin[] {
  const inputs = isMap(step) ? step.get("with", true) : undefined;
  const toolchain = isMap(inputs) ? inputs.get("toolchain", true) : undefined;
  const value = textOf(toolchain);
  if (value === undefined || value === "") return [];
  return [
    versionPin(
      path,
      lineOf(toolchain),
      dtolnay ? "dtolnay/rust-toolchain toolchain" : "actions-rs/toolchain toolchain",
      value,
      "pin",
    ),
  ];
}

/** One workflow step: the version in the action ref, and the toolchain input of the Rust actions. */
function stepPins(path: string, step: unknown, lineOf: LineOf): RuntimePin[] {
  if (!isMap(step)) return [];
  const usesNode = step.get("uses", true);
  const uses = textOf(usesNode);
  if (uses === undefined) return [];
  const dtolnay = DTOLNAY.exec(uses);
  const pins = dtolnayRefPin(path, usesNode, dtolnay?.[1], lineOf);
  if (dtolnay === null && !ACTIONS_RS.test(uses)) return pins;
  pins.push(...toolchainInputPins(path, step, dtolnay !== null, lineOf));
  return pins;
}

function jobPins(path: string, jobs: YAMLMap, lineOf: LineOf): RuntimePin[] {
  const pins: RuntimePin[] = [];
  for (const job of jobs.items) {
    if (!isMap(job.value)) continue;
    pins.push(...containerImagePin(path, job.value.get("container", true), "GitHub Actions container", lineOf));
    const services = job.value.get("services", true);
    if (isMap(services))
      for (const service of services.items)
        pins.push(...containerImagePin(path, service.value, "GitHub Actions service image", lineOf));
    const steps = job.value.get("steps", true);
    if (isSeq(steps)) for (const step of steps.items) pins.push(...stepPins(path, step, lineOf));
  }
  return pins;
}

/** `rust-toolchain` action inputs and container images in one GitHub Actions workflow. */
function workflowPins(path: string, contents: string): RuntimePin[] {
  try {
    const lineCounter = new LineCounter();
    const document = parseDocument(contents, { lineCounter, prettyErrors: false, keepSourceTokens: true });
    if (document.errors.length > 0 || !isMap(document.contents)) return [];
    const lineOf: LineOf = (node) => lineCounter.linePos(isNode(node) ? (node.range?.[0] ?? 0) : 0).line;
    const jobs = document.contents.get("jobs", true);
    if (!isMap(jobs)) return [];
    return jobPins(path, jobs, lineOf);
  } catch {
    return [];
  }
}

/** Literal and map-form `container` images on Azure Pipelines jobs. */
function azureContainerImages(contents: string): ImageValue[] {
  try {
    const lineCounter = new LineCounter();
    const document = parseDocument(contents, { lineCounter, merge: false });
    if (document.errors.length > 0 || !isMap(document.contents)) return [];
    const images: ImageValue[] = [];
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

function toolVersionsPins(path: string, contents: string): RuntimePin[] {
  for (const [index, raw] of contents.split(/\r?\n/).entries()) {
    const fields = raw.replace(/#.*$/, "").trim().split(/\s+/);
    if (fields[0] !== "rust") continue;
    const value = fields[1];
    if (value === undefined)
      return [
        {
          path,
          line: index + 1,
          source: ".tool-versions",
          raw: "rust",
          kind: "pin",
          unresolved: "the rust entry has no version",
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

function channel(source: string, path: string, contents: string): RuntimePin[] {
  return parseRustToolchain(contents).map((declaration) =>
    versionPin(path, declaration.line, source, declaration.value, "pin"),
  );
}

function cargoPins(path: string, contents: string): RuntimePin[] {
  const pins: RuntimePin[] = [];
  for (const declaration of parseCargoToml(contents)) {
    if (declaration.kind === "rust-version")
      pins.push(versionPin(path, declaration.line, "Cargo.toml rust-version", declaration.value, "floor"));
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

function imagePins(path: string, source: string, items: readonly ImageValue[]): RuntimePin[] {
  const pins: RuntimePin[] = [];
  for (const item of items) {
    const found = imagePin(path, item.line, source, item.value);
    if (found) pins.push(found);
  }
  return pins;
}

function circleciPins(path: string, contents: string): RuntimePin[] {
  const parsed = parseCircleci(contents);
  return imagePins(path, "CircleCI image", [...parsed.declarations, ...parsed.unclassified]);
}

type KindReader = (path: string, contents: string, absolute: string) => RuntimePin[];

/** Which reader a classified file gets. The dispatch is a lookup, so adding a kind is one entry. */
const PINS_BY_KIND: Record<RepositoryFileKind, KindReader> = {
  toolchain: (path, contents, absolute) =>
    channel(
      basename(absolute) === "rust-toolchain.toml" ? "rust-toolchain.toml channel" : "rust-toolchain",
      path,
      contents,
    ),
  cargo: cargoPins,
  "tool-versions": toolVersionsPins,
  dockerfile: dockerfilePins,
  workflow: workflowPins,
  gitlab: (path, contents) => imagePins(path, "GitLab CI image", parseGitlabCi(contents).unclassified),
  circleci: circleciPins,
  azure: (path, contents) => imagePins(path, "Azure Pipelines container", azureContainerImages(contents)),
};

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

function alignImage(lineText: string, version: string, suffix: string): string | undefined {
  const match = /(\brust:)([^\s"']+)/.exec(lineText);
  if (!match) return undefined;
  const [, prefix = "", image = ""] = match;
  if (image.includes("@")) return undefined;
  const index = match.index;
  return `${lineText.slice(0, index)}${prefix}${version}${suffix}${lineText.slice(index + match[0].length)}`;
}

function alignChannel(lineText: string, version: string, suffix: string): string | undefined {
  const match = /^(\s*channel\s*=\s*)(["'])([^"']*)\2(.*)$/.exec(lineText);
  return match ? `${match[1]}${match[2]}${version}${suffix}${match[2]}${match[4]}` : undefined;
}

function alignToolchainFile(lineText: string, version: string, suffix: string): string | undefined {
  const match = /^(\s*)(\S+)(\s*(?:#.*)?)$/.exec(lineText);
  return match ? `${match[1]}${version}${suffix}${match[3]}` : undefined;
}

function alignToolVersions(lineText: string, version: string, suffix: string): string | undefined {
  const match = /^(\s*rust\s+)(\S+)(\s*(?:#.*)?)$/.exec(lineText);
  return match ? `${match[1]}${version}${suffix}${match[3]}` : undefined;
}

function alignDtolnayRef(lineText: string, version: string, suffix: string): string | undefined {
  const match = /^(\s*(?:-\s*)?uses\s*:\s*["']?dtolnay\/rust-toolchain@)([^\s"'#]+)(["']?(?:\s+#.*)?)$/.exec(lineText);
  return match ? `${match[1]}${version}${suffix}${match[3]}` : undefined;
}

function alignToolchainInput(lineText: string, version: string, suffix: string): string | undefined {
  const match = /^(\s*(?:-\s+)?toolchain\s*:\s*)(["']?)([^"'\s#]+)\2(\s*(?:#.*)?)$/.exec(lineText);
  return match ? `${match[1]}${match[2]}${version}${suffix}${match[2]}${match[4]}` : undefined;
}

interface AlignRule {
  appliesTo: (source: string, lineText: string) => boolean;
  rewrite: (lineText: string, version: string, suffix: string) => string | undefined;
}

/** Which rewriter a pin source gets; the first rule that matches wins, so a source with no rule is never rewritten. */
const ALIGN_RULES: readonly AlignRule[] = [
  {
    appliesTo: (source, lineText) =>
      source === "rust-toolchain.toml channel" || (source === "rust-toolchain" && /^\s*channel\s*=/.test(lineText)),
    rewrite: alignChannel,
  },
  { appliesTo: (source) => source === "rust-toolchain", rewrite: alignToolchainFile },
  { appliesTo: (source) => source === ".tool-versions", rewrite: alignToolVersions },
  { appliesTo: (source) => source.endsWith(" FROM") || IMAGE_SOURCES.has(source), rewrite: alignImage },
  { appliesTo: (source) => source === "dtolnay/rust-toolchain ref", rewrite: alignDtolnayRef },
  {
    appliesTo: (source) => source === "dtolnay/rust-toolchain toolchain" || source === "actions-rs/toolchain toolchain",
    rewrite: alignToolchainInput,
  },
];

function align(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (pin.kind !== "pin" || pin.release === undefined) return undefined;
  const target = releaseParts(release);
  if (target === undefined) return undefined;
  const rule = ALIGN_RULES.find((entry) => entry.appliesTo(pin.source, lineText));
  return rule?.rewrite(lineText, target.release, releaseParts(pin.raw)?.suffix ?? "");
}

export const rustDriftCollector: DriftCollector = { runtime: "rust", collect, align };

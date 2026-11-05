import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { LineCounter, isMap, isNode, isScalar, isSeq, parseDocument } from "yaml";
import type { YAMLMap } from "yaml";

import { parseCircleci } from "../detectors/ci-images/parse-circleci.js";
import { parseGitlabCi } from "../detectors/ci-images/parse-gitlab-ci.js";
import { parseDockerfile } from "../detectors/container/parse-dockerfile.js";
import { parseImageReference } from "../detectors/container/parse-image.js";
import { parseTerraformFile } from "../detectors/terraform/parse-terraform.js";
import { parseToolVersionsTerraform, parseTerraformVersionFile } from "../detectors/terraform/parse-version-files.js";
import { relativePosix } from "../paths.js";
import type { DriftCollector, RuntimePin } from "./types.js";

/**
 * Collects every Terraform CLI version a repository states: `.terraform-version` and `.tool-versions` files at any
 * depth, Dockerfile `FROM hashicorp/terraform` images, the `hashicorp/setup-terraform` `terraform_version` input,
 * `hashicorp/terraform` images in GitHub Actions, GitLab CI, CircleCI, and Azure Pipelines, and `required_version`
 * in every module. An exact `required_version` is a pin; every other constraint is a floor. Version files and
 * `required_version` apply to their directory, so a floor is checked against the nearest version file at or above
 * it, or against the repository-wide pins when its directory declares none. It reads repository files only. The
 * Terraform CLI is never invoked, no network is used, and no file is written. Release granularity is `major.minor`,
 * so `1.17.0` and the image tag `1.17` both resolve to `1.17`.
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
  ".terraform",
]);
const DOCKERFILE_NAME = /^(?:Dockerfile|Containerfile)(?:\.[A-Za-z0-9_.-]+)?$|\.(?:Dockerfile|Containerfile)$/;
const WORKFLOW_NAME = /\.ya?ml$/i;
const SETUP_TERRAFORM = /^hashicorp\/setup-terraform@/i;
const TERRAFORM_IMAGE = "hashicorp/terraform";
const RELEASE = /^(\d+)\.(\d+)(?:\.\d+)?$/;
const DOCKER_TAG = /^(\d+)\.(\d+)(?:\.\d+)?([-+].*)?$/;
const CONSTRAINT_PART = /^(>=|>|<=|<|!=|=|~>)?\s*(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?)$/;
const ALIGN_RELEASE = /^(\d+)\.(\d+)(?:\.(\d+))?$/;

type RepositoryFileKind =
  | "terraform-version"
  | "tool-versions"
  | "tf"
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
  { kind: "terraform-version", matches: (name) => name === ".terraform-version" },
  { kind: "tool-versions", matches: (name) => name === ".tool-versions" },
  { kind: "tf", matches: (name) => name.endsWith(".tf") },
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
  const match = RELEASE.exec(value.trim());
  return match ? `${match[1]}.${match[2]}` : undefined;
}

function releaseFromDockerTag(tag: string): { release?: string; variant: string } {
  const match = DOCKER_TAG.exec(tag);
  return match ? { release: `${match[1]}.${match[2]}`, variant: match[3] ?? "" } : { variant: "" };
}

/** The greater of two `major.minor` releases, for the effective lower bound of a multi-part constraint. */
function newerRelease(a: string, b: string): string {
  const [aMajor = "0", aMinor = "0"] = a.split(".");
  const [bMajor = "0", bMinor = "0"] = b.split(".");
  if (aMajor !== bMajor) return Number(aMajor) > Number(bMajor) ? a : b;
  return Number(aMinor) >= Number(bMinor) ? a : b;
}

function versionPin(
  path: string,
  scope: string,
  line: number,
  source: string,
  raw: string,
  kind: "pin" | "floor",
): RuntimePin {
  const release = releaseFromVersion(raw);
  return release === undefined
    ? { path, line, source, raw, kind, scope, unresolved: `"${raw}" is not a Terraform release line` }
    : { path, line, source, raw, kind, scope, release };
}

/** The tag of a Docker Hub `hashicorp/terraform` image, or undefined for any other image. Dynamic values keep their written tag. */
function terraformImageTag(value: string): { tag?: string } | undefined {
  const reference = parseImageReference(value);
  if (reference) {
    if (reference.registry !== "docker.io" || reference.repository !== TERRAFORM_IMAGE) return undefined;
    return reference.tag === undefined ? {} : { tag: reference.tag };
  }
  const [withoutDigest = ""] = value.split("@");
  const slash = withoutDigest.lastIndexOf("/");
  const colon = withoutDigest.lastIndexOf(":");
  const repository = (colon > slash ? withoutDigest.slice(0, colon) : withoutDigest).toLowerCase();
  if (repository !== TERRAFORM_IMAGE) return undefined;
  return colon > slash ? { tag: withoutDigest.slice(colon + 1) } : {};
}

function imagePin(path: string, line: number, source: string, value: string): RuntimePin | undefined {
  const image = terraformImageTag(value);
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
    ? {
        path,
        line,
        source,
        raw: image.tag,
        kind: "pin",
        unresolved: `"${image.tag}" does not name a Terraform release line`,
      }
    : { path, line, source, raw: image.tag, kind: "pin", release: parts.release };
}

interface ConstraintPart {
  operator: string;
  version: string;
}

function constraintParts(value: string): ConstraintPart[] | undefined {
  const parts: ConstraintPart[] = [];
  for (const part of value.split(",")) {
    const match = CONSTRAINT_PART.exec(part.trim());
    if (!match) return undefined;
    const [, operator = "", version = ""] = match;
    parts.push({ operator, version });
  }
  return parts.length > 0 ? parts : undefined;
}

/**
 * `required_version = "1.17.0"`, `= 1.17`, and `~> 1.17.0` select one minor line, so they are pins. Every other
 * constraint is a floor resolved from its greatest lower bound, such as `>= 1.16, < 2.0.0` resolving to `1.16`.
 */
const REQUIRED_SOURCE = "terraform required_version";

function constraintPin(
  path: string,
  scope: string,
  line: number,
  raw: string,
  kind: "pin" | "floor",
  release: string | undefined,
  unresolved: string | undefined,
): RuntimePin {
  return {
    path,
    line,
    source: REQUIRED_SOURCE,
    raw,
    kind,
    scope,
    ...(release === undefined ? {} : { release }),
    ...(unresolved === undefined ? {} : { unresolved }),
  };
}

/** True when one constraint part fixes the minor line: an exact `1.17`/`= 1.17` or a `~> 1.17.0` pessimistic pin. */
function selectsOneLine(part: ConstraintPart): boolean {
  if (part.operator === "~>") return /^\d+\.\d+\.\d+$/.test(part.version);
  return (part.operator === "" || part.operator === "=") && RELEASE.test(part.version);
}

function singleConstraintPin(
  path: string,
  scope: string,
  line: number,
  value: string,
  parts: readonly ConstraintPart[],
): RuntimePin | undefined {
  const [part] = parts;
  if (parts.length !== 1 || part === undefined || !selectsOneLine(part)) return undefined;
  const release = releaseFromVersion(part.version);
  return release === undefined
    ? constraintPin(path, scope, line, value, "pin", undefined, `"${part.version}" is not a Terraform release line`)
    : constraintPin(path, scope, line, value, "pin", release, undefined);
}

/** The greatest lower bound of the constraint, or undefined when no part states a minimum. */
function greatestLowerBound(parts: readonly ConstraintPart[]): string | undefined {
  let floor: string | undefined;
  for (const part of parts) {
    if (part.operator !== ">=" && part.operator !== ">" && part.operator !== "~>") continue;
    const release = releaseFromVersion(part.version);
    if (release !== undefined && (floor === undefined || newerRelease(release, floor) === release)) floor = release;
  }
  return floor;
}

function requiredVersionPin(path: string, scope: string, line: number, value: string): RuntimePin {
  const parts = constraintParts(value);
  if (parts === undefined)
    return constraintPin(
      path,
      scope,
      line,
      value,
      "floor",
      undefined,
      `"${value}" is not a Terraform version constraint`,
    );
  const single = singleConstraintPin(path, scope, line, value, parts);
  if (single !== undefined) return single;
  const floor = greatestLowerBound(parts);
  return floor === undefined
    ? constraintPin(path, scope, line, value, "floor", undefined, `"${value}" states no minimum version`)
    : constraintPin(path, scope, line, value, "floor", floor, undefined);
}

function textOf(node: unknown): string | undefined {
  if (!isScalar(node)) return undefined;
  if (typeof node.value === "string") return node.value.trim();
  if (typeof node.value === "number") return (node.source ?? String(node.value)).trim();
  return undefined;
}

/** The 1-based line a YAML node starts on; nodes without a source range read as line 1. */
type LineOf = (node: unknown) => number;

const SETUP_TERRAFORM_SOURCE = "hashicorp/setup-terraform terraform_version";

/** One `hashicorp/terraform` image pin from a literal or map-form `container` or `services` entry. */
function containerImagePin(path: string, node: unknown, lineOf: LineOf): RuntimePin[] {
  const entry = isMap(node) ? node.get("image", true) : node;
  const value = textOf(entry);
  if (value === undefined) return [];
  const found = imagePin(path, lineOf(entry), "GitHub Actions container", value);
  return found === undefined ? [] : [found];
}

function jobContainerPins(path: string, job: YAMLMap, lineOf: LineOf): RuntimePin[] {
  const pins = containerImagePin(path, job.get("container", true), lineOf);
  const services = job.get("services", true);
  if (isMap(services))
    for (const service of services.items) pins.push(...containerImagePin(path, service.value, lineOf));
  return pins;
}

/** The `terraform_version` input of a `hashicorp/setup-terraform` step. */
function setupTerraformPins(path: string, step: unknown, lineOf: LineOf): RuntimePin[] {
  if (!isMap(step)) return [];
  const uses = step.get("uses");
  if (typeof uses !== "string" || !SETUP_TERRAFORM.test(uses)) return [];
  const inputs = step.get("with", true);
  if (!isMap(inputs)) return [];
  const version = inputs.get("terraform_version", true);
  const value = textOf(version);
  if (value === undefined || value === "") return [];
  const line = lineOf(version);
  const release = releaseFromVersion(value);
  return [
    release === undefined
      ? {
          path,
          line,
          source: SETUP_TERRAFORM_SOURCE,
          raw: value,
          kind: "pin",
          unresolved: `"${value}" is not a Terraform release line`,
        }
      : { path, line, source: SETUP_TERRAFORM_SOURCE, raw: value, kind: "pin", release },
  ];
}

function jobPins(path: string, jobs: YAMLMap, lineOf: LineOf): RuntimePin[] {
  const pins: RuntimePin[] = [];
  for (const job of jobs.items) {
    if (!isMap(job.value)) continue;
    pins.push(...jobContainerPins(path, job.value, lineOf));
    const steps = job.value.get("steps", true);
    if (isSeq(steps)) for (const step of steps.items) pins.push(...setupTerraformPins(path, step, lineOf));
  }
  return pins;
}

/** `hashicorp/setup-terraform` inputs and `hashicorp/terraform` job container images in one workflow. */
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

/** The first non-comment entry of a version file, for the unresolved reason when the parser accepts nothing. */
function firstEntry(contents: string): { text: string; line: number } | undefined {
  const lines = (contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents).split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const text = raw.replace(/#.*$/, "").trim();
    if (text !== "") return { text, line: index + 1 };
  }
  return undefined;
}

function terraformVersionFilePins(path: string, scope: string, contents: string): RuntimePin[] {
  const declarations = parseTerraformVersionFile(contents);
  if (declarations.length > 0) {
    return declarations.map((declaration) =>
      versionPin(path, scope, declaration.line, ".terraform-version", declaration.value, "pin"),
    );
  }
  const entry = firstEntry(contents);
  if (entry === undefined) return [];
  const entries = (contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents)
    .split(/\r?\n/)
    .filter((raw) => raw.replace(/#.*$/, "").trim() !== "").length;
  return [
    {
      path,
      line: entry.line,
      source: ".terraform-version",
      raw: entry.text,
      kind: "pin",
      scope,
      unresolved:
        entries > 1 ? "the file states more than one version" : `"${entry.text}" is not a concrete Terraform version`,
    },
  ];
}

function toolVersionsPins(path: string, scope: string, contents: string): RuntimePin[] {
  const declarations = parseToolVersionsTerraform(contents);
  if (declarations.length > 0) {
    return declarations.map((declaration) =>
      versionPin(path, scope, declaration.line, ".tool-versions", declaration.value, "pin"),
    );
  }
  for (const [index, raw] of contents.split(/\r?\n/).entries()) {
    const fields = raw.replace(/#.*$/, "").trim().split(/\s+/);
    if (fields[0] !== "terraform") continue;
    const value = fields[1];
    return [
      {
        path,
        line: index + 1,
        source: ".tool-versions",
        raw: value ?? "terraform",
        kind: "pin",
        scope,
        unresolved:
          value === undefined ? "the terraform entry has no version" : `"${value}" is not a concrete Terraform version`,
      },
    ];
  }
  return [];
}

function alignVersionFile(_pin: RuntimePin, lineText: string, full: string): string | undefined {
  const found = /^(\s*)(\S+)(\s*(?:#.*)?)$/.exec(lineText);
  return found ? `${found[1]}${full}${found[3]}` : undefined;
}

function alignToolVersions(_pin: RuntimePin, lineText: string, full: string): string | undefined {
  const found = /^(\s*terraform\s+)(\S+)(\s*(?:#.*)?)$/.exec(lineText);
  return found ? `${found[1]}${full}${found[3]}` : undefined;
}

function alignSetupTerraform(_pin: RuntimePin, lineText: string, full: string): string | undefined {
  const found = /^(\s*(?:-\s+)?terraform_version:\s*)(["']?)([^"'\s#]+)(["']?)(.*)$/.exec(lineText);
  return found ? `${found[1]}${found[2]}${full}${found[4]}${found[5]}` : undefined;
}

function alignFromLine(_pin: RuntimePin, lineText: string, full: string): string | undefined {
  const found = /^(\s*FROM\s+(?:--\S+\s+)*)(\S+)(.*)$/i.exec(lineText);
  if (!found) return undefined;
  const [, prefix = "", imageText = "", rest = ""] = found;
  const reference = parseImageReference(imageText);
  if (
    !reference ||
    reference.digest !== undefined ||
    reference.registry !== "docker.io" ||
    reference.repository !== TERRAFORM_IMAGE ||
    reference.tag === undefined
  )
    return undefined;
  const parts = releaseFromDockerTag(reference.tag);
  if (parts.release === undefined) return undefined;
  return `${prefix}${TERRAFORM_IMAGE}:${full}${parts.variant}${rest}`;
}

function alignRequiredVersion(pin: RuntimePin, lineText: string, full: string): string | undefined {
  const exact = /^(=\s*)?(\d+\.\d+(?:\.\d+)?)$/.exec(pin.raw.trim());
  if (!exact || !lineText.includes(pin.raw)) return undefined;
  return lineText.replace(pin.raw, `${exact[1] ? "= " : ""}${full}`);
}

interface AlignRule {
  appliesTo: (source: string) => boolean;
  rewrite: (pin: RuntimePin, lineText: string, full: string) => string | undefined;
}

/** Which rewriter a pin source gets; a source with no rule is never rewritten. */
const ALIGN_RULES: readonly AlignRule[] = [
  { appliesTo: (source) => source === ".terraform-version", rewrite: alignVersionFile },
  { appliesTo: (source) => source === ".tool-versions", rewrite: alignToolVersions },
  { appliesTo: (source) => source === SETUP_TERRAFORM_SOURCE, rewrite: alignSetupTerraform },
  { appliesTo: (source) => source.endsWith(" FROM"), rewrite: alignFromLine },
  { appliesTo: (source) => source === REQUIRED_SOURCE, rewrite: alignRequiredVersion },
];

function align(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (pin.kind !== "pin") return undefined;
  const match = ALIGN_RELEASE.exec(release.trim());
  if (match === null) return undefined;
  const full = match[3] === undefined ? `${match[1]}.${match[2]}.0` : release.trim();
  const rule = ALIGN_RULES.find((entry) => entry.appliesTo(pin.source));
  return rule?.rewrite(pin, lineText, full);
}

/** The directory a file's value applies to, `.` for the repository root. */
function scopeOf(root: string, path: string): string {
  const directory = relativePosix(root, dirname(path));
  return directory === "" ? "." : directory;
}

function tfPins(path: string, scope: string, contents: string): RuntimePin[] {
  const pins: RuntimePin[] = [];
  for (const declaration of parseTerraformFile(contents)) {
    if (declaration.kind !== "required_version") continue;
    pins.push(requiredVersionPin(path, scope, declaration.line, declaration.value));
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

function imagePins(path: string, source: string, items: readonly { value: string; line: number }[]): RuntimePin[] {
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

type KindReader = (path: string, scope: string, contents: string, absolute: string) => RuntimePin[];

/** Which reader a classified file gets. The dispatch is a lookup, so adding a kind is one entry. */
const PINS_BY_KIND: Record<RepositoryFileKind, KindReader> = {
  "terraform-version": terraformVersionFilePins,
  "tool-versions": toolVersionsPins,
  tf: tfPins,
  dockerfile: (path, _scope, contents, absolute) => dockerfilePins(path, contents, absolute),
  workflow: (path, _scope, contents) => workflowPins(path, contents),
  gitlab: (path, _scope, contents) => imagePins(path, "GitLab CI image", parseGitlabCi(contents).unclassified),
  circleci: (path, _scope, contents) => circleciPins(path, contents),
  azure: (path, _scope, contents) => imagePins(path, "Azure Pipelines container", azureContainerImages(contents)),
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
    const path = relativePosix(root, file.path);
    pins.push(...PINS_BY_KIND[file.kind](path, scopeOf(root, file.path), contents, file.path));
  }
  return pins;
}

export const terraformCollector: DriftCollector = { runtime: "terraform", collect, align };

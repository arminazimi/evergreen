import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";

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
      const name = entry.name;
      if (name === ".terraform-version") files.push({ path, kind: "terraform-version" });
      else if (name === ".tool-versions") files.push({ path, kind: "tool-versions" });
      else if (name.endsWith(".tf")) files.push({ path, kind: "tf" });
      else if (DOCKERFILE_NAME.test(name)) files.push({ path, kind: "dockerfile" });
      else if (name === ".gitlab-ci.yml") files.push({ path, kind: "gitlab" });
      else if (name === "azure-pipelines.yml") files.push({ path, kind: "azure" });
      else if (name === "config.yml" && basename(directory) === ".circleci") files.push({ path, kind: "circleci" });
      else if (
        WORKFLOW_NAME.test(name) &&
        basename(directory) === "workflows" &&
        basename(dirname(directory)) === ".github"
      )
        files.push({ path, kind: "workflow" });
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
  const withoutDigest = value.split("@")[0]!;
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
    parts.push({ operator: match[1] ?? "", version: match[2]! });
  }
  return parts.length > 0 ? parts : undefined;
}

/**
 * `required_version = "1.17.0"`, `= 1.17`, and `~> 1.17.0` select one minor line, so they are pins. Every other
 * constraint is a floor resolved from its greatest lower bound, such as `>= 1.16, < 2.0.0` resolving to `1.16`.
 */
function requiredVersionPin(path: string, scope: string, line: number, value: string): RuntimePin {
  const source = "terraform required_version";
  const parts = constraintParts(value);
  if (parts === undefined) {
    return {
      path,
      line,
      source,
      raw: value,
      kind: "floor",
      scope,
      unresolved: `"${value}" is not a Terraform version constraint`,
    };
  }
  const single = parts.length === 1 ? parts[0]! : undefined;
  const exact =
    single !== undefined && (single.operator === "" || single.operator === "=") && RELEASE.test(single.version);
  const pessimistic = single !== undefined && single.operator === "~>" && /^\d+\.\d+\.\d+$/.test(single.version);
  if (exact || pessimistic) {
    const release = releaseFromVersion(single!.version);
    return release === undefined
      ? {
          path,
          line,
          source,
          raw: value,
          kind: "pin",
          scope,
          unresolved: `"${single!.version}" is not a Terraform release line`,
        }
      : { path, line, source, raw: value, kind: "pin", scope, release };
  }
  let floor: string | undefined;
  for (const part of parts) {
    if (part.operator !== ">=" && part.operator !== ">" && part.operator !== "~>") continue;
    const release = releaseFromVersion(part.version);
    if (release !== undefined && (floor === undefined || newerRelease(release, floor) === release)) floor = release;
  }
  return floor === undefined
    ? { path, line, source, raw: value, kind: "floor", scope, unresolved: `"${value}" states no minimum version` }
    : { path, line, source, raw: value, kind: "floor", scope, release: floor };
}

function textOf(node: unknown): string | undefined {
  if (!isScalar(node)) return undefined;
  if (typeof node.value === "string") return node.value.trim();
  if (typeof node.value === "number") return (node.source ?? String(node.value)).trim();
  return undefined;
}

/** `hashicorp/setup-terraform` inputs and `hashicorp/terraform` job container images in one workflow. */
function workflowPins(path: string, contents: string): RuntimePin[] {
  try {
    const lineCounter = new LineCounter();
    const document = parseDocument(contents, { lineCounter, prettyErrors: false, keepSourceTokens: true });
    if (document.errors.length > 0 || !isMap(document.contents)) return [];
    const lineOf = (node: { range?: [number, number, ...unknown[]] | null }): number =>
      lineCounter.linePos(node.range?.[0] ?? 0).line;

    const jobs = document.contents.get("jobs", true);
    if (!isMap(jobs)) return [];
    const pins: RuntimePin[] = [];
    const addImage = (node: unknown): void => {
      const value = textOf(node);
      if (value === undefined) return;
      const found = imagePin(
        path,
        lineOf(node as { range?: [number, number, ...unknown[]] | null }),
        "GitHub Actions container",
        value,
      );
      if (found) pins.push(found);
    };
    for (const job of jobs.items) {
      if (!isMap(job.value)) continue;

      const container: unknown = job.value.get("container", true);
      if (isScalar(container)) addImage(container);
      else if (isMap(container)) addImage(container.get("image", true));
      const services = job.value.get("services", true);
      if (isMap(services)) {
        for (const service of services.items) {
          const entry: unknown = service.value;
          if (isScalar(entry)) addImage(entry);
          else if (isMap(entry)) addImage(entry.get("image", true));
        }
      }

      const steps = job.value.get("steps", true);
      if (!isSeq(steps)) continue;
      for (const step of steps.items) {
        if (!isMap(step)) continue;
        const uses = step.get("uses");
        if (typeof uses !== "string" || !SETUP_TERRAFORM.test(uses)) continue;
        const inputs = step.get("with", true);
        if (!isMap(inputs)) continue;
        const version = inputs.get("terraform_version", true);
        if (version && isScalar(version)) {
          const value = textOf(version);
          if (value === undefined || value === "") continue;
          const line = lineOf(version as { range?: [number, number, ...unknown[]] | null });
          const release = releaseFromVersion(value);
          pins.push(
            release === undefined
              ? {
                  path,
                  line,
                  source: "hashicorp/setup-terraform terraform_version",
                  raw: value,
                  kind: "pin",
                  unresolved: `"${value}" is not a Terraform release line`,
                }
              : { path, line, source: "hashicorp/setup-terraform terraform_version", raw: value, kind: "pin", release },
          );
        }
      }
    }
    return pins;
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

function align(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (pin.kind !== "pin") return undefined;
  const match = ALIGN_RELEASE.exec(release.trim());
  if (!match) return undefined;
  const full = match[3] === undefined ? `${match[1]}.${match[2]}.0` : release.trim();

  if (pin.source === ".terraform-version") {
    const found = /^(\s*)(\S+)(\s*(?:#.*)?)$/.exec(lineText);
    return found ? `${found[1]}${full}${found[3]}` : undefined;
  }
  if (pin.source === ".tool-versions") {
    const found = /^(\s*terraform\s+)(\S+)(\s*(?:#.*)?)$/.exec(lineText);
    return found ? `${found[1]}${full}${found[3]}` : undefined;
  }
  if (pin.source === "hashicorp/setup-terraform terraform_version") {
    const found = /^(\s*(?:-\s+)?terraform_version:\s*)(["']?)([^"'\s#]+)(["']?)(.*)$/.exec(lineText);
    return found ? `${found[1]}${found[2]}${full}${found[4]}${found[5]}` : undefined;
  }
  if (pin.source.endsWith(" FROM")) {
    const found = /^(\s*FROM\s+(?:--\S+\s+)*)(\S+)(.*)$/i.exec(lineText);
    if (!found) return undefined;
    const reference = parseImageReference(found[2]!);
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
    return `${found[1]}${TERRAFORM_IMAGE}:${full}${parts.variant}${found[3]}`;
  }
  if (pin.source === "terraform required_version") {
    const exact = /^(=\s*)?(\d+\.\d+(?:\.\d+)?)$/.exec(pin.raw.trim());
    if (!exact || !lineText.includes(pin.raw)) return undefined;
    return lineText.replace(pin.raw, `${exact[1] ? "= " : ""}${full}`);
  }
  return undefined;
}

/** The directory a file's value applies to, `.` for the repository root. */
function scopeOf(root: string, path: string): string {
  const directory = relativePosix(root, dirname(path));
  return directory === "" ? "." : directory;
}

async function collect(root: string): Promise<RuntimePin[]> {
  const pins: RuntimePin[] = [];
  for (const file of await repositoryFiles(root)) {
    let contents: string;
    try {
      contents = await readFile(file.path, "utf8");
    } catch {
      continue;
    }
    const path = relativePosix(root, file.path);

    if (file.kind === "terraform-version") {
      pins.push(...terraformVersionFilePins(path, scopeOf(root, file.path), contents));
    } else if (file.kind === "tool-versions") {
      pins.push(...toolVersionsPins(path, scopeOf(root, file.path), contents));
    } else if (file.kind === "tf") {
      const scope = scopeOf(root, file.path);
      for (const declaration of parseTerraformFile(contents)) {
        if (declaration.kind !== "required_version") continue;
        pins.push(requiredVersionPin(path, scope, declaration.line, declaration.value));
      }
    } else if (file.kind === "dockerfile") {
      for (const declaration of parseDockerfile(contents)) {
        if (declaration.kind !== "image") continue;
        const found = imagePin(path, declaration.line, `${basename(file.path)} FROM`, declaration.value);
        if (found) pins.push(found);
      }
    } else if (file.kind === "workflow") {
      pins.push(...workflowPins(path, contents));
    } else if (file.kind === "gitlab") {
      for (const item of parseGitlabCi(contents).unclassified) {
        const found = imagePin(path, item.line, "GitLab CI image", item.value);
        if (found) pins.push(found);
      }
    } else if (file.kind === "circleci") {
      const parsed = parseCircleci(contents);
      for (const item of [...parsed.declarations, ...parsed.unclassified]) {
        const found = imagePin(path, item.line, "CircleCI image", item.value);
        if (found) pins.push(found);
      }
    } else {
      for (const item of azureContainerImages(contents)) {
        const found = imagePin(path, item.line, "Azure Pipelines container", item.value);
        if (found) pins.push(found);
      }
    }
  }
  return pins;
}

export const terraformCollector: DriftCollector = { runtime: "terraform", collect, align };

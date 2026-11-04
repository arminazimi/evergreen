import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";

import { parseCircleci } from "../detectors/ci-images/parse-circleci.js";
import { parseGitlabCi } from "../detectors/ci-images/parse-gitlab-ci.js";
import { parseDockerfile } from "../detectors/container/parse-dockerfile.js";
import { parseImageReference } from "../detectors/container/parse-image.js";
import { parseGoMod } from "../detectors/go/parse-go-mod.js";
import { parseGoWork } from "../detectors/go/parse-go-work.js";
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
      if (name === "go.mod") files.push({ path, kind: "go-mod" });
      else if (name === "go.work") files.push({ path, kind: "go-work" });
      else if (name === ".go-version") files.push({ path, kind: "go-version" });
      else if (name === ".tool-versions") files.push({ path, kind: "tool-versions" });
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

/** `actions/setup-go` inputs in one workflow. A matrix reference is followed to the job's literal list. */
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
    const addVersion = (node: unknown, source: string): void => {
      const value = textOf(node);
      if (value !== undefined && value !== "")
        pins.push(
          versionPin(path, lineOf(node as { range?: [number, number, ...unknown[]] | null }), source, value, "pin"),
        );
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
        if (typeof uses !== "string" || !SETUP_GO.test(uses)) continue;
        const inputs = step.get("with", true);
        if (!isMap(inputs)) continue;

        const version = inputs.get("go-version", true) as { value?: unknown } | null;
        if (version && isScalar(version)) {
          const value = textOf(version);
          const key = typeof version.value === "string" ? MATRIX_REFERENCE.exec(version.value.trim())?.[1] : undefined;
          const list = key !== undefined && isMap(matrix) ? matrix.get(key, true) : undefined;
          if (isSeq(list)) for (const item of list.items) addVersion(item, "actions/setup-go matrix");
          else if (value !== undefined)
            pins.push(
              versionPin(
                path,
                lineOf(version as { range?: [number, number, ...unknown[]] | null }),
                "actions/setup-go go-version",
                value,
                "pin",
              ),
            );
        }

        const versionFile = inputs.get("go-version-file", true);
        if (versionFile && isScalar(versionFile)) {
          const value = textOf(versionFile);
          if (value !== undefined && value !== "") {
            pins.push({
              path,
              line: lineOf(versionFile as { range?: [number, number, ...unknown[]] | null }),
              source: "actions/setup-go go-version-file",
              raw: value,
              kind: "pin",
              unresolved: `the version comes from ${value}, which this report reads separately`,
            });
          }
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

function align(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (pin.kind !== "pin") return undefined;
  const version = release.trim().replace(/^go/, "");
  if (!GO_VERSION.test(version)) return undefined;

  if (pin.source === "go.mod toolchain" || pin.source === "go.work toolchain") {
    const match = /^(\s*toolchain\s+)(\S+)(.*)$/.exec(lineText);
    return match ? `${match[1]}go${version}${match[3]}` : undefined;
  }
  if (pin.source === ".go-version") {
    const match = /^(\s*)(\S+)(\s*(?:#.*)?)$/.exec(lineText);
    return match ? `${match[1]}${version}${match[3]}` : undefined;
  }
  if (pin.source === ".tool-versions") {
    const match = /^(\s*golang\s+)(\S+)(\s*(?:#.*)?)$/.exec(lineText);
    return match ? `${match[1]}${version}${match[3]}` : undefined;
  }
  if (pin.source.endsWith(" FROM")) {
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
  if (pin.source === "actions/setup-go go-version") {
    const match = /^(\s*(?:-\s+)?go-version:\s*)(["']?)([^"'\s#]+)(["']?)(.*)$/.exec(lineText);
    return match ? `${match[1]}${match[2]}${version}${match[4]}${match[5]}` : undefined;
  }
  return undefined;
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

    if (file.kind === "go-mod" || file.kind === "go-work") {
      const source = file.kind === "go-mod" ? "go.mod" : "go.work";
      const declarations = file.kind === "go-mod" ? parseGoMod(contents) : parseGoWork(contents);
      for (const declaration of declarations) {
        if (declaration.kind === "require") continue;
        if (declaration.kind === "toolchain")
          pins.push(versionPin(path, declaration.line, `${source} toolchain`, declaration.value, "pin"));
        else pins.push(versionPin(path, declaration.line, `${source} go`, declaration.value, "floor"));
      }
    } else if (file.kind === "go-version") {
      pins.push(...versionFilePins(path, contents));
    } else if (file.kind === "tool-versions") {
      pins.push(...toolVersionsPins(path, contents));
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

export const goDriftCollector: DriftCollector = { runtime: "go", collect, align };

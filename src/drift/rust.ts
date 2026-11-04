import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";

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
      if (name === "rust-toolchain" || name === "rust-toolchain.toml") files.push({ path, kind: "toolchain" });
      else if (name === "Cargo.toml") files.push({ path, kind: "cargo" });
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

/** `rust-toolchain` action inputs and container images in one GitHub Actions workflow. */
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
    const image = (node: unknown, source: string): void => {
      const found = imageValue(node);
      if (found === undefined) return;
      const pin = imagePin(path, found.line, source, found.value);
      if (pin) pins.push(pin);
    };
    const imageValue = (node: unknown): ImageValue | undefined => {
      if (isScalar(node) && typeof node.value === "string" && node.range) {
        return { value: node.value, line: lineCounter.linePos(node.range[0]).line };
      }
      if (isMap(node)) return imageValue(node.get("image", true));
      return undefined;
    };

    for (const job of jobs.items) {
      if (!isMap(job.value)) continue;
      image(job.value.get("container", true), "GitHub Actions container");
      const services = job.value.get("services", true);
      if (isMap(services)) {
        for (const service of services.items) image(service.value, "GitHub Actions service image");
      }

      const steps = job.value.get("steps", true);
      if (!isSeq(steps)) continue;
      for (const step of steps.items) {
        if (!isMap(step)) continue;
        const usesNode = step.get("uses", true);
        const uses = textOf(usesNode);
        if (uses === undefined) continue;

        const dtolnay = DTOLNAY.exec(uses);
        const actionsRs = ACTIONS_RS.test(uses);
        if (dtolnay?.[1] && isScalar(usesNode) && usesNode.range) {
          pins.push(
            versionPin(
              path,
              lineCounter.linePos(usesNode.range[0]).line,
              "dtolnay/rust-toolchain ref",
              dtolnay[1],
              "pin",
            ),
          );
        }
        if (!dtolnay && !actionsRs) continue;

        const inputs = step.get("with", true);
        if (!isMap(inputs)) continue;
        const toolchain = inputs.get("toolchain", true) as {
          value?: unknown;
          range?: [number, number, ...unknown[]];
        } | null;
        if (!toolchain || !isScalar(toolchain)) continue;
        const value = textOf(toolchain);
        if (value === undefined || value === "") continue;
        pins.push(
          versionPin(
            path,
            lineOf(toolchain),
            dtolnay ? "dtolnay/rust-toolchain toolchain" : "actions-rs/toolchain toolchain",
            value,
            "pin",
          ),
        );
      }
    }
    return pins;
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

function alignImage(lineText: string, version: string, suffix: string): string | undefined {
  const match = /(\brust:)([^\s"']+)/.exec(lineText);
  if (!match) return undefined;
  const [, prefix = "", image = ""] = match;
  if (image.includes("@")) return undefined;
  const index = match.index;
  return `${lineText.slice(0, index)}${prefix}${version}${suffix}${lineText.slice(index + match[0].length)}`;
}

function align(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (pin.kind !== "pin" || pin.release === undefined) return undefined;
  const target = releaseParts(release);
  if (target === undefined) return undefined;
  const version = target.release;
  const suffix = releaseParts(pin.raw)?.suffix ?? "";

  if (
    pin.source === "rust-toolchain.toml channel" ||
    (pin.source === "rust-toolchain" && /^\s*channel\s*=/.test(lineText))
  ) {
    const match = /^(\s*channel\s*=\s*)(["'])([^"']*)\2(.*)$/.exec(lineText);
    return match ? `${match[1]}${match[2]}${version}${suffix}${match[2]}${match[4]}` : undefined;
  }
  if (pin.source === "rust-toolchain") {
    const match = /^(\s*)(\S+)(\s*(?:#.*)?)$/.exec(lineText);
    return match ? `${match[1]}${version}${suffix}${match[3]}` : undefined;
  }
  if (pin.source === ".tool-versions") {
    const match = /^(\s*rust\s+)(\S+)(\s*(?:#.*)?)$/.exec(lineText);
    return match ? `${match[1]}${version}${suffix}${match[3]}` : undefined;
  }
  if (pin.source.endsWith(" FROM") || IMAGE_SOURCES.has(pin.source)) {
    return alignImage(lineText, version, suffix);
  }
  if (pin.source === "dtolnay/rust-toolchain ref") {
    const match = /^(\s*(?:-\s*)?uses\s*:\s*["']?dtolnay\/rust-toolchain@)([^\s"'#]+)(["']?(?:\s+#.*)?)$/.exec(
      lineText,
    );
    return match ? `${match[1]}${version}${suffix}${match[3]}` : undefined;
  }
  if (pin.source === "dtolnay/rust-toolchain toolchain" || pin.source === "actions-rs/toolchain toolchain") {
    const match = /^(\s*(?:-\s+)?toolchain\s*:\s*)(["']?)([^"'\s#]+)\2(\s*(?:#.*)?)$/.exec(lineText);
    return match ? `${match[1]}${match[2]}${version}${suffix}${match[2]}${match[4]}` : undefined;
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

    if (file.kind === "toolchain") {
      const source = basename(file.path) === "rust-toolchain.toml" ? "rust-toolchain.toml channel" : "rust-toolchain";
      pins.push(...channel(source, path, contents));
    } else if (file.kind === "cargo") {
      for (const declaration of parseCargoToml(contents)) {
        if (declaration.kind === "rust-version")
          pins.push(versionPin(path, declaration.line, "Cargo.toml rust-version", declaration.value, "floor"));
      }
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

export const rustDriftCollector: DriftCollector = { runtime: "rust", collect, align };

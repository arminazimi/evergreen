import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";

import { parseCircleci } from "../detectors/ci-images/parse-circleci.js";
import { parseGitlabCi } from "../detectors/ci-images/parse-gitlab-ci.js";
import { parseDockerfile } from "../detectors/container/parse-dockerfile.js";
import { parseImageReference } from "../detectors/container/parse-image.js";
import type { ImageReference } from "../detectors/container/parse-image.js";
import { readXml, walk } from "../detectors/dotnet/msbuild-xml.js";
import { parseGlobalJson } from "../detectors/dotnet/parse-global-json.js";
import { parseMsbuild } from "../detectors/dotnet/parse-msbuild.js";
import { setupDotnetVersions } from "../detectors/github-actions-dotnet.js";
import { relativePosix } from "../paths.js";
import type { DriftCollector, RuntimePin } from "./types.js";

/**
 * Collects every .NET version a repository states: the SDK in `global.json`, the target framework of project files
 * and `Directory.Build.props`, Microsoft .NET base images, `actions/setup-dotnet`, and the container images of
 * GitLab CI, CircleCI, and Azure Pipelines. It reads repository files only: no network, no commands, and repository
 * code is never evaluated.
 *
 * Releases use `major.minor` granularity, so SDK `8.0.204`, the tag `8.0-alpine`, and `net8.0` all resolve to `8.0`.
 * `netstandard*` and `netcoreapp` below 5 resolve to their own names and are not compared with `netX.Y`. The entries
 * of one `<TargetFrameworks>` list share a group: they are reported individually but are alternatives, not drift.
 */

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
const PROJECT_FILE = /\.(?:cs|fs|vb)proj$/i;
const AZURE_PIPELINES_NAME = /^azure-pipelines\.ya?ml$/i;
const WORKFLOW_NAME = /\.ya?ml$/i;
const RELEASE = /^\d+\.\d+$/;

const MICROSOFT_REGISTRY = "mcr.microsoft.com";
const DOTNET_IMAGES = new Set([
  "dotnet/sdk",
  "dotnet/aspnet",
  "dotnet/runtime",
  "dotnet/runtime-deps",
  "dotnet/core/sdk",
  "dotnet/core/aspnet",
  "dotnet/core/runtime",
  "dotnet/core/runtime-deps",
]);
const DOTNET_IMAGE_PREFIX = /^mcr\.microsoft\.com\/dotnet\/(?:core\/)?(?:sdk|aspnet|runtime|runtime-deps)(?::|@|$)/i;

type RepositoryFileKind = "global-json" | "msbuild" | "dockerfile" | "workflow" | "gitlab" | "circleci" | "azure";

interface RepositoryFile {
  path: string;
  kind: RepositoryFileKind;
}

interface Resolved {
  release?: string;
  unresolved?: string;
}

/** Which reader a repository file gets; the first rule that matches wins, so the order is the dispatch. */
interface FileKindRule {
  kind: RepositoryFileKind;
  matches: (name: string, directory: string) => boolean;
}

const FILE_KIND_RULES: readonly FileKindRule[] = [
  { kind: "global-json", matches: (name) => name.toLowerCase() === "global.json" },
  { kind: "msbuild", matches: (name) => name.toLowerCase() === "directory.build.props" || PROJECT_FILE.test(name) },
  { kind: "dockerfile", matches: (name) => DOCKERFILE_NAME.test(name) },
  { kind: "gitlab", matches: (name) => name === ".gitlab-ci.yml" },
  { kind: "circleci", matches: (name, directory) => name === "config.yml" && basename(directory) === ".circleci" },
  { kind: "azure", matches: (name) => AZURE_PIPELINES_NAME.test(name) },
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
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await visit(path, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const kind = fileKind(entry.name, directory);
      if (kind !== undefined) files.push({ path, kind });
    }
  }
  await visit(root, 0);
  return files;
}

function releasePair(major: string, minor: string | undefined): Resolved {
  if (minor === undefined || /^[x*]$/i.test(minor)) {
    return { unresolved: "the value names no minor version, so the release line is unknown." };
  }
  return { release: `${Number(major)}.${Number(minor)}` };
}

/** The release line of a literal SDK, `dotnet-version`, or image tag, or why it cannot be read. */
function resolveVersion(value: string): Resolved {
  const trimmed = value.trim();
  if (trimmed === "") return { unresolved: "the value is empty." };
  if (trimmed.includes("$")) return { unresolved: "the value is an expression." };
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(?:\d+|x|\*|\dxx))?/i.exec(trimmed);
  if (!match) return { unresolved: `"${trimmed}" is not a .NET version Evergreen reads.` };
  const [, major = ""] = match;
  return releasePair(major, match[2]);
}

function resolveTag(tag: string | undefined): Resolved {
  if (tag === undefined) return { unresolved: "the image names no tag, so it follows the latest release." };
  const match = /^v?(\d+)(?:\.(\d+))?/.exec(tag);
  if (!match) return { unresolved: `the tag "${tag}" names no .NET release line.` };
  const [, major = ""] = match;
  return releasePair(major, match[2]);
}

/** The target framework moniker as the release line it names, or why it is not compared. */
function resolveTargetFramework(moniker: string): Resolved {
  const value = moniker.trim().toLowerCase();
  if (value === "") return { unresolved: "the target framework is empty." };
  if (value.includes("$(") || value.includes("$")) {
    return { unresolved: "the target framework is an MSBuild property, which Evergreen does not evaluate." };
  }
  const core = /^netcoreapp(\d+)\.(\d+)$/.exec(value);
  if (core) {
    const major = Number(core[1]);
    if (major < 5) return { release: value };
    return { release: `${major}.${Number(core[2])}` };
  }
  if (value.startsWith("netstandard")) return { release: value };
  const modern = /^net(\d+)\.(\d+)(?:-.*)?$/.exec(value);
  if (modern && Number(modern[1]) >= 5) return { release: `${Number(modern[1])}.${Number(modern[2])}` };
  if (/^net4\d{1,2}(?:-.*)?$/.test(value) || /^net[1-3]\d?$/.test(value)) {
    return {
      unresolved:
        "the target is .NET Framework, which follows the Windows lifecycle and is not compared with .NET releases.",
    };
  }
  return { unresolved: `"${moniker.trim()}" is not a .NET release moniker Evergreen reads.` };
}

function addPin(
  pins: RuntimePin[],
  path: string,
  line: number,
  source: string,
  raw: string,
  resolved: Resolved,
  group?: string,
): void {
  pins.push({ path, line, source, raw, kind: "pin", ...(group === undefined ? {} : { group }), ...resolved });
}

function collectGlobalJson(pins: RuntimePin[], path: string, contents: string): void {
  for (const declaration of parseGlobalJson(contents)) {
    addPin(
      pins,
      path,
      declaration.line,
      "global.json sdk.version",
      declaration.value,
      resolveVersion(declaration.value),
    );
  }
}

/** The lines that belong to a `<TargetFrameworks>` element, which are alternatives rather than drift. */
function multiTargetLines(contents: string): Set<number> {
  const lines = new Set<number>();
  const root = readXml(contents);
  if (!root) return lines;
  for (const element of walk(root)) {
    if (element.name.toLowerCase() === "targetframeworks") lines.add(element.line);
  }
  return lines;
}

function collectMsbuild(pins: RuntimePin[], path: string, contents: string): void {
  const declarations = parseMsbuild(contents);
  if (declarations.targets.length === 0) return;
  const multi = multiTargetLines(contents);
  for (const target of declarations.targets) {
    const grouped = multi.has(target.line);
    addPin(
      pins,
      path,
      target.line,
      grouped ? "TargetFrameworks" : "TargetFramework",
      target.value,
      resolveTargetFramework(target.value),
      grouped ? `TargetFrameworks:${path}:${target.line}` : undefined,
    );
  }
}

function isDotnetImage(reference: ImageReference): boolean {
  return reference.registry === MICROSOFT_REGISTRY && DOTNET_IMAGES.has(reference.repository);
}

/** True for a dynamic reference whose literal prefix names a Microsoft .NET image. */
function namesDotnetImage(value: string): boolean {
  return DOTNET_IMAGE_PREFIX.test(value);
}

function imagePin(pins: RuntimePin[], path: string, line: number, source: string, value: string): void {
  const reference = parseImageReference(value);
  if (!reference || !isDotnetImage(reference)) return;
  addPin(pins, path, line, source, value, resolveTag(reference.tag));
}

function collectDockerfile(pins: RuntimePin[], path: string, contents: string): void {
  const source = `${basename(path)} FROM`;
  for (const declaration of parseDockerfile(contents)) {
    if (declaration.kind === "dynamic") {
      if (namesDotnetImage(declaration.value)) {
        addPin(pins, path, declaration.line, source, declaration.value, {
          unresolved: "the image reference is dynamic.",
        });
      }
      continue;
    }
    if (declaration.kind !== "image") continue;
    imagePin(pins, path, declaration.line, source, declaration.value);
  }
}

function collectWorkflow(pins: RuntimePin[], path: string, contents: string): void {
  for (const version of setupDotnetVersions(contents)) {
    const resolved = version.expression ? { unresolved: "the value is an expression." } : resolveVersion(version.value);
    addPin(pins, path, version.line, "actions/setup-dotnet dotnet-version", version.value, resolved);
  }
}

function collectGitlab(pins: RuntimePin[], path: string, contents: string): void {
  for (const reference of parseGitlabCi(contents).unclassified) {
    if (reference.reason === "dynamic") {
      if (namesDotnetImage(reference.value))
        addPin(pins, path, reference.line, "GitLab CI image", reference.value, {
          unresolved: "the image reference is dynamic.",
        });
      continue;
    }
    imagePin(pins, path, reference.line, "GitLab CI image", reference.value);
  }
}

function collectCircleci(pins: RuntimePin[], path: string, contents: string): void {
  const parsed = parseCircleci(contents);
  for (const reference of [...parsed.declarations, ...parsed.unclassified]) {
    if ("reason" in reference && reference.reason === "orb-not-resolved") continue;
    if ("reason" in reference && reference.reason === "dynamic") {
      if (namesDotnetImage(reference.value))
        addPin(pins, path, reference.line, "CircleCI image", reference.value, {
          unresolved: "the image reference is dynamic.",
        });
      continue;
    }
    imagePin(pins, path, reference.line, "CircleCI image", reference.value);
  }
}

/** Literal and map-form `container` images on Azure Pipelines jobs and resources. */
function azureContainerImages(contents: string): Array<{ value: string; line: number }> {
  const lineCounter = new LineCounter();
  const document = parseDocument(contents, { lineCounter, merge: false });
  if (document.errors.length > 0 || !isMap(document.contents)) return [];
  const root = document.contents;
  const images: Array<{ value: string; line: number }> = [];
  const add = (node: unknown): void => {
    if (isMap(node)) {
      add(node.get("image", true));
      return;
    }
    if (isScalar(node) && typeof node.value === "string" && node.range) {
      images.push({ value: node.value, line: lineCounter.linePos(node.range[0]).line });
    }
  };
  const addJobs = (node: unknown): void => {
    if (!isSeq(node)) return;
    for (const job of node.items) if (isMap(job)) add(job.get("container", true));
  };
  add(root.get("container", true));
  addJobs(root.get("jobs", true));
  const stages = root.get("stages", true);
  if (isSeq(stages)) for (const stage of stages.items) if (isMap(stage)) addJobs(stage.get("jobs", true));
  const resources = root.get("resources", true);
  const containers = isMap(resources) ? resources.get("containers", true) : undefined;
  if (isSeq(containers)) for (const container of containers.items) add(container);
  return images;
}

function collectAzure(pins: RuntimePin[], path: string, contents: string): void {
  for (const reference of azureContainerImages(contents)) {
    if (reference.value.includes("$")) {
      if (namesDotnetImage(reference.value))
        addPin(pins, path, reference.line, "Azure Pipelines container", reference.value, {
          unresolved: "the image reference is dynamic.",
        });
      continue;
    }
    imagePin(pins, path, reference.line, "Azure Pipelines container", reference.value);
  }
}

/** The moniker that selects `release` while keeping a platform suffix such as `-windows`. */
function alignMoniker(current: string, release: string): string | undefined {
  const value = current.trim();
  if (value === "" || value.includes("$")) return undefined;
  const modern = /^(net\d+\.\d+)((?:-.*)?)$/i.exec(value);
  if (modern) return RELEASE.test(release) ? `net${release}${modern[2]}` : `${release}${modern[2]}`;
  if (/^net(?:standard|coreapp)/i.test(value)) return RELEASE.test(release) ? `net${release}` : release;
  return undefined;
}

function alignGlobalJson(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (!RELEASE.test(release)) return undefined;
  const token = `"${pin.raw}"`;
  const index = lineText.indexOf(token);
  if (index === -1) return undefined;
  return `${lineText.slice(0, index)}"${release}"${lineText.slice(index + token.length)}`;
}

function alignTargetFramework(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (pin.raw.includes("$")) return undefined;
  const match = /^(\s*<TargetFramework\b[^>]*>)([^<]*)(<\/TargetFramework\s*>.*)$/i.exec(lineText);
  if (!match) return undefined;
  const [, open = "", currentRaw = "", close = ""] = match;
  const current = currentRaw.trim();
  const next = alignMoniker(current, release);
  if (next === undefined || next === current) return undefined;
  return `${open}${currentRaw.replace(current, next)}${close}`;
}

function alignFromLine(_pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (!RELEASE.test(release)) return undefined;
  const match = /^(\s*FROM\s+(?:--\S+\s+)*)(\S+)([\s\S]*)$/i.exec(lineText);
  if (!match) return undefined;
  const [, prefix = "", original = "", rest = ""] = match;
  const image = parseImageReference(original);
  if (!image || !isDotnetImage(image) || image.tag === undefined || image.digest !== undefined) return undefined;
  const tag = image.tag.replace(/^\d+\.\d+(?:\.\d+)?/, release);
  if (tag === image.tag) return undefined;
  const colon = original.lastIndexOf(":");
  const withoutTag = colon > original.lastIndexOf("/") ? original.slice(0, colon) : original;
  return `${prefix}${withoutTag}:${tag}${rest}`;
}

function alignSetupDotnet(_pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (!RELEASE.test(release)) return undefined;
  const match = /^(\s*(?:-\s+)?dotnet-version\s*:\s*)(["']?)([^"'\s#]+)(["']?)(\s*(?:#.*)?)$/.exec(lineText);
  if (!match) return undefined;
  const [, prefix = "", quote = "", version = "", closingQuote = "", rest = ""] = match;
  if (version.includes("$")) return undefined;
  return `${prefix}${quote}${release}${closingQuote}${rest}`;
}

/** Which rewriter a pin source gets; the first rule that matches wins, so the order is the dispatch. */
interface AlignRule {
  appliesTo: (source: string) => boolean;
  rewrite: (pin: RuntimePin, lineText: string, release: string) => string | undefined;
}

const ALIGN_RULES: readonly AlignRule[] = [
  { appliesTo: (source) => source === "global.json sdk.version", rewrite: alignGlobalJson },
  { appliesTo: (source) => source === "TargetFramework", rewrite: alignTargetFramework },
  { appliesTo: (source) => source.endsWith(" FROM"), rewrite: alignFromLine },
  { appliesTo: (source) => source === "actions/setup-dotnet dotnet-version", rewrite: alignSetupDotnet },
];

function align(pin: RuntimePin, lineText: string, release: string): string | undefined {
  if (pin.kind !== "pin" || pin.release === undefined) return undefined;
  const rule = ALIGN_RULES.find((entry) => entry.appliesTo(pin.source));
  return rule === undefined ? undefined : rule.rewrite(pin, lineText, release);
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
    if (file.kind === "global-json") collectGlobalJson(pins, path, contents);
    else if (file.kind === "msbuild") collectMsbuild(pins, path, contents);
    else if (file.kind === "dockerfile") collectDockerfile(pins, path, contents);
    else if (file.kind === "workflow") collectWorkflow(pins, path, contents);
    else if (file.kind === "gitlab") collectGitlab(pins, path, contents);
    else if (file.kind === "circleci") collectCircleci(pins, path, contents);
    else collectAzure(pins, path, contents);
  }
  return pins;
}

export const dotnetCollector: DriftCollector = { runtime: "dotnet", collect, align };

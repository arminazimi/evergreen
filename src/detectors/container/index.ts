import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "@velella/ebb/data-source";
import type { UnclassifiedReference } from "../../domain.js";
import { relativePosix } from "../../paths.js";
import { validateRegistryV2 } from "@velella/ebb/registry";
import type { RegistryV2Rule } from "@velella/ebb/registry";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { versContains } from "@velella/ebb/vers";
import { jdkRuleVersion, parseJdkVersion } from "../java/jdk-version.js";
import { parseCompose } from "./parse-compose.js";
import { parseDevcontainer } from "./parse-devcontainer.js";
import { parseDockerfile } from "./parse-dockerfile.js";
import type { Runtime } from "./parse-dockerfile.js";
import { parseImageReference } from "./parse-image.js";
import { findRootfsSnapshots } from "./rootfs.js";
import { required } from "../../required.js";
import type { RootfsOsRelease, RootfsSnapshot } from "./rootfs.js";

/**
 * Finds base images and Dockerfile runtime install commands whose release line has reached end of life,
 * the deprecated Dockerfile `MAINTAINER` instruction and legacy `ENV key value` form,
 * plus the OS and runtimes that ship inside a built image's filesystem.
 *
 * It reads Dockerfile / Containerfile `FROM`, supported `RUN`, and legacy syntax lines plus Compose
 * `services.*.image` values. A version is classified only when every version it can stand for is
 * inside a rule's range, so a floating image tag such as `mysql:8` is not guessed. When the scanned
 * directory is an unpacked root filesystem, or holds a local root filesystem archive, the same
 * reviewed rules judge `os-release` and well-known runtime paths.
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
// Matches every name the detector declares in `inputs.fileNames`: `Dockerfile*`, `Containerfile*`, `*.Dockerfile`, `*.Containerfile`.
const DOCKERFILE_NAME = /^(?:Dockerfile|Containerfile)|\.(?:Dockerfile|Containerfile)$/;
const COMPOSE_NAME = /^(?:docker-)?compose(?:\.[A-Za-z0-9_.-]+)?\.ya?ml$/;
const DEVCONTAINER_NAME = /^devcontainer\.json$/;
const VARIANT =
  /^(?:alpine(?:\d+(?:\.\d+)*)?|slim|bookworm|bullseye|buster|stretch|trixie|jessie|jammy|noble|focal|oracle|oraclelinux\d*|debian|ubuntu|minimal)$/;
const MAINTAINER_RULE = "container.dockerfile.maintainer";
const LEGACY_ENV_RULE = "container.dockerfile.legacy-env-format";

const DEBIAN_CODENAMES = new Map<string, string>([
  ["buzz", "1.1"],
  ["rex", "1.2"],
  ["bo", "1.3"],
  ["hamm", "2.0"],
  ["slink", "2.1"],
  ["potato", "2.2"],
  ["woody", "3.0"],
  ["sarge", "3.1"],
  ["etch", "4"],
  ["lenny", "5"],
  ["squeeze", "6"],
  ["wheezy", "7"],
  ["jessie", "8"],
  ["stretch", "9"],
  ["buster", "10"],
  ["bullseye", "11"],
  ["bookworm", "12"],
  ["trixie", "13"],
  ["forky", "14"],
]);

const UBUNTU_CODENAMES = new Map<string, string>([
  ["warty", "4.10"],
  ["hoary", "5.04"],
  ["breezy", "5.10"],
  ["dapper", "6.06"],
  ["edgy", "6.10"],
  ["feisty", "7.04"],
  ["gutsy", "7.10"],
  ["hardy", "8.04"],
  ["intrepid", "8.10"],
  ["jaunty", "9.04"],
  ["karmic", "9.10"],
  ["lucid", "10.04"],
  ["maverick", "10.10"],
  ["natty", "11.04"],
  ["oneiric", "11.10"],
  ["precise", "12.04"],
  ["quantal", "12.10"],
  ["raring", "13.04"],
  ["saucy", "13.10"],
  ["trusty", "14.04"],
  ["utopic", "14.10"],
  ["vivid", "15.04"],
  ["wily", "15.10"],
  ["xenial", "16.04"],
  ["yakkety", "16.10"],
  ["zesty", "17.04"],
  ["artful", "17.10"],
  ["bionic", "18.04"],
  ["cosmic", "18.10"],
  ["disco", "19.04"],
  ["eoan", "19.10"],
  ["focal", "20.04"],
  ["groovy", "20.10"],
  ["hirsute", "21.04"],
  ["impish", "21.10"],
  ["jammy", "22.04"],
  ["kinetic", "22.10"],
  ["lunar", "23.04"],
  ["mantic", "23.10"],
  ["noble", "24.04"],
  ["oracular", "24.10"],
  ["plucky", "25.04"],
]);

/** Extra suffix parts that mcr.microsoft.com/dotnet tags carry: CPU architectures, image flavors, distros, and Windows builds. */
const DOTNET_VARIANT =
  /^(?:amd64|arm64v8|arm64|arm32v7|chiseled|extra|composite|distroless|cbl|mariner\d+(?:\.\d+)?|azurelinux\d+(?:\.\d+)?|nanoserver|windowsservercore|ltsc20\d\d|\d{4})$/;
/**
 * The .NET images Microsoft publishes on its own registry. Their tags name the .NET release line (`sdk:6.0`,
 * `aspnet:6.0-alpine`), so they are judged with the `dotnet` runtime rules instead of a copy of them (decision in
 * docs/detectors/container.md). `dotnet/core/*` is where the same images lived before .NET 5.
 */
const MICROSOFT_REGISTRY = "mcr.microsoft.com";
const DOTNET_IMAGES = new Set(
  ["sdk", "aspnet", "runtime", "runtime-deps"].flatMap((name) => [`dotnet/${name}`, `dotnet/core/${name}`]),
);
const TAG_VERSION = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-(.+))?$/;
const UNBOUNDED = 999_999;

interface ImageCandidate {
  kind: "image";
  path: string;
  line: number;
  value: string;
  dynamic: boolean;
}

interface RuntimeCandidate {
  kind: "runtime";
  path: string;
  line: number;
  value: string;
  runtime: Runtime;
}

interface MaintainerCandidate {
  kind: "maintainer";
  path: string;
  line: number;
}

interface LegacyEnvCandidate {
  kind: "legacy-env";
  path: string;
  line: number;
  key: string;
}

type Candidate = ImageCandidate | RuntimeCandidate | MaintainerCandidate | LegacyEnvCandidate;

async function candidateFiles(root: string): Promise<string[]> {
  const files: string[] = [];
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
      } else if (
        entry.isFile() &&
        (DOCKERFILE_NAME.test(entry.name) || COMPOSE_NAME.test(entry.name) || DEVCONTAINER_NAME.test(entry.name))
      ) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0);
  return files;
}

async function candidates(root: string): Promise<Candidate[]> {
  const result: Candidate[] = [];
  for (const file of await candidateFiles(root)) {
    let contents: string;
    try {
      contents = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const path = relativePosix(root, file);
    const name = basename(file);
    const declarations = COMPOSE_NAME.test(name)
      ? parseCompose(contents)
      : DEVCONTAINER_NAME.test(name)
        ? parseDevcontainer(contents)
        : parseDockerfile(contents);
    for (const declaration of declarations) {
      if (declaration.kind === "runtime") {
        result.push({
          kind: "runtime",
          path,
          line: declaration.line,
          value: declaration.value,
          runtime: declaration.runtime,
        });
      } else if (declaration.kind === "image" || declaration.kind === "dynamic") {
        result.push({
          kind: "image",
          path,
          line: declaration.line,
          value: declaration.value,
          dynamic: declaration.kind === "dynamic",
        });
      } else if (declaration.kind === "maintainer") {
        result.push({ kind: "maintainer", path, line: declaration.line });
      } else {
        result.push({ kind: "legacy-env", path, line: declaration.line, key: declaration.key });
      }
    }
  }
  return result;
}

const RUNTIME_RULES: Readonly<Record<Runtime, { file: string; purl: string; prefix: string }>> = {
  dotnet: { file: "registry/dotnet.json", purl: "pkg:generic/dotnet", prefix: "dotnet.runtime." },
  golang: { file: "registry/go.json", purl: "pkg:generic/golang", prefix: "go.runtime." },
  java: { file: "registry/java.json", purl: "pkg:generic/java", prefix: "java.jdk." },
  nodejs: { file: "registry/nodejs.json", purl: "pkg:generic/nodejs", prefix: "nodejs.runtime." },
  php: { file: "registry/php.json", purl: "pkg:generic/php", prefix: "php.runtime." },
  python: { file: "registry/python.json", purl: "pkg:generic/python", prefix: "python.runtime." },
  ruby: { file: "registry/ruby.json", purl: "pkg:generic/ruby", prefix: "ruby.runtime." },
};

function versionBounds(runtime: Runtime, value: string): { lowest: string; highest: string } | undefined {
  if (runtime === "java") {
    const parsed = parseJdkVersion(value);
    if (!parsed) return undefined;
    const version = jdkRuleVersion(parsed.major);
    return { lowest: version, highest: version };
  }
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(value);
  if (!match) return undefined;
  const [, major, minor, patch] = match;
  return {
    lowest: `${major}.${minor ?? "0"}.${patch ?? "0"}`,
    highest: `${major}.${minor ?? UNBOUNDED}.${patch ?? UNBOUNDED}`,
  };
}

function matchingRuntimeRule(
  rules: readonly RegistryV2Rule[],
  runtime: Runtime,
  value: string,
): RegistryV2Rule | undefined {
  const bounds = versionBounds(runtime, value);
  if (!bounds) return undefined;
  return rules.find((rule) => {
    try {
      return versContains(rule.vers, bounds.lowest) && versContains(rule.vers, bounds.highest);
    } catch {
      return false;
    }
  });
}

/** The release line an `os-release` names, from `VERSION_ID` or a Debian or Ubuntu codename. */
function osReleaseVersion(osRelease: RootfsOsRelease): string | undefined {
  if (osRelease.versionId !== undefined) return osRelease.versionId;
  const codename = osRelease.codename;
  if (codename === undefined) return undefined;
  return osRelease.id === "ubuntu"
    ? UBUNTU_CODENAMES.get(codename)
    : osRelease.id === "debian"
      ? DEBIAN_CODENAMES.get(codename)
      : undefined;
}

function osVersionBounds(value: string): { lowest: string; highest: string } | undefined {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return undefined;
  const [, major, minor, patch] = match;
  return {
    lowest: `${Number(major)}.${minor === undefined ? "0" : Number(minor)}.${patch === undefined ? "0" : Number(patch)}`,
    highest: `${Number(major)}.${minor === undefined ? UNBOUNDED : Number(minor)}.${patch === undefined ? UNBOUNDED : Number(patch)}`,
  };
}

function matchingOsRule(
  rules: ReadonlyMap<string, RegistryV2Rule[]>,
  osRelease: RootfsOsRelease,
): RegistryV2Rule | undefined {
  const version = osReleaseVersion(osRelease);
  const bounds = version === undefined ? undefined : osVersionBounds(version);
  if (!bounds) return undefined;
  return rules.get(`library/${osRelease.id}`)?.find((rule) => {
    try {
      return versContains(rule.vers, bounds.lowest) && versContains(rule.vers, bounds.highest);
    } catch {
      return false;
    }
  });
}

function rootfsRuleFinding(rule: RegistryV2Rule, path: string, line: number, summary: string): DetectorFinding {
  return {
    id: `${rule.id}:${path}:${line}`,
    ruleId: rule.id,
    title: rule.title,
    summary: `${summary} ${rule.summary}`,
    severity: rule.severity,
    location: { path, line },
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
  };
}

function osFinding(
  snapshot: RootfsSnapshot,
  osRules: ReadonlyMap<string, RegistryV2Rule[]>,
): DetectorFinding | undefined {
  const osRelease = snapshot.osRelease;
  const osRule = osRelease === undefined ? undefined : matchingOsRule(osRules, osRelease);
  if (!osRelease || !osRule) return undefined;
  const description =
    osRelease.prettyName ?? [osRelease.id, osRelease.versionId ?? osRelease.codename].filter(Boolean).join(" ");
  return rootfsRuleFinding(osRule, osRelease.path, osRelease.line, `${osRelease.path} reports ${description}.`);
}

function rootfsFindings(
  snapshots: readonly RootfsSnapshot[],
  osRules: ReadonlyMap<string, RegistryV2Rule[]>,
  runtimeRules: ReadonlyMap<Runtime, RegistryV2Rule[]>,
): DetectorFinding[] {
  const findings: DetectorFinding[] = [];
  for (const snapshot of snapshots) {
    const os = osFinding(snapshot, osRules);
    if (os) findings.push(os);
    for (const evidence of snapshot.runtimes) {
      const rule = matchingRuntimeRule(runtimeRules.get(evidence.runtime) ?? [], evidence.runtime, evidence.version);
      if (!rule) continue;
      const summary = `${evidence.path} ships ${evidence.runtime} ${evidence.version}.`;
      findings.push(rootfsRuleFinding(rule, evidence.path, evidence.line, summary));
    }
  }
  return findings;
}

type TagClass = { kind: "versions"; lowest: string; highest: string } | { kind: "unclassified"; reason: string };

/** Replaces a Debian or Ubuntu codename at the start of a Docker Hub tag with its release number, so `debian:buster` reads as `debian:10`. */
function resolveCodename(repository: string, tag: string): string {
  const name = required(tag.split("-")[0], "tag part");
  const codenames =
    repository === "library/debian" ? DEBIAN_CODENAMES : repository === "library/ubuntu" ? UBUNTU_CODENAMES : undefined;
  const release = codenames?.get(name);
  return release === undefined ? tag : tag.replace(name, release);
}

/** The versions a tag can stand for, or why it cannot be read as a release line. */
function classifyTag(tag: string | undefined, digest: string | undefined, extraVariant?: RegExp): TagClass {
  if (tag === undefined) {
    return {
      kind: "unclassified",
      reason: digest
        ? "the image is pinned by digest only, with no tag naming a release line"
        : "the image has no tag, so it follows the latest release",
    };
  }
  const match = TAG_VERSION.exec(tag);
  if (!match) return { kind: "unclassified", reason: `the tag "${tag}" does not name a release line` };
  const [, major, minor, patch, suffix] = match;
  if (
    suffix !== undefined &&
    !suffix.split("-").every((part) => VARIANT.test(part) || extraVariant?.test(part) === true)
  ) {
    return { kind: "unclassified", reason: `the tag "${tag}" has a suffix Evergreen does not recognize` };
  }
  const lowest = `${major}.${minor ?? "0"}.${patch ?? "0"}`;
  const highest = `${major}.${minor ?? UNBOUNDED}.${patch ?? UNBOUNDED}`;
  return { kind: "versions", lowest, highest };
}

function rulesByRepository(rules: readonly RegistryV2Rule[]): Map<string, RegistryV2Rule[]> {
  const map = new Map<string, RegistryV2Rule[]>();
  for (const rule of rules) {
    const repository = rule.purl.replace(/^pkg:docker\//, "");
    map.set(repository, [...(map.get(repository) ?? []), rule]);
  }
  return map;
}

/** The rules for a Docker Hub image, or the .NET runtime rules for a Microsoft .NET image. */
function rulesFor(
  image: { registry: string; repository: string },
  dockerHub: ReadonlyMap<string, RegistryV2Rule[]>,
  dotnet: readonly RegistryV2Rule[],
): readonly RegistryV2Rule[] | undefined {
  if (image.registry === "docker.io") return dockerHub.get(image.repository);
  if (image.registry === MICROSOFT_REGISTRY && DOTNET_IMAGES.has(image.repository)) return dotnet;
  return undefined;
}

interface CandidateContext {
  rules: ReadonlyMap<string, RegistryV2Rule[]>;
  maintainerRule: RegistryV2Rule | undefined;
  legacyEnvRule: RegistryV2Rule | undefined;
  dotnetRules: readonly RegistryV2Rule[];
  runtimeRules: ReadonlyMap<Runtime, RegistryV2Rule[]>;
}

interface CandidateResult {
  finding?: DetectorFinding;
  unclassified?: Omit<UnclassifiedReference, "detector">;
}

type Location = { path: string; line: number };

async function loadRuntimeRules(
  found: readonly Candidate[],
  rootfs: readonly RootfsSnapshot[],
): Promise<Map<Runtime, RegistryV2Rule[]>> {
  const runtimeRules = new Map<Runtime, RegistryV2Rule[]>();
  const runtimes = new Set<Runtime>([
    ...found
      .filter((candidate): candidate is RuntimeCandidate => candidate.kind === "runtime")
      .map((candidate) => candidate.runtime),
    ...rootfs.flatMap((snapshot) => snapshot.runtimes.map((evidence) => evidence.runtime)),
  ]);
  for (const runtime of runtimes) {
    const source = RUNTIME_RULES[runtime];
    const loaded = validateRegistryV2(await loadDataFile(source.file)).rules;
    runtimeRules.set(
      runtime,
      loaded.filter((rule) => rule.purl === source.purl && rule.id.startsWith(source.prefix)),
    );
  }
  return runtimeRules;
}

function candidateFinding(
  rule: RegistryV2Rule,
  location: Location,
  summary: string,
  withDeadline: boolean,
): DetectorFinding {
  return {
    id: `${rule.id}:${location.path}:${location.line}`,
    ruleId: rule.id,
    title: rule.title,
    summary,
    severity: rule.severity,
    location,
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(withDeadline && rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
  };
}

function analyzeRuntimeCandidate(
  candidate: RuntimeCandidate,
  location: Location,
  context: CandidateContext,
): CandidateResult {
  const rule = matchingRuntimeRule(
    context.runtimeRules.get(candidate.runtime) ?? [],
    candidate.runtime,
    candidate.value,
  );
  if (!rule) return {};
  const summary = `${candidate.path} installs ${candidate.runtime} ${candidate.value}. ${rule.summary}`;
  return { finding: candidateFinding(rule, location, summary, true) };
}

function analyzeMarkerCandidate(
  candidate: MaintainerCandidate | LegacyEnvCandidate,
  location: Location,
  context: CandidateContext,
): CandidateResult {
  const rule = candidate.kind === "maintainer" ? context.maintainerRule : context.legacyEnvRule;
  if (!rule) return {};
  const summary =
    candidate.kind === "maintainer"
      ? `${candidate.path} uses the deprecated MAINTAINER instruction. ${rule.summary}`
      : `${candidate.path} sets ${candidate.key} with the legacy "ENV key value" form. ${rule.summary}`;
  return { finding: candidateFinding(rule, location, summary, false) };
}

function analyzeDynamicImage(
  candidate: ImageCandidate,
  location: Location,
  context: CandidateContext,
): CandidateResult {
  // Only name a reference when its repository part is a literal tracked image, as in node:${VERSION}.
  const repository = required(candidate.value.split(":")[0], "image repository");
  const named = parseImageReference(repository);
  const tracked = named !== undefined && rulesFor(named, context.rules, context.dotnetRules) !== undefined;
  if (!tracked || repository.includes("$")) return {};
  return {
    unclassified: {
      component: named.repository,
      reference: candidate.value,
      reason: "the tag is a build argument or variable, which Evergreen does not expand",
      location,
    },
  };
}

function analyzeImage(candidate: ImageCandidate, location: Location, context: CandidateContext): CandidateResult {
  const image = parseImageReference(candidate.value);
  if (!image) return {};
  const imageRules = rulesFor(image, context.rules, context.dotnetRules);
  if (!imageRules) return {};

  const tag = classifyTag(
    image.registry === "docker.io" && image.tag !== undefined
      ? resolveCodename(image.repository, image.tag)
      : image.tag,
    image.digest,
    image.registry === MICROSOFT_REGISTRY ? DOTNET_VARIANT : undefined,
  );
  if (tag.kind === "unclassified") {
    return { unclassified: { component: image.repository, reference: candidate.value, reason: tag.reason, location } };
  }

  const rule = imageRules.find((item) => versContains(item.vers, tag.lowest) && versContains(item.vers, tag.highest));
  if (rule) {
    return {
      finding: candidateFinding(rule, location, `${candidate.path} uses ${candidate.value}. ${rule.summary}`, true),
    };
  }
  if (imageRules.some((item) => versContains(item.vers, tag.lowest) || versContains(item.vers, tag.highest))) {
    return {
      unclassified: {
        component: image.repository,
        reference: candidate.value,
        reason: `the tag "${image.tag}" is a floating release line that spans supported and unsupported versions`,
        location,
      },
    };
  }
  return {};
}

function analyzeCandidate(candidate: Candidate, context: CandidateContext): CandidateResult {
  const location = { path: candidate.path, line: candidate.line };
  if (candidate.kind === "runtime") return analyzeRuntimeCandidate(candidate, location, context);
  if (candidate.kind === "maintainer" || candidate.kind === "legacy-env")
    return analyzeMarkerCandidate(candidate, location, context);
  return candidate.dynamic
    ? analyzeDynamicImage(candidate, location, context)
    : analyzeImage(candidate, location, context);
}

export class ContainerDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "container";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: [
      "Dockerfile*",
      "Containerfile*",
      "*.Dockerfile",
      "*.Containerfile",
      "docker-compose*.yml",
      "docker-compose*.yaml",
      "compose*.yml",
      "compose*.yaml",
      "devcontainer.json",
      "os-release",
      "node_version.h",
      "VERSION",
      "release",
    ],
    extensions: [".tar", ".tar.gz", ".tgz"],
  };

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const found = await candidates(context.root);
    const rootfs = await findRootfsSnapshots(context.root);
    if (found.length === 0 && rootfs.length === 0) return { findings: [], unclassified: [] };

    const registry = validateRegistryV2(await loadDataFile("registry/container.json"));
    const candidateContext = {
      rules: rulesByRepository(registry.rules),
      maintainerRule: registry.rules.find((rule) => rule.id === MAINTAINER_RULE),
      legacyEnvRule: registry.rules.find((rule) => rule.id === LEGACY_ENV_RULE),
      dotnetRules: validateRegistryV2(await loadDataFile("registry/dotnet.json")).rules.filter(
        (rule) => rule.purl === "pkg:generic/dotnet" && rule.id.startsWith("dotnet.runtime."),
      ),
      runtimeRules: await loadRuntimeRules(found, rootfs),
    };
    const { rules, runtimeRules } = candidateContext;
    const findings: DetectorFinding[] = [];
    const unclassified: Omit<UnclassifiedReference, "detector">[] = [];

    for (const candidate of found) {
      const result = analyzeCandidate(candidate, candidateContext);
      if (result.finding) findings.push(result.finding);
      if (result.unclassified) unclassified.push(result.unclassified);
    }

    findings.push(...rootfsFindings(rootfs, rules, runtimeRules));
    return { findings, unclassified };
  }
}

export const containerDetector = new ContainerDetector();

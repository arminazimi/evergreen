import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import type { UnclassifiedReference } from "../../domain.js";
import { relativePosix } from "../../paths.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type {
  Detector,
  DetectorAnalysis,
  DetectorContext,
  DetectorFinding,
  DetectorInputs,
} from "../../sdk.js";
import { versContains } from "../../vers.js";
import { jdkRuleVersion, parseJdkVersion } from "../java/jdk-version.js";
import { parseCompose } from "./parse-compose.js";
import { parseDockerfile } from "./parse-dockerfile.js";
import type { Runtime } from "./parse-dockerfile.js";
import { parseImageReference } from "./parse-image.js";

/**
 * Finds base images and Dockerfile runtime install commands whose release line has reached end of life.
 *
 * It reads Dockerfile / Containerfile `FROM` and supported `RUN` lines plus Compose
 * `services.*.image` values. A version is classified only when every version it can stand for is
 * inside a rule's range, so a floating image tag such as `mysql:8` is not guessed.
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
const DOCKERFILE_NAME =
  /^(?:Dockerfile|Containerfile)(?:\.[A-Za-z0-9_.-]+)?$|\.(?:Dockerfile|Containerfile)$/;
const COMPOSE_NAME = /^(?:docker-)?compose(?:\.[A-Za-z0-9_.-]+)?\.ya?ml$/;
const VARIANT =
  /^(?:alpine(?:\d+(?:\.\d+)*)?|slim|bookworm|bullseye|buster|stretch|trixie|jessie|jammy|noble|focal|oracle|oraclelinux\d*|debian|ubuntu|minimal)$/;

const DEBIAN_CODENAMES: Record<string, string> = {
  buzz: "1.1",
  rex: "1.2",
  bo: "1.3",
  hamm: "2.0",
  slink: "2.1",
  potato: "2.2",
  woody: "3.0",
  sarge: "3.1",
  etch: "4",
  lenny: "5",
  squeeze: "6",
  wheezy: "7",
  jessie: "8",
  stretch: "9",
  buster: "10",
  bullseye: "11",
  bookworm: "12",
  trixie: "13",
  forky: "14",
};

const UBUNTU_CODENAMES: Record<string, string> = {
  warty: "4.10",
  hoary: "5.04",
  breezy: "5.10",
  dapper: "6.06",
  edgy: "6.10",
  feisty: "7.04",
  gutsy: "7.10",
  hardy: "8.04",
  intrepid: "8.10",
  jaunty: "9.04",
  karmic: "9.10",
  lucid: "10.04",
  maverick: "10.10",
  natty: "11.04",
  oneiric: "11.10",
  precise: "12.04",
  quantal: "12.10",
  raring: "13.04",
  saucy: "13.10",
  trusty: "14.04",
  utopic: "14.10",
  vivid: "15.04",
  wily: "15.10",
  xenial: "16.04",
  yakkety: "16.10",
  zesty: "17.04",
  artful: "17.10",
  bionic: "18.04",
  cosmic: "18.10",
  disco: "19.04",
  eoan: "19.10",
  focal: "20.04",
  groovy: "20.10",
  hirsute: "21.04",
  impish: "21.10",
  jammy: "22.04",
  kinetic: "22.10",
  lunar: "23.04",
  mantic: "23.10",
  noble: "24.04",
  oracular: "24.10",
  plucky: "25.04",
};

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
  ["sdk", "aspnet", "runtime", "runtime-deps"].flatMap((name) => [
    `dotnet/${name}`,
    `dotnet/core/${name}`,
  ]),
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

type Candidate = ImageCandidate | RuntimeCandidate;

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
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name))
          await walk(join(directory, entry.name), depth + 1);
      } else if (
        entry.isFile() &&
        (DOCKERFILE_NAME.test(entry.name) || COMPOSE_NAME.test(entry.name))
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
      } else {
        result.push({
          kind: "image",
          path,
          line: declaration.line,
          value: declaration.value,
          dynamic: declaration.kind === "dynamic",
        });
      }
    }
  }
  return result;
}

const RUNTIME_RULES: Readonly<
  Record<Runtime, { file: string; purl: string; prefix: string }>
> = {
  dotnet: {
    file: "registry/dotnet.json",
    purl: "pkg:generic/dotnet",
    prefix: "dotnet.runtime.",
  },
  golang: {
    file: "registry/go.json",
    purl: "pkg:generic/golang",
    prefix: "go.runtime.",
  },
  java: {
    file: "registry/java.json",
    purl: "pkg:generic/java",
    prefix: "java.jdk.",
  },
  nodejs: {
    file: "registry/nodejs.json",
    purl: "pkg:generic/nodejs",
    prefix: "nodejs.runtime.",
  },
  php: {
    file: "registry/php.json",
    purl: "pkg:generic/php",
    prefix: "php.runtime.",
  },
  python: {
    file: "registry/python.json",
    purl: "pkg:generic/python",
    prefix: "python.runtime.",
  },
  ruby: {
    file: "registry/ruby.json",
    purl: "pkg:generic/ruby",
    prefix: "ruby.runtime.",
  },
};

function versionBounds(
  runtime: Runtime,
  value: string,
): { lowest: string; highest: string } | undefined {
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
      return (
        versContains(rule.vers, bounds.lowest) &&
        versContains(rule.vers, bounds.highest)
      );
    } catch {
      return false;
    }
  });
}

type TagClass =
  | { kind: "versions"; lowest: string; highest: string }
  | { kind: "unclassified"; reason: string };

/** The versions a tag can stand for, or why it cannot be read as a release line. */
function classifyTag(
  tag: string | undefined,
  digest: string | undefined,
  extraVariant?: RegExp,
): TagClass {
  if (tag === undefined) {
    return {
      kind: "unclassified",
      reason: digest
        ? "the image is pinned by digest only, with no tag naming a release line"
        : "the image has no tag, so it follows the latest release",
    };
  }
  const match = TAG_VERSION.exec(tag);
  if (!match)
    return {
      kind: "unclassified",
      reason: `the tag "${tag}" does not name a release line`,
    };
  const [, major, minor, patch, suffix] = match;
  if (
    suffix !== undefined &&
    !suffix
      .split("-")
      .every((part) => VARIANT.test(part) || extraVariant?.test(part) === true)
  ) {
    return {
      kind: "unclassified",
      reason: `the tag "${tag}" has a suffix Evergreen does not recognize`,
    };
  }
  const lowest = `${major}.${minor ?? "0"}.${patch ?? "0"}`;
  const highest = `${major}.${minor ?? UNBOUNDED}.${patch ?? UNBOUNDED}`;
  return { kind: "versions", lowest, highest };
}

function rulesByRepository(
  rules: readonly RegistryV2Rule[],
): Map<string, RegistryV2Rule[]> {
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
  if (
    image.registry === MICROSOFT_REGISTRY &&
    DOTNET_IMAGES.has(image.repository)
  )
    return dotnet;
  return undefined;
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
    ],
  };

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const found = await candidates(context.root);
    if (found.length === 0) return { findings: [], unclassified: [] };

    const registry = validateRegistryV2(
      await loadDataFile("registry/container.json"),
    );
    const rules = rulesByRepository(registry.rules);
    const dotnetRules = validateRegistryV2(
      await loadDataFile("registry/dotnet.json"),
    ).rules.filter(
      (rule) =>
        rule.purl === "pkg:generic/dotnet" &&
        rule.id.startsWith("dotnet.runtime."),
    );
    const runtimeRules = new Map<Runtime, RegistryV2Rule[]>();
    const runtimes = new Set(
      found
        .filter(
          (candidate): candidate is RuntimeCandidate =>
            candidate.kind === "runtime",
        )
        .map((candidate) => candidate.runtime),
    );
    for (const runtime of runtimes) {
      const source = RUNTIME_RULES[runtime];
      const loaded = validateRegistryV2(await loadDataFile(source.file)).rules;
      runtimeRules.set(
        runtime,
        loaded.filter(
          (rule) =>
            rule.purl === source.purl && rule.id.startsWith(source.prefix),
        ),
      );
    }
    const findings: DetectorFinding[] = [];
    const unclassified: Omit<UnclassifiedReference, "detector">[] = [];

    for (const candidate of found) {
      const location = { path: candidate.path, line: candidate.line };
      if (candidate.kind === "runtime") {
        const rule = matchingRuntimeRule(
          runtimeRules.get(candidate.runtime) ?? [],
          candidate.runtime,
          candidate.value,
        );
        if (rule) {
          findings.push({
            id: `${rule.id}:${candidate.path}:${candidate.line}`,
            ruleId: rule.id,
            title: rule.title,
            summary: `${candidate.path} installs ${candidate.runtime} ${candidate.value}. ${rule.summary}`,
            severity: rule.severity,
            location,
            ...(rule.replacement ? { replacement: rule.replacement } : {}),
            ...(rule.deadline ? { deadline: rule.deadline } : {}),
            ...(rule.migration ? { migration: rule.migration } : {}),
            sources: rule.sources,
          });
        }
        continue;
      }
      if (candidate.dynamic) {
        // Only name a reference when its repository part is a literal tracked image, as in node:${VERSION}.
        const repository = candidate.value.split(":")[0]!;
        const named = parseImageReference(repository);
        const tracked =
          named !== undefined &&
          rulesFor(named, rules, dotnetRules) !== undefined;
        if (tracked && !repository.includes("$")) {
          unclassified.push({
            component: named.repository,
            reference: candidate.value,
            reason:
              "the tag is a build argument or variable, which Evergreen does not expand",
            location,
          });
        }
        continue;
      }

      const image = parseImageReference(candidate.value);
      if (!image) continue;
      const imageRules = rulesFor(image, rules, dotnetRules);
      if (!imageRules) continue;

      let resolvedTag = image.tag;
      if (resolvedTag !== undefined && image.registry === "docker.io") {
        const name = resolvedTag.split("-")[0];
        if (name !== undefined) {
          if (image.repository === "library/debian" && DEBIAN_CODENAMES[name]) {
            resolvedTag = resolvedTag.replace(name, DEBIAN_CODENAMES[name]!);
          } else if (
            image.repository === "library/ubuntu" &&
            UBUNTU_CODENAMES[name]
          ) {
            resolvedTag = resolvedTag.replace(name, UBUNTU_CODENAMES[name]!);
          }
        }
      }

      const tag = classifyTag(
        resolvedTag,
        image.digest,
        image.registry === MICROSOFT_REGISTRY ? DOTNET_VARIANT : undefined,
      );
      if (tag.kind === "unclassified") {
        unclassified.push({
          component: image.repository,
          reference: candidate.value,
          reason: tag.reason,
          location,
        });
        continue;
      }

      const rule = imageRules.find(
        (item) =>
          versContains(item.vers, tag.lowest) &&
          versContains(item.vers, tag.highest),
      );
      if (rule) {
        findings.push({
          id: `${rule.id}:${candidate.path}:${candidate.line}`,
          ruleId: rule.id,
          title: rule.title,
          summary: `${candidate.path} uses ${candidate.value}. ${rule.summary}`,
          severity: rule.severity,
          location,
          ...(rule.replacement ? { replacement: rule.replacement } : {}),
          ...(rule.deadline ? { deadline: rule.deadline } : {}),
          ...(rule.migration ? { migration: rule.migration } : {}),
          sources: rule.sources,
        });
      } else if (
        imageRules.some(
          (item) =>
            versContains(item.vers, tag.lowest) ||
            versContains(item.vers, tag.highest),
        )
      ) {
        unclassified.push({
          component: image.repository,
          reference: candidate.value,
          reason: `the tag "${image.tag}" is a floating release line that spans supported and unsupported versions`,
          location,
        });
      }
    }

    return { findings, unclassified };
  }
}

export const containerDetector = new ContainerDetector();

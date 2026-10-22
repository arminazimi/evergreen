import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import type { UnclassifiedReference } from "../../domain.js";
import { relativePosix } from "../../paths.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { versContains } from "../../vers.js";
import { parseCompose } from "./parse-compose.js";
import { parseDockerfile } from "./parse-dockerfile.js";
import { parseImageReference } from "./parse-image.js";

/**
 * Finds base images whose release line has reached a vendor-published end of life.
 *
 * It reads Dockerfile / Containerfile `FROM` lines and Compose `services.*.image` values, and nothing
 * else (see decision 0007). A tag is classified only when every version it can stand for is inside a
 * rule's range, so a floating tag such as `mysql:8` is reported as unclassified, not guessed.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 2000;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);
const DOCKERFILE_NAME = /^(?:Dockerfile|Containerfile)(?:\.[A-Za-z0-9_.-]+)?$|\.(?:Dockerfile|Containerfile)$/;
const COMPOSE_NAME = /^(?:docker-)?compose(?:\.[A-Za-z0-9_.-]+)?\.ya?ml$/;
const VARIANT = /^(?:alpine(?:\d+(?:\.\d+)*)?|slim|bookworm|bullseye|buster|stretch|trixie|jessie|jammy|noble|focal|oracle|oraclelinux\d*|debian|ubuntu|minimal)$/;
/** Extra suffix parts that mcr.microsoft.com/dotnet tags carry: CPU architectures, image flavors, distros, and Windows builds. */
const DOTNET_VARIANT = /^(?:amd64|arm64v8|arm64|arm32v7|chiseled|extra|composite|distroless|cbl|mariner\d+(?:\.\d+)?|azurelinux\d+(?:\.\d+)?|nanoserver|windowsservercore|ltsc20\d\d|\d{4})$/;
/**
 * The .NET images Microsoft publishes on its own registry. Their tags name the .NET release line (`sdk:6.0`,
 * `aspnet:6.0-alpine`), so they are judged with the `dotnet` runtime rules instead of a copy of them (decision in
 * docs/detectors/container.md). `dotnet/core/*` is where the same images lived before .NET 5.
 */
const MICROSOFT_REGISTRY = "mcr.microsoft.com";
const DOTNET_IMAGES = new Set(["sdk", "aspnet", "runtime", "runtime-deps"].flatMap((name) => [`dotnet/${name}`, `dotnet/core/${name}`]));
const TAG_VERSION = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-(.+))?$/;
const UNBOUNDED = 999_999;

interface Candidate {
  path: string;
  line: number;
  value: string;
  dynamic: boolean;
}

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
      } else if (entry.isFile() && (DOCKERFILE_NAME.test(entry.name) || COMPOSE_NAME.test(entry.name))) {
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
    const declarations = COMPOSE_NAME.test(name) ? parseCompose(contents) : parseDockerfile(contents);
    for (const declaration of declarations) {
      result.push({ path, line: declaration.line, value: declaration.value, dynamic: declaration.kind === "dynamic" });
    }
  }
  return result;
}

type TagClass =
  | { kind: "versions"; lowest: string; highest: string }
  | { kind: "unclassified"; reason: string };

/** The versions a tag can stand for, or why it cannot be read as a release line. */
function classifyTag(tag: string | undefined, digest: string | undefined, extraVariant?: RegExp): TagClass {
  if (tag === undefined) {
    return {
      kind: "unclassified",
      reason: digest ? "the image is pinned by digest only, with no tag naming a release line" : "the image has no tag, so it follows the latest release",
    };
  }
  const match = TAG_VERSION.exec(tag);
  if (!match) return { kind: "unclassified", reason: `the tag "${tag}" does not name a release line` };
  const [, major, minor, patch, suffix] = match;
  if (suffix !== undefined && !suffix.split("-").every((part) => VARIANT.test(part) || extraVariant?.test(part) === true)) {
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

export class ContainerDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "container";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    fileNames: ["Dockerfile*", "Containerfile*", "*.Dockerfile", "*.Containerfile", "docker-compose*.yml", "docker-compose*.yaml", "compose*.yml", "compose*.yaml"],
  };

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const found = await candidates(context.root);
    if (found.length === 0) return { findings: [], unclassified: [] };

    const registry = validateRegistryV2(await loadDataFile("registry/container.json"));
    const rules = rulesByRepository(registry.rules);
    const dotnetRules = validateRegistryV2(await loadDataFile("registry/dotnet.json")).rules.filter(
      (rule) => rule.purl === "pkg:generic/dotnet" && rule.id.startsWith("dotnet.runtime."),
    );
    const findings: DetectorFinding[] = [];
    const unclassified: Omit<UnclassifiedReference, "detector">[] = [];

    for (const candidate of found) {
      const location = { path: candidate.path, line: candidate.line };
      if (candidate.dynamic) {
        // Only name a reference when its repository part is a literal tracked image, as in node:${VERSION}.
        const repository = candidate.value.split(":")[0]!;
        const named = parseImageReference(repository);
        const tracked = named !== undefined && rulesFor(named, rules, dotnetRules) !== undefined;
        if (tracked && !repository.includes("$")) {
          unclassified.push({
            component: named.repository,
            reference: candidate.value,
            reason: "the tag is a build argument or variable, which Evergreen does not expand",
            location,
          });
        }
        continue;
      }

      const image = parseImageReference(candidate.value);
      if (!image) continue;
      const imageRules = rulesFor(image, rules, dotnetRules);
      if (!imageRules) continue;

      const tag = classifyTag(image.tag, image.digest, image.registry === MICROSOFT_REGISTRY ? DOTNET_VARIANT : undefined);
      if (tag.kind === "unclassified") {
        unclassified.push({ component: image.repository, reference: candidate.value, reason: tag.reason, location });
        continue;
      }

      const rule = imageRules.find((item) => versContains(item.vers, tag.lowest) && versContains(item.vers, tag.highest));
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
      } else if (imageRules.some((item) => versContains(item.vers, tag.lowest) || versContains(item.vers, tag.highest))) {
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

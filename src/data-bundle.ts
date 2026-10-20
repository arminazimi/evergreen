import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { DEFAULT_MAX_REVIEW_AGE_DAYS, validateRegistryV2 } from "./registry.js";

export const DATA_BUNDLE_SCHEMA_VERSION = "evergreen.data-bundle.v1" as const;

/** The registries a bundle carries, in the order they are listed. The SHA map is carried as kind "sha-map". */
export const BUNDLED_ECOSYSTEMS = ["android", "ci-images", "container", "dotnet", "github-actions", "go", "java", "kubernetes", "nodejs", "npm", "python", "ruby", "rust", "swift"] as const;
const SHA_MAP_PATH = "registry/github-actions-shas.json";

/**
 * Who may sign a data bundle: the keyless Sigstore certificate must carry this OIDC issuer and an identity
 * (the signing workflow's ref) that matches the pattern. The pattern names the repository, the workflow file, and
 * either a data release tag or the main branch (manual runs).
 */
export const DATA_SIGNER = {
  issuer: "https://token.actions.githubusercontent.com",
  identityPattern: "^https://github\\.com/arminazimi/evergreen/\\.github/workflows/data-release\\.yml@refs/(?:tags/data-v\\d{4}\\.\\d{2}\\.\\d{2}(?:\\.\\d+)?|heads/main)$",
} as const;

export interface DataBundleFile {
  path: string;
  kind: "registry" | "sha-map";
  ecosystem?: string;
  schemaVersion?: string;
  rules?: number;
  maxReviewAgeDays?: number;
  sha256: string;
  bytes: number;
}

export interface DataBundleManifest {
  schemaVersion: typeof DATA_BUNDLE_SCHEMA_VERSION;
  version: string;
  createdAt: string;
  minimumEvergreenVersion: string;
  contentDigest: string;
  files: DataBundleFile[];
}

export interface DataBundle {
  manifest: DataBundleManifest;
  files: Record<string, Record<string, unknown>>;
}

export class DataBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataBundleError";
  }
}

/**
 * Canonical JSON: object keys sorted by UTF-16 code unit at every level, no insignificant whitespace, integers
 * only. The same data always gives the same text, whatever the formatting or key order of the source files.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new DataBundleError(`Canonical JSON allows integers only, found ${value}.`);
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new DataBundleError(`Cannot write a ${typeof value} as canonical JSON.`);
}

export const sha256Hex = (text: string | Uint8Array): string => createHash("sha256").update(text).digest("hex");

/** The content address of a set of files: SHA-256 of the sorted "<path> <sha256>" lines. */
export function computeContentDigest(files: Array<{ path: string; sha256: string }>): string {
  const lines = [...files]
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((file) => `${file.path} ${file.sha256}\n`)
    .join("");
  return `sha256:${sha256Hex(lines)}`;
}

function describeFile(path: string, content: Record<string, unknown>): Pick<DataBundleFile, "sha256" | "bytes"> {
  const canonical = canonicalJson(content);
  return { sha256: sha256Hex(canonical), bytes: Buffer.byteLength(canonical, "utf8") };
}

export interface BuildOptions {
  /** Repository (or package) root holding `registry/`. */
  root?: string;
  /** UTC time supplied by the caller, `YYYY-MM-DDTHH:MM:SSZ`. The build never reads a clock. */
  createdAt: string;
  /** Bundles on the same day take a revision: 2026.10.16 is revision 1, 2026.10.16.2 is revision 2. */
  revision?: number;
  minimumEvergreenVersion: string;
}

export function bundleVersion(createdAt: string, revision = 1): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(createdAt)) {
    throw new DataBundleError(`createdAt must be UTC like 2026-10-16T09:30:00Z, received "${createdAt}".`);
  }
  if (!Number.isInteger(revision) || revision < 1) throw new DataBundleError("revision must be a positive integer.");
  const day = createdAt.slice(0, 10).replaceAll("-", ".");
  return revision === 1 ? day : `${day}.${revision}`;
}

async function readJson(root: string, path: string): Promise<Record<string, unknown>> {
  const value = JSON.parse(await readFile(resolve(root, path), "utf8")) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new DataBundleError(`${path} must be a JSON object.`);
  return value as Record<string, unknown>;
}

/** Builds the data bundle from `registry/`: every registry validated, every file digested, nothing time-dependent. */
export async function buildDataBundle(options: BuildOptions): Promise<DataBundle> {
  const root = options.root ?? process.cwd();
  const version = bundleVersion(options.createdAt, options.revision);
  const files: Record<string, Record<string, unknown>> = {};
  const entries: DataBundleFile[] = [];

  for (const ecosystem of BUNDLED_ECOSYSTEMS) {
    const path = `registry/${ecosystem}.json`;
    const content = await readJson(root, path);
    const registry = validateRegistryV2(content);
    if (registry.ecosystem !== ecosystem) throw new DataBundleError(`${path} declares ecosystem "${registry.ecosystem}".`);
    files[path] = content;
    entries.push({
      path,
      kind: "registry",
      ecosystem,
      schemaVersion: registry.schemaVersion,
      rules: registry.rules.length,
      maxReviewAgeDays: registry.freshness?.maxReviewAgeDays ?? DEFAULT_MAX_REVIEW_AGE_DAYS,
      ...describeFile(path, content),
    });
  }

  const shaMap = await readJson(root, SHA_MAP_PATH);
  files[SHA_MAP_PATH] = shaMap;
  entries.push({ path: SHA_MAP_PATH, kind: "sha-map", ...describeFile(SHA_MAP_PATH, shaMap) });

  entries.sort((left, right) => (left.path < right.path ? -1 : 1));
  return {
    manifest: {
      schemaVersion: DATA_BUNDLE_SCHEMA_VERSION,
      version,
      createdAt: options.createdAt,
      minimumEvergreenVersion: options.minimumEvergreenVersion,
      contentDigest: computeContentDigest(entries),
      files: entries,
    },
    files,
  };
}

/** The bytes that are signed and published: the bundle in canonical JSON plus a final newline. */
export const serializeDataBundle = (bundle: DataBundle): string => `${canonicalJson(bundle)}\n`;

/**
 * Checks that a bundle is internally consistent: every listed file is present with the listed digest, size, and
 * registry facts, nothing extra is present, and the content address matches. Returns the problems found.
 */
export function dataBundleIntegrityProblems(bundle: DataBundle): string[] {
  const problems: string[] = [];
  const listed = new Set<string>();
  for (const entry of bundle.manifest.files) {
    if (listed.has(entry.path)) problems.push(`${entry.path} is listed twice.`);
    listed.add(entry.path);
    const content = bundle.files[entry.path];
    if (!content) {
      problems.push(`${entry.path} is listed but missing.`);
      continue;
    }
    let actual: Pick<DataBundleFile, "sha256" | "bytes">;
    try {
      actual = describeFile(entry.path, content);
    } catch (error) {
      problems.push(`${entry.path}: ${(error as Error).message}`);
      continue;
    }
    if (actual.sha256 !== entry.sha256) problems.push(`${entry.path} does not match its digest.`);
    else if (actual.bytes !== entry.bytes) problems.push(`${entry.path} has ${actual.bytes} bytes, not ${entry.bytes}.`);
    if (entry.kind === "registry") {
      try {
        const registry = validateRegistryV2(content);
        if (registry.ecosystem !== entry.ecosystem) problems.push(`${entry.path} declares ecosystem "${registry.ecosystem}", not "${entry.ecosystem}".`);
        if (registry.rules.length !== entry.rules) problems.push(`${entry.path} has ${registry.rules.length} rules, not ${entry.rules}.`);
      } catch (error) {
        problems.push(`${entry.path} is not a valid registry: ${(error as Error).message.split("\n")[0]}`);
      }
    }
  }
  for (const path of Object.keys(bundle.files)) if (!listed.has(path)) problems.push(`${path} is present but not listed.`);
  if (computeContentDigest(bundle.manifest.files) !== bundle.manifest.contentDigest) problems.push("The content digest does not match the listed files.");
  return problems;
}

const VERSION_PATTERN = /^\d{4}\.(?:0[1-9]|1[0-2])\.(?:0[1-9]|[12]\d|3[01])(?:\.[1-9]\d*)?$/;
const CREATED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PATH_PATTERN = /^registry\/[a-z0-9][a-z0-9-]*\.json$/;

/**
 * Checks the shape of a parsed bundle by hand (the published JSON Schema is the reference; this is the runtime
 * form, so the package needs no schema validator). Returns the problems found; an empty list means the document
 * can be handed to {@link dataBundleIntegrityProblems}.
 */
export function dataBundleShapeProblems(value: unknown): string[] {
  const problems: string[] = [];
  const isObject = (item: unknown): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item);
  if (!isObject(value) || !isObject(value.manifest) || !isObject(value.files)) return ["The bundle must have a manifest and files."];
  const manifest = value.manifest;
  if (manifest.schemaVersion !== DATA_BUNDLE_SCHEMA_VERSION) problems.push(`Unsupported bundle format "${String(manifest.schemaVersion)}".`);
  if (typeof manifest.version !== "string" || !VERSION_PATTERN.test(manifest.version)) problems.push("The version must look like 2026.10.16.");
  if (typeof manifest.createdAt !== "string" || !CREATED_AT_PATTERN.test(manifest.createdAt)) problems.push("createdAt must be UTC like 2026-10-16T09:30:00Z.");
  if (typeof manifest.minimumEvergreenVersion !== "string" || !SEMVER_PATTERN.test(manifest.minimumEvergreenVersion)) problems.push("minimumEvergreenVersion must be a semantic version.");
  if (typeof manifest.contentDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(manifest.contentDigest)) problems.push("The content digest is malformed.");
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    problems.push("The manifest lists no files.");
    return problems;
  }
  for (const entry of manifest.files as unknown[]) {
    if (!isObject(entry) || typeof entry.path !== "string" || !PATH_PATTERN.test(entry.path)) problems.push("A manifest entry has an unsafe or missing path.");
    else if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isInteger(entry.bytes) || (entry.kind !== "registry" && entry.kind !== "sha-map")) problems.push(`${entry.path} has a malformed manifest entry.`);
  }
  for (const [path, content] of Object.entries(value.files)) if (!PATH_PATTERN.test(path) || !isObject(content)) problems.push(`${path} is not a valid bundle file.`);
  return problems;
}

/** The registries and the SHA map a complete bundle must carry, so a partial bundle is never half-used. */
export const REQUIRED_BUNDLE_PATHS: readonly string[] = [...BUNDLED_ECOSYSTEMS.map((ecosystem) => `registry/${ecosystem}.json`), SHA_MAP_PATH];

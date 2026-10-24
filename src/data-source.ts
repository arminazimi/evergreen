import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import semver from "semver";

import {
  dataBundleIntegrityProblems,
  dataBundleShapeProblems,
  DataBundleError,
  REQUIRED_BUNDLE_PATHS,
} from "./data-bundle.js";
import type { DataBundle } from "./data-bundle.js";
import { DataSignatureError, verifyArtifactSignature } from "./data-signature.js";
import type { SignerPolicy, VerifiedSigner } from "./data-signature.js";
import { findPackageFile } from "./package-files.js";
import { VERSION } from "./version.js";

export type DataSourceKind = "bundled" | "cache" | "pinned";

export interface DataSourceInfo {
  source: DataSourceKind;
  /** Bundle version for cached data; the Evergreen release for bundled data. */
  version: string;
  /** When the bundle was built; null for bundled data, which carries no build time. */
  createdAt: string | null;
  contentDigest: string | null;
  /** The most recent review date among the rules in use: how fresh the evidence is. */
  reviewedThrough: string;
  signer: VerifiedSigner | null;
  /** Why cached data was not used, or other things worth showing the user. */
  warnings: string[];
}

export interface ActiveData {
  info: DataSourceInfo;
  /** Reads one data file (for example `registry/npm.json`) as parsed JSON. */
  read(path: string): Promise<unknown>;
}

export interface DataSourceOptions {
  /** Directory holding downloaded data; see {@link defaultCacheDirectory}. */
  cacheDirectory?: string;
  evergreenVersion?: string;
  /**
   * Use exactly this data: a bundle version such as `2026.10.01` that is in the cache, or `bundled` for the data
   * shipped with this release. Unlike the automatic choice, a pin that cannot be met is an error, never a quiet
   * fallback, so a CI run that pins its data either uses it or stops.
   */
  pinnedVersion?: string;
  signerPolicy?: SignerPolicy;
  trustedRoot?: Parameters<typeof verifyArtifactSignature>[3];
  /**
   * Replaces the signature check. Only tests use this, to exercise everything after the signature (format,
   * compatibility, digests, fallback) without a signature made by Evergreen's release workflow, which cannot be
   * produced offline. The default is the real Sigstore verification.
   */
  verifySignature?: (bytes: Uint8Array, signatureJson: string) => VerifiedSigner;
}

export class DataPinError extends Error {
  /** True when the pin is not a data version at all (a usage error), false when it names data that cannot be used. */
  readonly malformed: boolean;

  constructor(message: string, malformed = false) {
    super(message);
    this.malformed = malformed;
    this.name = "DataPinError";
  }
}

export const BUNDLE_FILE = "bundle.json";
export const SIGNATURE_FILE = "bundle.json.sigstore.json";
export const ACTIVE_FILE = "active.json";

/** Where downloaded data lives: `EVERGREEN_DATA_DIR`, else the platform's cache directory. */
export function defaultCacheDirectory(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  if (env.EVERGREEN_DATA_DIR) return env.EVERGREEN_DATA_DIR;
  if (platform === "darwin") return join(home, "Library", "Caches", "evergreen");
  if (platform === "win32") return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "evergreen", "Cache");
  return join(env.XDG_CACHE_HOME ?? join(home, ".cache"), "evergreen");
}

export const cachedBundleDirectory = (cache: string, version: string): string => join(cache, "data", version);

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The latest `provenance.reviewedAt` among the rules of the given registries. */
function reviewedThrough(registries: Array<Record<string, unknown>>): string {
  let latest = "";
  for (const registry of registries) {
    for (const rule of Array.isArray(registry.rules) ? registry.rules : []) {
      const reviewed = isObject(rule) && isObject(rule.provenance) ? rule.provenance.reviewedAt : undefined;
      if (typeof reviewed === "string" && reviewed > latest) latest = reviewed;
    }
  }
  return latest;
}

export interface VerifiedDataBundle {
  bundle: DataBundle;
  signer: VerifiedSigner;
}

/**
 * Verifies a downloaded bundle and refuses it unless everything holds: the signature (checked on the exact bytes,
 * before they are trusted enough to parse), the format, compatibility with this Evergreen, completeness, and the
 * digests of every file. Throws {@link DataBundleError} with the reason.
 */
export function verifyDataBundle(bytes: Uint8Array, signatureJson: string, options: DataSourceOptions = {}): VerifiedDataBundle {
  let signer: VerifiedSigner;
  try {
    signer = options.verifySignature
      ? options.verifySignature(bytes, signatureJson)
      : verifyArtifactSignature(bytes, signatureJson, options.signerPolicy, options.trustedRoot);
  } catch (error) {
    if (error instanceof DataSignatureError) throw new DataBundleError(error.message);
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new DataBundleError("The bundle is not valid JSON.");
  }
  const shape = dataBundleShapeProblems(parsed);
  if (shape.length > 0) throw new DataBundleError(shape[0]!);
  const bundle = parsed as DataBundle;

  const minimum = bundle.manifest.minimumEvergreenVersion;
  if (!semver.gte(options.evergreenVersion ?? VERSION, minimum)) {
    throw new DataBundleError(`The bundle needs Evergreen ${minimum} or newer.`);
  }
  const listed = new Set(bundle.manifest.files.map((file) => file.path));
  const missing = REQUIRED_BUNDLE_PATHS.filter((path) => !listed.has(path));
  if (missing.length > 0) throw new DataBundleError(`The bundle is incomplete: ${missing.join(", ")} missing.`);
  const problems = dataBundleIntegrityProblems(bundle);
  if (problems.length > 0) throw new DataBundleError(problems[0]!);
  return { bundle, signer };
}

async function readBundled(path: string): Promise<unknown> {
  return JSON.parse(await readFile(await findPackageFile(path, import.meta.url), "utf8")) as unknown;
}

async function bundledData(warnings: string[], evergreenVersion: string): Promise<ActiveData> {
  const registries = await Promise.all(REQUIRED_BUNDLE_PATHS.filter((path) => !path.endsWith("-shas.json")).map(readBundled));
  const cache = new Map<string, unknown>();
  return {
    info: {
      source: "bundled",
      version: evergreenVersion,
      createdAt: null,
      contentDigest: null,
      reviewedThrough: reviewedThrough(registries as Array<Record<string, unknown>>),
      signer: null,
      warnings,
    },
    async read(path) {
      if (!cache.has(path)) cache.set(path, await readBundled(path));
      return cache.get(path);
    },
  };
}

/** Loads exactly the pinned data, or throws {@link DataPinError} saying how to get it. */
async function pinnedData(pin: string, cache: string, evergreenVersion: string, options: DataSourceOptions): Promise<ActiveData> {
  if (pin === "bundled") return bundledData([], evergreenVersion);
  if (!/^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/.test(pin)) {
    throw new DataPinError(`"${pin}" is not a data version. Use a version such as 2026.10.01, or "bundled".`, true);
  }
  const directory = cachedBundleDirectory(cache, pin);
  let files: [Buffer, string];
  try {
    files = await Promise.all([readFile(join(directory, BUNDLE_FILE)), readFile(join(directory, SIGNATURE_FILE), "utf8")]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new DataPinError(`Lifecycle data ${pin} is pinned but is not in ${cache}. Download it with: evergreen data update --data-version ${pin}`);
    }
    throw error;
  }
  let verified: VerifiedDataBundle;
  try {
    verified = verifyDataBundle(files[0], files[1], options);
  } catch (error) {
    if (error instanceof DataBundleError) throw new DataPinError(`Lifecycle data ${pin} is pinned but cannot be used: ${error.message}`);
    throw error;
  }
  const { bundle, signer } = verified;
  if (bundle.manifest.version !== pin) throw new DataPinError(`Lifecycle data ${pin} is pinned but the stored bundle says it is version ${bundle.manifest.version}.`);
  return {
    info: {
      source: "pinned",
      version: bundle.manifest.version,
      createdAt: bundle.manifest.createdAt,
      contentDigest: bundle.manifest.contentDigest,
      reviewedThrough: reviewedThrough(Object.values(bundle.files)),
      signer,
      warnings: [],
    },
    async read(path) {
      const content = bundle.files[path];
      if (!content) throw new DataBundleError(`The data bundle has no ${path}.`);
      return content;
    },
  };
}

/**
 * Chooses the data a scan uses. Downloaded data is used only when it verifies completely and is newer than the
 * data bundled with this release; in every other case the bundled data is used and the reason is reported in
 * `info.warnings`. Reads only local files: this function and everything it calls is offline.
 */
export async function resolveActiveData(options: DataSourceOptions = {}): Promise<ActiveData> {
  const evergreenVersion = options.evergreenVersion ?? VERSION;
  const cache = options.cacheDirectory ?? defaultCacheDirectory();
  const warnings: string[] = [];

  if (options.pinnedVersion !== undefined) return pinnedData(options.pinnedVersion, cache, evergreenVersion, options);

  let activeVersion: string | undefined;
  try {
    const active = JSON.parse(await readFile(join(cache, "data", ACTIVE_FILE), "utf8")) as unknown;
    activeVersion = isObject(active) && typeof active.version === "string" ? active.version : undefined;
    if (!activeVersion || !/^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/.test(activeVersion)) {
      warnings.push(`Ignoring downloaded lifecycle data: ${ACTIVE_FILE} does not name a valid version.`);
      activeVersion = undefined;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") warnings.push(`Ignoring downloaded lifecycle data: ${ACTIVE_FILE} is unreadable.`);
  }
  if (!activeVersion) return bundledData(warnings, evergreenVersion);

  const directory = cachedBundleDirectory(cache, activeVersion);
  try {
    const [bytes, signature] = await Promise.all([readFile(join(directory, BUNDLE_FILE)), readFile(join(directory, SIGNATURE_FILE), "utf8")]);
    const verified = verifyDataBundle(bytes, signature, options);
    const bundled = await bundledData([], evergreenVersion);
    if (verified.bundle.manifest.createdAt.slice(0, 10) <= bundled.info.reviewedThrough) {
      return bundledData([`Downloaded lifecycle data ${verified.bundle.manifest.version} is not newer than the data bundled with Evergreen ${evergreenVersion}; using the bundled data.`], evergreenVersion);
    }
    const { bundle, signer } = verified;
    return {
      info: {
        source: "cache",
        version: bundle.manifest.version,
        createdAt: bundle.manifest.createdAt,
        contentDigest: bundle.manifest.contentDigest,
        reviewedThrough: reviewedThrough(Object.values(bundle.files)),
        signer,
        warnings,
      },
      async read(path) {
        const content = bundle.files[path];
        if (!content) throw new DataBundleError(`The data bundle has no ${path}.`);
        return content;
      },
    };
  } catch (error) {
    const reason = error instanceof DataBundleError ? error.message : (error as NodeJS.ErrnoException).code === "ENOENT" ? "its files are missing" : `it could not be read (${(error as Error).message})`;
    warnings.push(`Ignoring downloaded lifecycle data ${activeVersion}: ${reason} Using the data bundled with Evergreen ${evergreenVersion}.`);
    return bundledData(warnings, evergreenVersion);
  }
}

let active: Promise<ActiveData> | undefined;
let configured: DataSourceOptions = {};

/** The data for this process, resolved once with the options set by {@link configureActiveData}. */
export function getActiveData(): Promise<ActiveData> {
  active ??= resolveActiveData(configured);
  return active;
}

/** Sets how this process resolves data (the cache directory, a pinned version) and forgets what was resolved. */
export function configureActiveData(options: DataSourceOptions = {}): void {
  configured = options;
  active = undefined;
}

/** Forgets the resolved data so the next read resolves again (tests, and after `data update`). */
export function resetActiveData(): void {
  active = undefined;
}

/** Reads one data file such as `registry/npm.json` from the active data. */
export async function loadDataFile(path: string): Promise<unknown> {
  return (await getActiveData()).read(path);
}

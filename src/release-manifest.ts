import { createHash } from "node:crypto";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import { verifyArtifactSignature } from "@velella/ebb/data-signature";
import type { VerifiedSigner } from "@velella/ebb/data-signature";
import { findPackageFileSync } from "./package-files.js";
import { EvergreenError } from "./evergreen-error.js";

export const RELEASE_MANIFEST_SCHEMA_VERSION = "evergreen.release-manifest.v1" as const;

/** Where the manifest sits inside the package: under `dist/src`, which `package.json` already ships. */
export const RELEASE_MANIFEST_PATH = "dist/src/release-manifest.json";

/** An optional Sigstore bundle over the manifest. A release that carries one can be verified offline. */
export const RELEASE_SIGNATURE_PATH = `${RELEASE_MANIFEST_PATH}.sigstore.json`;

/**
 * Which workflow may sign a release manifest: the release chain on a version tag, either the orchestrator or the
 * npm publish stage that owns the tarball. The identity is the same shape the binaries and lifecycle data use
 * (see `docs/RELEASING.md`).
 */
export const RELEASE_SIGNER = {
  issuer: "https://token.actions.githubusercontent.com",
  identityPattern:
    "^https://github\\.com/arminazimi/evergreen/\\.github/workflows/(?:release|publish)\\.yml@refs/tags/v\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$",
} as const;

export interface ReleaseManifestFile {
  /** POSIX path relative to the package root. */
  path: string;
  sha256: string;
  bytes: number;
}

export interface ReleaseManifest {
  schemaVersion: typeof RELEASE_MANIFEST_SCHEMA_VERSION;
  name: string;
  version: string;
  files: ReleaseManifestFile[];
}

export class ReleaseManifestError extends EvergreenError {
  constructor(message: string) {
    super("invalid-argument", message);
    this.name = "ReleaseManifestError";
  }
}

/** The directory holding the installed (or checked-out) package's `package.json`. */
export function installedPackageRoot(): string {
  return dirname(findPackageFileSync("package.json", import.meta.url));
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sha256Hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A missing file is expected here; every other read failure means the installation changed under us. */
function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

/** A listed path must stay inside the package: relative, POSIX, and without `..` or empty segments. */
function safeRelativePath(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.startsWith("\\") || path.includes("\\")) return false;
  if (/^[A-Za-z]:/.test(path)) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function insideRoot(root: string, path: string): string {
  const base = resolve(root);
  const full = resolve(base, ...path.split("/"));
  const prefix = base.endsWith(sep) ? base : `${base}${sep}`;
  if (full !== base && !full.startsWith(prefix)) throw new ReleaseManifestError(`${path} leaves the package.`);
  return full;
}

/** The `name` and `version` a package manifests, refusing anything that is not a package root. */
export async function readPackageNameAndVersion(root: string): Promise<{ name: string; version: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  } catch (error) {
    throw new ReleaseManifestError(
      `${root} is not an Evergreen package: its package.json cannot be read (${errorMessage(error)}).`,
    );
  }
  if (!isObject(parsed) || typeof parsed.name !== "string" || typeof parsed.version !== "string") {
    throw new ReleaseManifestError(`${root}/package.json must declare a string name and version.`);
  }
  return { name: parsed.name, version: parsed.version };
}

/** One entry, shape-checked before it is trusted enough to hash a file. */
function parseManifestFile(entry: unknown): ReleaseManifestFile {
  if (
    !isObject(entry) ||
    typeof entry.path !== "string" ||
    typeof entry.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(entry.sha256) ||
    typeof entry.bytes !== "number" ||
    !Number.isSafeInteger(entry.bytes) ||
    entry.bytes < 0
  ) {
    throw new ReleaseManifestError("Each release manifest entry needs a path, a lowercase SHA-256, and a byte count.");
  }
  return { path: entry.path, sha256: entry.sha256, bytes: entry.bytes };
}

/** Reads and shape-checks a manifest, without touching the files it lists. */
export function parseReleaseManifest(text: string): ReleaseManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ReleaseManifestError(`The release manifest is not valid JSON: ${errorMessage(error)}`);
  }
  if (!isObject(parsed) || parsed.schemaVersion !== RELEASE_MANIFEST_SCHEMA_VERSION) {
    throw new ReleaseManifestError(`The release manifest is not ${RELEASE_MANIFEST_SCHEMA_VERSION}.`);
  }
  if (typeof parsed.name !== "string" || typeof parsed.version !== "string" || !Array.isArray(parsed.files)) {
    throw new ReleaseManifestError("The release manifest must declare a string name, version, and files array.");
  }
  if (parsed.files.length === 0) throw new ReleaseManifestError("The release manifest lists no files.");
  const files = parsed.files.map(parseManifestFile);
  return { schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION, name: parsed.name, version: parsed.version, files };
}

/** The manifest bytes, so a signature can cover the exact text that is read. */
export async function readReleaseManifestBytes(root: string): Promise<Uint8Array | undefined> {
  try {
    return await readFile(insideRoot(root, RELEASE_MANIFEST_PATH));
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

export interface ReleaseManifestVerification {
  manifest: ReleaseManifest;
  /** Every listed file that is missing, has a different size, or hashes to different bytes. */
  problems: string[];
}

/**
 * Checks every file a manifest lists against the package on disk. Returns `undefined` when the package carries no
 * manifest, so a version released before manifests existed is reported as unverifiable rather than as a failure.
 * A manifest that exists but cannot be read is a failure: it is evidence that the installation was changed.
 */
export async function verifyReleaseManifest(root: string): Promise<ReleaseManifestVerification | undefined> {
  const raw = await readReleaseManifestBytes(root);
  if (raw === undefined) return undefined;
  const manifest = parseReleaseManifest(Buffer.from(raw).toString("utf8"));
  const problems: string[] = [];
  const pkg = await readPackageNameAndVersion(root).catch((error: unknown) => {
    if (error instanceof ReleaseManifestError) {
      problems.push(error.message);
      return undefined;
    }
    throw error;
  });
  if (pkg !== undefined && (pkg.name !== manifest.name || pkg.version !== manifest.version)) {
    problems.push(
      `package.json says ${pkg.name}@${pkg.version}, but the manifest was written for ${manifest.name}@${manifest.version}.`,
    );
  }

  const listed = new Set<string>();
  for (const file of manifest.files) {
    if (!safeRelativePath(file.path)) {
      problems.push(`${file.path} is not a safe path inside the package.`);
      continue;
    }
    if (listed.has(file.path)) {
      problems.push(`${file.path} is listed twice.`);
      continue;
    }
    listed.add(file.path);
    const full = insideRoot(root, file.path);
    const info = await stat(full).catch(() => undefined);
    if (info === undefined || !info.isFile()) {
      problems.push(`${file.path} is missing.`);
      continue;
    }
    if (info.size !== file.bytes) {
      problems.push(`${file.path} is ${info.size} bytes; the manifest says ${file.bytes}.`);
      continue;
    }
    const digest = sha256Hex(await readFile(full));
    if (digest !== file.sha256) problems.push(`${file.path} does not match its SHA-256 in the manifest.`);
  }

  return { manifest, problems };
}

export type ReleaseSignatureVerifier = (bytes: Uint8Array, signatureJson: string) => VerifiedSigner;

const verifyWithReleasePolicy: ReleaseSignatureVerifier = (bytes, signatureJson) =>
  verifyArtifactSignature(bytes, signatureJson, RELEASE_SIGNER);

export interface ReleaseSignatureCheck {
  /** False when the installation carries no signature bundle; that is a gap, not a failure. */
  checked: boolean;
  signer?: VerifiedSigner;
  problems: string[];
}

/**
 * Verifies the manifest's Sigstore bundle when the installation ships one. Verification is offline against the
 * trusted root bundled with this package. A missing bundle means only that this release cannot prove where the
 * manifest came from; a bundle that does not verify is a failure.
 */
export async function verifyReleaseSignature(
  root: string,
  verify: ReleaseSignatureVerifier = verifyWithReleasePolicy,
): Promise<ReleaseSignatureCheck> {
  const raw = await readReleaseManifestBytes(root);
  if (raw === undefined) return { checked: false, problems: [] };
  let signatureJson: string;
  try {
    signatureJson = await readFile(insideRoot(root, RELEASE_SIGNATURE_PATH), "utf8");
  } catch (error) {
    if (isMissingFile(error)) return { checked: false, problems: [] };
    throw error;
  }
  try {
    return { checked: true, signer: verify(raw, signatureJson), problems: [] };
  } catch (error) {
    return { checked: true, problems: [`The manifest signature did not verify: ${errorMessage(error)}`] };
  }
}

/** The manifest for a known file list, such as the one `npm pack --dry-run` reports. */
export async function buildReleaseManifest(root: string, paths: readonly string[]): Promise<ReleaseManifest> {
  const pkg = await readPackageNameAndVersion(root);
  const files: ReleaseManifestFile[] = [];
  for (const path of [...new Set(paths)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))) {
    if (path === RELEASE_MANIFEST_PATH || path === RELEASE_SIGNATURE_PATH) continue;
    if (!safeRelativePath(path)) throw new ReleaseManifestError(`${path} is not a safe path inside the package.`);
    const bytes = await readFile(insideRoot(root, path));
    files.push({ path, sha256: sha256Hex(bytes), bytes: bytes.byteLength });
  }
  return { schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION, name: pkg.name, version: pkg.version, files };
}

/** Writes `dist/src/release-manifest.json`, returning its path. The bytes are deterministic: no clocks or hosts. */
export async function writeReleaseManifest(root: string, paths: readonly string[]): Promise<string> {
  const manifest = await buildReleaseManifest(root, paths);
  const target = insideRoot(root, RELEASE_MANIFEST_PATH);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`);
  return target;
}

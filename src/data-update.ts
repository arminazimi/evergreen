import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { join } from "node:path";

import { DataBundleError } from "./data-bundle.js";
import {
  ACTIVE_FILE,
  BUNDLE_FILE,
  cachedBundleDirectory,
  defaultCacheDirectory,
  resolveActiveData,
  SIGNATURE_FILE,
  verifyDataBundle,
} from "./data-source.js";
import type { DataSourceOptions, VerifiedDataBundle } from "./data-source.js";

export const DATA_UPDATE_SCHEMA_VERSION = "evergreen.data-update.v1" as const;

/** Where releases are listed. `EVERGREEN_DATA_URL` points this at a mirror or, in tests, a local server. */
export const DEFAULT_RELEASES_URL = "https://api.github.com/repos/arminazimi/evergreen/releases?per_page=30";

const MAXIMUM_BUNDLE_BYTES = 20 * 1024 * 1024;
const MAXIMUM_SIGNATURE_BYTES = 1024 * 1024;
const MAXIMUM_LISTING_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const KEEP_VERSIONS = 3;
const TAG_PATTERN = /^data-v(\d{4}\.\d{2}\.\d{2}(?:\.\d+)?)$/;

export class DataUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataUpdateError";
  }
}

export interface DataUpdateResult {
  schemaVersion: typeof DATA_UPDATE_SCHEMA_VERSION;
  status: "updated" | "up-to-date" | "downloaded";
  /** The data that was active before: its source and version. */
  from: { source: string; version: string };
  /** The data active now. */
  to: { source: string; version: string };
  createdAt: string | null;
  contentDigest: string | null;
  signer: { identity: string; issuer: string } | null;
  /** Rules per registry, before and after, for what changed. */
  rules: Record<string, { before: number | null; after: number }>;
  cacheDirectory: string;
}

export interface DataUpdateOptions extends DataSourceOptions {
  /**
   * Download this exact bundle version (to pin it) instead of the newest. The download is stored beside the others
   * and is not made the active data, so fetching an older version never rolls back what other commands use.
   */
  version?: string;
  releasesUrl?: string;
  /** Accept a bundle older than the active data. Never the default: a replayed old bundle is a rollback. */
  allowDowngrade?: boolean;
  fetch?: typeof fetch;
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}
/** The newest release the listing offers that carries a bundle and its signature. */
type LatestRelease = { version: string; bundleUrl: string; signatureUrl: string };

interface Release {
  tag_name: string;
  draft?: boolean;
  assets?: ReleaseAsset[];
}

/** Numeric ordering of bundle versions such as 2026.10.16 and 2026.10.16.2. */
export function compareBundleVersions(left: string, right: string): number {
  const parts = (version: string) => version.split(".").map(Number);
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 1) - (b[index] ?? 1);
    if (difference !== 0) return difference;
  }
  return 0;
}

function assertSafeUrl(url: string, what: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DataUpdateError(`${what} is not a valid URL: ${url}`);
  }
  const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    throw new DataUpdateError(`${what} must use https (plain http is allowed only for localhost): ${url}`);
  }
  return parsed;
}

async function download(url: string, limit: number, what: string, request: typeof fetch): Promise<Uint8Array> {
  assertSafeUrl(url, what);
  let response: Response;
  try {
    response = await request(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "user-agent": "evergreen-data-update", accept: "application/octet-stream, application/json" },
    });
  } catch (error) {
    throw new DataUpdateError(
      `Could not download ${what}: ${(error as Error).message}${(error as { cause?: Error }).cause ? ` (${(error as { cause: Error }).cause.message})` : ""}`,
    );
  }
  if (!response.ok) throw new DataUpdateError(`Could not download ${what}: HTTP ${response.status}.`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > limit) throw new DataUpdateError(`${what} is larger than the ${limit}-byte limit.`);
  const chunks: Uint8Array[] = [];
  let received = 0;
  for await (const chunk of response.body ?? []) {
    received += chunk.length;
    if (received > limit) throw new DataUpdateError(`${what} is larger than the ${limit}-byte limit.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** The newest `data-v…` release that has both a bundle and its signature. */
export function latestDataRelease(releases: Release[], only?: string): LatestRelease | undefined {
  let best: LatestRelease | undefined;
  for (const release of releases) {
    const version = TAG_PATTERN.exec(release.tag_name)?.[1];
    if (!version || release.draft || (only !== undefined && version !== only)) continue;
    const bundle = release.assets?.find((asset) => asset.name === `evergreen-data-${version}.json`);
    const signature = release.assets?.find((asset) => asset.name === `evergreen-data-${version}.json.sigstore.json`);
    if (!bundle || !signature) continue;
    if (!best || compareBundleVersions(version, best.version) > 0) {
      best = { version, bundleUrl: bundle.browser_download_url, signatureUrl: signature.browser_download_url };
    }
  }
  return best;
}

function rulesByRegistry(files: Record<string, Record<string, unknown>>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(files)
      .filter(([path]) => !path.endsWith("-shas.json"))
      .map(([path, content]) => [
        path.replace(/^registry\//, "").replace(/\.json$/, ""),
        Array.isArray(content.rules) ? content.rules.length : 0,
      ]),
  );
}

async function writeAtomically(path: string, content: string | Uint8Array): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

async function prune(cache: string, keep: string): Promise<void> {
  const entries = (await readdir(join(cache, "data"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/.test(entry.name))
    .map((entry) => entry.name);
  const stale = entries
    .filter((name) => name !== keep)
    .sort(compareBundleVersions)
    .reverse()
    .slice(KEEP_VERSIONS - 1);
  await Promise.all(stale.map((name) => rm(join(cache, "data", name), { recursive: true, force: true })));
}

type ActiveData = Awaited<ReturnType<typeof resolveActiveData>>;
type ActiveInfo = ActiveData["info"];
type UpdateStamp = Pick<DataUpdateResult, "createdAt" | "contentDigest" | "signer">;

/** Everything the update decided once the bundle is verified, before anything is written. */
interface PendingUpdate {
  before: ActiveData;
  bytes: Uint8Array;
  signature: string;
  bundle: VerifiedDataBundle["bundle"];
  signer: DataUpdateResult["signer"];
  rules: DataUpdateResult["rules"];
  cache: string;
}

function describeSource(info: { source: string; version: string }): { source: string; version: string } {
  return { source: info.source, version: info.version };
}

/** The newest release the listing offers (or the exact one asked for); its absence is an error. */
async function findLatestRelease(
  releasesUrl: string,
  version: string | undefined,
  request: typeof fetch,
): Promise<LatestRelease> {
  const listing = await download(releasesUrl, MAXIMUM_LISTING_BYTES, "the release list", request);
  let releases: Release[];
  try {
    releases = JSON.parse(Buffer.from(listing).toString("utf8")) as Release[];
    if (!Array.isArray(releases)) throw new Error("not a list");
  } catch {
    throw new DataUpdateError("The release list is not valid JSON.");
  }
  const latest = latestDataRelease(releases, version);
  if (!latest)
    throw new DataUpdateError(
      version ? `No signed data release ${version} was found.` : "No signed data release was found.",
    );
  return latest;
}

/** Checks the signature and the signed version. Any failure refuses the whole download. */
function verifyRelease(
  latest: LatestRelease,
  bytes: Uint8Array,
  signature: string,
  options: DataUpdateOptions,
): VerifiedDataBundle {
  let verified: VerifiedDataBundle;
  try {
    verified = verifyDataBundle(bytes, signature, options);
  } catch (error) {
    if (error instanceof DataBundleError)
      throw new DataUpdateError(`Refusing data bundle ${latest.version}: ${error.message}`);
    throw error;
  }
  if (verified.bundle.manifest.version !== latest.version) {
    throw new DataUpdateError(
      `Refusing data bundle ${latest.version}: the signed bundle says it is version ${verified.bundle.manifest.version}.`,
    );
  }
  return verified;
}

/** Rules per registry before and after the update, for what changed. */
async function ruleChanges(
  before: ActiveData,
  files: VerifiedDataBundle["bundle"]["files"],
): Promise<DataUpdateResult["rules"]> {
  const rulesBefore = rulesByRegistry(
    Object.fromEntries(
      await Promise.all(
        Object.keys(files).map(async (path) => [path, (await before.read(path)) as Record<string, unknown>]),
      ),
    ),
  );
  return Object.fromEntries(
    Object.entries(rulesByRegistry(files)).map(([name, after]) => [name, { before: rulesBefore[name] ?? null, after }]),
  );
}

function upToDateResult(
  current: ActiveInfo,
  rules: DataUpdateResult["rules"],
  cache: string,
  stamp: UpdateStamp,
): DataUpdateResult {
  return {
    schemaVersion: DATA_UPDATE_SCHEMA_VERSION,
    status: "up-to-date",
    from: describeSource(current),
    to: describeSource(current),
    createdAt: stamp.createdAt,
    contentDigest: stamp.contentDigest,
    signer: stamp.signer,
    rules,
    cacheDirectory: cache,
  };
}

/** Refuses a bundle older than the active data unless the user explicitly allowed a downgrade. */
function assertNotRollback(
  current: ActiveInfo,
  manifest: VerifiedDataBundle["bundle"]["manifest"],
  allowDowngrade: boolean | undefined,
): void {
  if (current.source === "cache" && current.createdAt && manifest.createdAt < current.createdAt && !allowDowngrade) {
    throw new DataUpdateError(
      `Refusing data bundle ${manifest.version}: it is older than the active data ${current.version}. A replayed older bundle would roll the rules back.`,
    );
  }
}

/** Replaces the bundle directory with the verified files, all at once: a half-written bundle is never left behind. */
async function stageBundle(directory: string, bytes: Uint8Array, signature: string): Promise<void> {
  const staging = `${directory}.${process.pid}.new`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  await writeFile(join(staging, BUNDLE_FILE), bytes);
  await writeFile(join(staging, SIGNATURE_FILE), signature);
  await rm(directory, { recursive: true, force: true });
  await rename(staging, directory);
}

/**
 * Downloads the newest signed data bundle into the user cache. This is the only place Evergreen uses the network,
 * and it runs only when the user asks. The download is verified completely before anything is written; the cache
 * pointer changes last, atomically, so an interrupted or refused update leaves the previous data in place.
 */
export async function updateData(options: DataUpdateOptions = {}): Promise<DataUpdateResult> {
  const request = options.fetch ?? fetch;
  if (!options.fetch && typeof http.setGlobalProxyFromEnv === "function") http.setGlobalProxyFromEnv();
  const cache = options.cacheDirectory ?? defaultCacheDirectory();
  const releasesUrl = options.releasesUrl ?? process.env.EVERGREEN_DATA_URL ?? DEFAULT_RELEASES_URL;

  if (options.version !== undefined && !/^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/.test(options.version)) {
    throw new DataUpdateError(`"${options.version}" is not a data version. Use a version such as 2026.10.01.`);
  }
  const { pinnedVersion: _ignored, ...sourceOptions } = options;
  const before = await resolveActiveData(sourceOptions);
  const latest = await findLatestRelease(releasesUrl, options.version, request);
  const bytes = await download(latest.bundleUrl, MAXIMUM_BUNDLE_BYTES, `data bundle ${latest.version}`, request);
  const signature = Buffer.from(
    await download(latest.signatureUrl, MAXIMUM_SIGNATURE_BYTES, `the signature of ${latest.version}`, request),
  ).toString("utf8");
  const verified = verifyRelease(latest, bytes, signature, options);
  return applyUpdate(
    {
      before,
      bytes,
      signature,
      bundle: verified.bundle,
      signer: verified.signer,
      rules: await ruleChanges(before, verified.bundle.files),
      cache,
    },
    options,
  );
}

/** Decides what the verified bundle changes on disk, and reports it. Nothing is written when it is already current. */
async function applyUpdate(pending: PendingUpdate, options: DataUpdateOptions): Promise<DataUpdateResult> {
  const { before, bytes, signature, bundle, signer, rules, cache } = pending;
  const current = before.info;
  const version = bundle.manifest.version;
  const directory = cachedBundleDirectory(cache, version);

  if (current.source === "cache" && current.contentDigest === bundle.manifest.contentDigest) {
    return upToDateResult(current, rules, cache, {
      createdAt: current.createdAt,
      contentDigest: current.contentDigest,
      signer: current.signer,
    });
  }
  if (options.version !== undefined) {
    await stageBundle(directory, bytes, signature);
    return {
      schemaVersion: DATA_UPDATE_SCHEMA_VERSION,
      status: "downloaded",
      from: describeSource(current),
      to: { source: "pinned", version },
      createdAt: bundle.manifest.createdAt,
      contentDigest: bundle.manifest.contentDigest,
      signer,
      rules,
      cacheDirectory: cache,
    };
  }
  // The installed release already carries data at least this new, and a download that is not newer is never used.
  if (current.source === "bundled" && bundle.manifest.createdAt.slice(0, 10) <= current.reviewedThrough) {
    return upToDateResult(current, rules, cache, { createdAt: null, contentDigest: null, signer: null });
  }
  assertNotRollback(current, bundle.manifest, options.allowDowngrade);

  await stageBundle(directory, bytes, signature);
  await writeAtomically(join(cache, "data", ACTIVE_FILE), `${JSON.stringify({ version })}\n`);
  await prune(cache, version);

  const after = await resolveActiveData(options);
  return {
    schemaVersion: DATA_UPDATE_SCHEMA_VERSION,
    status: "updated",
    from: describeSource(current),
    to: describeSource(after.info),
    createdAt: after.info.createdAt,
    contentDigest: after.info.contentDigest,
    signer: after.info.signer ?? signer,
    rules,
    cacheDirectory: cache,
  };
}

export function renderDataUpdateText(result: DataUpdateResult): string {
  const lines =
    result.status === "up-to-date"
      ? [`Lifecycle data is up to date: ${result.to.version}.`]
      : result.status === "downloaded"
        ? [
            `Downloaded lifecycle data ${result.to.version}. It is not active until you pin it: evergreen scan --data-version ${result.to.version}, or EVERGREEN_DATA_VERSION=${result.to.version}.`,
          ]
        : [
            `Updated lifecycle data: ${result.from.version} (${result.from.source}) → ${result.to.version} (${result.to.source}).`,
          ];
  const changes = Object.entries(result.rules)
    .map(([name, { before, after }]) =>
      before === null
        ? `${name}: ${after} rules (new)`
        : before === after
          ? undefined
          : `${name}: ${before} → ${after} rules`,
    )
    .filter((line): line is string => line !== undefined);
  if (result.status === "updated")
    lines.push(
      changes.length > 0 ? `Rules: ${changes.join("; ")}.` : "Rule counts are unchanged; the evidence was refreshed.",
    );
  if (result.signer) lines.push(`Signed by: ${result.signer.identity}`);
  lines.push(`Stored in: ${result.cacheDirectory}`);
  return lines.join("\n");
}

import { createHash } from "node:crypto";
import { join } from "node:path";

import { defaultCacheDirectory } from "@velella/ebb/cache-paths";

/**
 * Where Evergreen keeps its caches on disk. This module imports only Node built-ins, so a command that must start
 * fast (`evergreen prompt`) can locate the scan cache without loading the data and signature code.
 */

export { defaultCacheDirectory };

/** Where per-file scan cache data lives: `EVERGREEN_CACHE_DIR`, else `scan-cache` inside Evergreen's cache directory. */
export function defaultScanCacheDirectory(env: NodeJS.ProcessEnv = process.env): string {
  if (env.EVERGREEN_CACHE_DIR) return env.EVERGREEN_CACHE_DIR;
  return join(defaultCacheDirectory(env), "scan-cache");
}

const rootHash = (root: string): string => createHash("sha256").update(root).digest("hex");

/** The file holding the scan manifest of `root`. */
export function scanManifestFile(directory: string, root: string): string {
  return join(directory, "scans", `${rootHash(root)}.json`);
}

/** The directory holding one detector manifest per detector for `root`. */
export function detectorManifestDirectory(directory: string, root: string): string {
  return join(directory, "manifests", rootHash(root));
}

/** The file holding one detector's manifest for `root`. */
export function detectorManifestFile(directory: string, root: string, detectorId: string): string {
  return join(detectorManifestDirectory(directory, root), `${detectorId}.json`);
}

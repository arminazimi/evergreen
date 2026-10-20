import { mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

export const CORPUS_CACHE_ENV = "EVERGREEN_CORPUS_CACHE";

export interface CorpusCacheEntry {
  repository: string;
  commit: string;
}

/** Reads the cache directory from `EVERGREEN_CORPUS_CACHE`; unset or blank means no cache. */
export function resolveCorpusCacheDir(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[CORPUS_CACHE_ENV]?.trim();
  return value ? value : undefined;
}

/** `<owner>__<repo>@<commit>`: pinned commits never change, so the key never needs invalidating. */
export function corpusCacheKey(entry: CorpusCacheEntry): string {
  return `${entry.repository.replace("/", "__")}@${entry.commit}`;
}

export function corpusCachePath(cacheDir: string, entry: CorpusCacheEntry): string {
  return join(cacheDir, corpusCacheKey(entry));
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function isCorpusEntryCached(cacheDir: string, entry: CorpusCacheEntry): Promise<boolean> {
  return isDirectory(corpusCachePath(cacheDir, entry));
}

/**
 * Returns the cached checkout for `entry`, filling it first when absent. `populate` writes a working
 * tree into the directory it is given. The tree is built in a temporary sibling, stripped of `.git`
 * (scans read files only), and renamed into place, so an interrupted run never leaves a half-filled entry.
 */
export async function ensureCorpusCacheEntry(
  cacheDir: string,
  entry: CorpusCacheEntry,
  populate: (directory: string) => Promise<void>,
): Promise<{ path: string; cached: boolean }> {
  const target = corpusCachePath(cacheDir, entry);
  if (await isDirectory(target)) return { path: target, cached: true };

  await mkdir(cacheDir, { recursive: true });
  const staging = await mkdtemp(join(cacheDir, ".incoming-"));
  try {
    await populate(staging);
    await rm(join(staging, ".git"), { recursive: true, force: true });
    try {
      await rename(staging, target);
    } catch (error) {
      // A concurrent run may have filled the same entry first; its copy is identical, so keep it.
      if (!(await isDirectory(target))) throw error;
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return { path: target, cached: false };
}

import { lstat, mkdir, mkdtemp, readdir, rename, rm, stat, utimes } from "node:fs/promises";
import { homedir } from "node:os";
import { join, parse, resolve } from "node:path";

import { directorySize } from "./corpus-cost.js";

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
  if (await isDirectory(target)) {
    // Mark the entry as just used, so pruning by size evicts the least recently used one.
    const now = new Date();
    await utimes(target, now, now).catch(() => undefined);
    return { path: target, cached: true };
  }

  await mkdir(cacheDir, { recursive: true });
  const staging = await mkdtemp(join(cacheDir, ".incoming-"));
  // Concurrent fetches can leave pack files briefly busy; Node retries ENOTEMPTY/EBUSY when asked.
  const remove = (path: string) => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  try {
    await populate(staging);
    await remove(join(staging, ".git"));
    try {
      await rename(staging, target);
    } catch (error) {
      // A concurrent run may have filled the same entry first; its copy is identical, so keep it.
      if (!(await isDirectory(target))) throw error;
    }
  } finally {
    await remove(staging);
  }
  return { path: target, cached: false };
}

/** The only names `prune` will ever touch: `<owner>__<repo>@<40-hex commit>`. */
const CACHE_ENTRY_NAME = /^[^/\\@]+__[^/\\@]+@[0-9a-f]{40}$/;

export interface CorpusCacheListing {
  name: string;
  path: string;
  bytes: number;
  /** Last use: set when the entry is created and refreshed on every cache hit. */
  lastUsedMs: number;
}

/** Refuses an empty or root-like cache path, so a typo cannot point the cache commands at an important directory. */
export function assertSafeCacheDir(dir: string): string {
  const refuse = () =>
    new Error(`Refusing to use "${dir}" as the corpus cache: choose a dedicated directory such as ~/.cache/evergreen-corpus.`);
  if (dir.trim() === "") throw refuse();
  const resolved = resolve(dir);
  const { root } = parse(resolved);
  const depth = resolved.slice(root.length).split(/[\\/]/).filter(Boolean).length;
  if (resolved === root || resolved === resolve(homedir()) || depth < 2) throw refuse();
  return resolved;
}

/** Cache entries on disk, oldest use first. Anything that is not a cache entry name, or is a symbolic link, is ignored. */
export async function listCorpusCache(dir: string): Promise<CorpusCacheListing[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const listings: CorpusCacheListing[] = [];
  for (const name of names.filter((candidate) => CACHE_ENTRY_NAME.test(candidate))) {
    const path = join(dir, name);
    const info = await lstat(path);
    if (!info.isDirectory()) continue;
    listings.push({ name, path, bytes: await directorySize(path), lastUsedMs: info.mtimeMs });
  }
  return listings.sort((left, right) => left.lastUsedMs - right.lastUsedMs || left.name.localeCompare(right.name));
}

export interface PruneOptions {
  /** Remove everything. */
  all?: boolean;
  /** Remove least recently used entries until the cache is at most this many megabytes. */
  maxSizeMb?: number;
}

/**
 * Which entries a prune removes. Plain `prune` removes entries that are no longer in the corpus;
 * `maxSizeMb` removes the least recently used ones until the cache fits; `all` removes everything.
 */
export function planPrune(
  listings: readonly CorpusCacheListing[],
  currentKeys: ReadonlySet<string>,
  options: PruneOptions,
): CorpusCacheListing[] {
  if (options.all && options.maxSizeMb !== undefined) throw new Error("Use either --all or --max-size, not both.");
  if (options.all) return [...listings];
  if (options.maxSizeMb !== undefined) {
    let total = listings.reduce((sum, entry) => sum + entry.bytes, 0);
    const removed: CorpusCacheListing[] = [];
    for (const entry of listings) {
      if (total <= options.maxSizeMb * 1_000_000) break;
      removed.push(entry);
      total -= entry.bytes;
    }
    return removed;
  }
  return listings.filter((entry) => !currentKeys.has(entry.name));
}

/** The entries of `entries` that are not in the cache yet. */
export async function missingCorpusEntries<T extends CorpusCacheEntry>(cacheDir: string, entries: readonly T[]): Promise<T[]> {
  const missing: T[] = [];
  for (const entry of entries) {
    if (!(await isCorpusEntryCached(cacheDir, entry))) missing.push(entry);
  }
  return missing;
}

/** One message naming every missing `repository@commit`, for a run that may not use the network. */
export function describeMissingEntries(missing: readonly CorpusCacheEntry[]): string {
  return `Offline run: ${missing.length} corpus ${missing.length === 1 ? "entry is" : "entries are"} not in the cache. Run "npm run corpus:warm" first, or drop --offline.\n${missing.map((entry) => `  ${entry.repository}@${entry.commit}`).join("\n")}`;
}

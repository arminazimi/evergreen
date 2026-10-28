import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { defaultCacheDirectory } from "./data-source.js";
import type { Finding, UnclassifiedReference } from "./domain.js";
import { toPosixPath } from "./paths.js";

export interface ScanCacheKeyInput {
  readonly filePath: string;
  readonly fileHash: string;
  readonly detectorId: string;
  readonly detectorVersion: string;
  readonly dataVersion: string;
}

export interface ScanCacheEntry {
  readonly filePath: string;
  readonly fileHash: string;
  readonly detectorId: string;
  readonly detectorVersion: string;
  readonly dataVersion: string;
  readonly findings: readonly Finding[];
  readonly unclassified: readonly UnclassifiedReference[];
}

export interface DetectorFileDescriptor {
  readonly path: string;
  readonly hash: string;
}

export interface DetectorManifest {
  readonly detectorId: string;
  readonly detectorVersion: string;
  readonly dataVersion: string;
  readonly files: readonly DetectorFileDescriptor[];
  readonly findings: readonly Finding[];
  readonly unclassified: readonly UnclassifiedReference[];
}

export interface ScanManifest {
  readonly root: string;
  readonly scannedAt: string;
  readonly detectorSignatures: Record<string, string>;
}

/** Computes the SHA-256 digest of file content. */
export function computeFileHash(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Computes a cache key based on file content hash, detector version, and data version.
 * File path and detector id are included to namespace entries cleanly.
 */
export function computeCacheKey(input: ScanCacheKeyInput): string {
  return createHash("sha256")
    .update(`${input.detectorId}:${input.detectorVersion}:${input.dataVersion}:${toPosixPath(input.filePath)}:${input.fileHash}`)
    .digest("hex");
}

/** Where per-file scan cache data lives: `EVERGREEN_CACHE_DIR`, else `scan-cache` inside Evergreen's cache directory. */
export function defaultScanCacheDirectory(env: NodeJS.ProcessEnv = process.env): string {
  if (env.EVERGREEN_CACHE_DIR) return env.EVERGREEN_CACHE_DIR;
  return join(defaultCacheDirectory(env), "scan-cache");
}

async function writeAtomically(targetPath: string, content: string): Promise<void> {
  const dir = dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, targetPath);
}

export class ScanCache {
  readonly directory: string;
  private readonly memoryEntries = new Map<string, ScanCacheEntry>();
  private readonly memoryManifests = new Map<string, DetectorManifest>();
  private readonly memoryScanManifests = new Map<string, ScanManifest>();

  constructor(directory: string = defaultScanCacheDirectory()) {
    this.directory = directory;
  }

  private entryPath(key: string): string {
    return join(this.directory, "entries", `${key}.json`);
  }

  private manifestPath(root: string, detectorId: string): string {
    const rootHash = createHash("sha256").update(root).digest("hex");
    return join(this.directory, "manifests", rootHash, `${detectorId}.json`);
  }

  private scanManifestPath(root: string): string {
    const rootHash = createHash("sha256").update(root).digest("hex");
    return join(this.directory, "scans", `${rootHash}.json`);
  }

  async get(input: ScanCacheKeyInput): Promise<ScanCacheEntry | undefined> {
    const key = computeCacheKey(input);
    const inMemory = this.memoryEntries.get(key);
    if (inMemory) return inMemory;

    const file = this.entryPath(key);
    try {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw) as ScanCacheEntry;
      if (
        parsed.fileHash === input.fileHash &&
        parsed.detectorVersion === input.detectorVersion &&
        parsed.dataVersion === input.dataVersion &&
        parsed.detectorId === input.detectorId &&
        toPosixPath(parsed.filePath) === toPosixPath(input.filePath)
      ) {
        this.memoryEntries.set(key, parsed);
        return parsed;
      }
    } catch {
      // Missing, corrupted, or unreadable -> treat as cache miss
    }
    return undefined;
  }

  async set(entry: ScanCacheEntry): Promise<void> {
    const key = computeCacheKey(entry);
    this.memoryEntries.set(key, entry);
    const file = this.entryPath(key);
    try {
      await writeAtomically(file, JSON.stringify(entry));
    } catch {
      // Cache write error must never fail the scan
    }
  }

  async invalidate(input: ScanCacheKeyInput): Promise<void> {
    const key = computeCacheKey(input);
    this.memoryEntries.delete(key);
    const file = this.entryPath(key);
    await rm(file, { force: true }).catch(() => undefined);
  }

  async getDetectorManifest(
    root: string,
    detectorId: string,
    detectorVersion: string,
    dataVersion: string,
  ): Promise<DetectorManifest | undefined> {
    const memoryKey = `${root}:${detectorId}`;
    const cached = this.memoryManifests.get(memoryKey);
    if (cached) {
      if (cached.detectorVersion === detectorVersion && cached.dataVersion === dataVersion) {
        return cached;
      }
      this.memoryManifests.delete(memoryKey);
      return undefined;
    }

    const file = this.manifestPath(root, detectorId);
    try {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw) as DetectorManifest;
      if (
        parsed.detectorId === detectorId &&
        parsed.detectorVersion === detectorVersion &&
        parsed.dataVersion === dataVersion
      ) {
        this.memoryManifests.set(memoryKey, parsed);
        return parsed;
      }
    } catch {
      // Miss
    }
    return undefined;
  }

  async setDetectorManifest(root: string, manifest: DetectorManifest): Promise<void> {
    const memoryKey = `${root}:${manifest.detectorId}`;
    this.memoryManifests.set(memoryKey, manifest);
    const file = this.manifestPath(root, manifest.detectorId);
    try {
      await writeAtomically(file, JSON.stringify(manifest));
    } catch {
      // Ignore write errors
    }
  }

  async getScanManifest(root: string): Promise<ScanManifest | undefined> {
    const cached = this.memoryScanManifests.get(root);
    if (cached) return cached;

    const file = this.scanManifestPath(root);
    try {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw) as ScanManifest;
      if (parsed.root === root) {
        this.memoryScanManifests.set(root, parsed);
        return parsed;
      }
    } catch {
      // Miss
    }
    return undefined;
  }

  async setScanManifest(manifest: ScanManifest): Promise<void> {
    this.memoryScanManifests.set(manifest.root, manifest);
    const file = this.scanManifestPath(manifest.root);
    try {
      await writeAtomically(file, JSON.stringify(manifest));
    } catch {
      // Ignore write errors
    }
  }

  async clear(): Promise<void> {
    this.memoryEntries.clear();
    this.memoryManifests.clear();
    this.memoryScanManifests.clear();
    await rm(this.directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

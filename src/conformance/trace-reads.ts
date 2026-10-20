import fs from "node:fs";
import fsp from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { toPosixPath } from "../paths.js";

/** Path helpers `relativeInsideRoot` needs; tests pass `path.win32` so the cross-drive case is covered on every host. */
export interface TracePathApi {
  resolve(...paths: string[]): string;
  relative(from: string, to: string): string;
  isAbsolute(path: string): boolean;
  readonly sep: string;
}

const hostPath: TracePathApi = { resolve, relative, isAbsolute, sep };

/**
 * Whether `target` resolves to a path under `base`. On Windows, `relative()` returns an absolute
 * path when the target is on another drive; those must not count as inside the root.
 */
export function relativeInsideRoot(base: string, target: string, pathApi: TracePathApi = hostPath): string | undefined {
  const path = pathApi.relative(pathApi.resolve(base), pathApi.resolve(target));
  // On Windows, `relative` returns an absolute path when the file is on another drive: that is outside the root.
  if (path === "" || pathApi.isAbsolute(path) || path === ".." || path.startsWith(`..${pathApi.sep}`)) return undefined;
  // Always forward slashes: pathApi may be path.win32 even when the host separator is "/".
  return toPosixPath(path).split("\\").join("/");
}

/**
 * Runs `operation` and returns the files under `root` whose contents it opened, as sorted paths relative to `root`
 * with forward slashes. It wraps `readFile`, `open`, `readFileSync`, and `createReadStream`; listing a directory
 * or checking that a path exists is not a read. Files outside `root` (bundled data) are not reported.
 * Only one trace may run at a time.
 */
export async function traceReads(root: string, operation: () => Promise<unknown>): Promise<string[]> {
  const base = resolve(root);
  const seen = new Set<string>();
  const note = (target: unknown): void => {
    if (typeof target !== "string" && !(target instanceof URL) && !Buffer.isBuffer(target)) return;
    const path = relativeInsideRoot(base, target instanceof URL ? target.pathname : target.toString());
    if (path !== undefined) seen.add(path);
  };

  const originals = {
    readFile: fsp.readFile,
    open: fsp.open,
    readFileSync: fs.readFileSync,
    createReadStream: fs.createReadStream,
  };
  fsp.readFile = ((target: unknown, ...rest: unknown[]) => {
    note(target);
    return (originals.readFile as (...args: unknown[]) => unknown).call(fsp, target, ...rest);
  }) as typeof fsp.readFile;
  fsp.open = ((target: unknown, ...rest: unknown[]) => {
    note(target);
    return (originals.open as (...args: unknown[]) => unknown).call(fsp, target, ...rest);
  }) as typeof fsp.open;
  fs.readFileSync = ((target: unknown, ...rest: unknown[]) => {
    note(target);
    return (originals.readFileSync as (...args: unknown[]) => unknown).call(fs, target, ...rest);
  }) as typeof fs.readFileSync;
  fs.createReadStream = ((target: unknown, ...rest: unknown[]) => {
    note(target);
    return (originals.createReadStream as (...args: unknown[]) => unknown).call(fs, target, ...rest);
  }) as typeof fs.createReadStream;
  syncBuiltinESMExports();
  try {
    await operation();
  } finally {
    Object.assign(fsp, { readFile: originals.readFile, open: originals.open });
    Object.assign(fs, { readFileSync: originals.readFileSync, createReadStream: originals.createReadStream });
    syncBuiltinESMExports();
  }
  return [...seen].sort();
}
